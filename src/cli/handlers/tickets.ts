import {
  CONVENTIONAL_TYPES,
  type ConventionalType,
  type TicketItem,
  type TicketLaunchResult,
  type TicketLaunchSelection,
  type TicketSourceKind,
  type TicketPipelineSettings,
  type TicketSourceConfig,
  type TicketSourceOption,
  type TicketQueueView,
  type TicketSurveyResult,
  type WorkspaceCleanResult,
  type WorkspaceCleanSurveyResult
} from '../../shared/ticket-pipeline/ticket-types'
import type { RuntimeWorktreeRecord } from '../../shared/runtime-worktree-contracts'
import type {
  TicketDraftBatch,
  TicketFinding
} from '../../shared/ticket-pipeline/ticket-draft-types'
import { ticketSourceKey } from '../../shared/ticket-pipeline/ticket-source-key'
import type { CommandHandler } from '../dispatch'
import { readTextOrFileFlag } from '../command-body-input'
import { getOptionalStringFlag, getRepeatedStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import {
  formatClean,
  formatCleanSurvey,
  formatItems,
  formatLaunch,
  formatQueue,
  formatSurvey
} from './ticket-format'
import { RuntimeClientError } from '../runtime-client'
import { getOptionalWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'

const SOURCES: readonly TicketSourceKind[] = ['github-issues', 'repo-files']

function isTicketSourceKind(value: string): value is TicketSourceKind {
  return SOURCES.some((source) => source === value)
}

function isConventionalType(value: string): value is ConventionalType {
  return CONVENTIONAL_TYPES.some((type) => type === value)
}

function readSource(flags: Map<string, string | boolean>): TicketSourceKind | undefined {
  const source = getOptionalStringFlag(flags, 'source')
  if (source !== undefined && !isTicketSourceKind(source)) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--source must be one of ${SOURCES.join(', ')}`
    )
  }
  return source
}

function readSelections(flags: Map<string, string | boolean>): TicketLaunchSelection[] {
  const ids = getRepeatedStringFlag(flags, 'ticket')
  if (ids.length === 0) {
    throw new RuntimeClientError('invalid_argument', 'Name at least one --ticket to launch')
  }
  const types = new Map<string, ConventionalType>()
  for (const entry of getRepeatedStringFlag(flags, 'type')) {
    const [id, type] = entry.split('=')
    if (!id || !type || !isConventionalType(type)) {
      throw new RuntimeClientError(
        'invalid_argument',
        `--type takes <ticket-id>=<type>, with type one of ${CONVENTIONAL_TYPES.join(', ')}`
      )
    }
    types.set(id, type)
  }
  return ids.map((id) => {
    const type = types.get(id)
    return type ? { id, type } : { id }
  })
}

async function currentWorktree(
  flags: Map<string, string | boolean>,
  cwd: string,
  client: Parameters<CommandHandler>[0]['client']
): Promise<string> {
  return (
    (await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)) ??
    (await resolveCurrentWorktreeSelector(cwd, client, 'worktree'))
  )
}

/** Matches `auto`, `github-issues`, `linear:<TEAM>` or `jira:<PROJECT>` against what the host can reach. */
async function pickSource(
  client: Parameters<CommandHandler>[0]['client'],
  repo: string,
  value: string
): Promise<TicketSourceConfig> {
  const { result } = await client.call<{ options: TicketSourceOption[] }>('tickets.sourceOptions', {
    repo
  })
  const wanted = value.toLowerCase()
  const match = result.options.find((o) => ticketSourceKey(o.config).toLowerCase() === wanted)
  if (!match) {
    const known = result.options.map((o) => ticketSourceKey(o.config)).join(', ')
    throw new RuntimeClientError(
      'invalid_argument',
      `Unknown source ${value}; choose one of ${known}`
    )
  }
  return match.config
}

function onOff(flags: Map<string, string | boolean>, name: string): boolean | undefined {
  const value = getOptionalStringFlag(flags, name)
  if (value !== undefined && value !== 'on' && value !== 'off') {
    throw new RuntimeClientError('invalid_argument', `--${name} takes on or off`)
  }
  return value === undefined ? undefined : value === 'on'
}

export const TICKET_HANDLERS: Record<string, CommandHandler> = {
  'tickets survey': async ({ flags, client, cwd, json }) => {
    const source = readSource(flags)
    const worktree =
      (await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)) ??
      (await resolveCurrentWorktreeSelector(cwd, client, 'worktree'))
    const result = await client.call<TicketSurveyResult>('tickets.survey', {
      worktree,
      ...(source ? { source } : {})
    })
    printResult(result, json, formatSurvey)
  },
  'tickets launch': async ({ flags, client, cwd, json }) => {
    const source = readSource(flags)
    const tickets = readSelections(flags)
    const worktree =
      (await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)) ??
      (await resolveCurrentWorktreeSelector(cwd, client, 'worktree'))
    const result = await client.call<TicketLaunchResult>(
      'tickets.launch',
      { worktree, tickets, ...(source ? { source } : {}) },
      { timeoutMs: 10 * 60_000 }
    )
    printResult(result, json, formatLaunch)
  },
  'tickets clean': async ({ flags, client, cwd, json }) => {
    const worktree = await currentWorktree(flags, cwd, client)
    const survey = await client.call<WorkspaceCleanSurveyResult>('tickets.cleanSurvey', {
      worktree
    })
    const removable = survey.result.rows.filter((row) => row.verdict === 'remove')
    if (flags.get('apply') !== true || removable.length === 0) {
      printResult(survey, json, formatCleanSurvey)
      return
    }
    const result = await client.call<WorkspaceCleanResult>(
      'tickets.clean',
      { worktree, worktreeIds: removable.map((row) => row.worktreeId) },
      { timeoutMs: 10 * 60_000 }
    )
    printResult(result, json, formatClean)
  },
  'tickets settings': async ({ flags, client, cwd, json }) => {
    const shown = await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
      worktree: await currentWorktree(flags, cwd, client)
    })
    const repo = `id:${shown.result.worktree.repoId}`
    const autoClean = onOff(flags, 'auto-clean')
    const autoMerge = onOff(flags, 'auto-merge')
    const sourceFlag = getOptionalStringFlag(flags, 'source')
    const source = sourceFlag === undefined ? undefined : await pickSource(client, repo, sourceFlag)
    const patch = {
      ...(autoClean !== undefined ? { autoClean } : {}),
      ...(autoMerge !== undefined ? { autoMerge } : {}),
      ...(source ? { source } : {})
    }
    const result = await client.call<TicketPipelineSettings>('tickets.settings', {
      repo,
      ...(Object.keys(patch).length > 0 ? { patch } : {})
    })
    printResult(
      result,
      json,
      (s) =>
        `source: ${ticketSourceKey(s.source)}\nauto-clean: ${s.autoClean ? 'on' : 'off'}\nauto-merge: ${s.autoMerge ? 'on' : 'off'}`
    )
  },
  'tickets queue': async ({ flags, client, cwd, json }) => {
    const worktree = await currentWorktree(flags, cwd, client)
    printResult(
      await client.call<TicketQueueView>('tickets.queue', { worktree }),
      json,
      formatQueue
    )
  },
  'tickets resume': async ({ flags, client, cwd, json }) => {
    const worktree = await currentWorktree(flags, cwd, client)
    const result = await client.call<TicketQueueView>('tickets.queueResume', { worktree })
    printResult(result, json, formatQueue)
  },
  'tickets merge': async ({ flags, client, cwd, json }) => {
    const worktree = await currentWorktree(flags, cwd, client)
    const view = await client.call<TicketQueueView>('tickets.queue', { worktree })
    const head = view.result.entries[0]
    if (!head || head.queue?.status !== 'ready') {
      throw new RuntimeClientError(
        'invalid_argument',
        head
          ? `${head.ticketId} is not ready to merge: ${head.queue?.detail ?? 'waiting for the queue'}`
          : 'No ticket PRs are waiting to merge.'
      )
    }
    const result = await client.call<TicketQueueView>(
      'tickets.merge',
      { itemId: head.itemId },
      { timeoutMs: 5 * 60_000 }
    )
    printResult(result, json, formatQueue)
  },
  'tickets draft submit': async ({ flags, client, cwd, json }) => {
    const batchId = getRequiredStringFlag(flags, 'batch')
    const text = (await readTextOrFileFlag(flags, cwd, 'drafts', true)) ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw new RuntimeClientError(
        'invalid_argument',
        `The drafts are not valid JSON: ${String(error)}`
      )
    }
    const payload = typeof parsed === 'object' && parsed !== null ? parsed : {}
    const result = await client.call<TicketDraftBatch>('tickets.draftSubmit', {
      batchId,
      drafts: 'drafts' in payload ? payload.drafts : undefined,
      decisions: 'decisions' in payload ? payload.decisions : []
    })
    printResult(
      result,
      json,
      (batch) =>
        `${batch.drafts.length} draft${batch.drafts.length === 1 ? '' : 's'} handed to Corka for review.`
    )
  },
  'tickets create': async ({ flags, client, cwd, json }) => {
    const findingOf = getOptionalStringFlag(flags, 'finding-of')
    const result = await client.call<TicketFinding>('tickets.create', {
      worktree: await currentWorktree(flags, cwd, client),
      title: getRequiredStringFlag(flags, 'title'),
      body: (await readTextOrFileFlag(flags, cwd, 'body', true)) ?? '',
      labels: getRepeatedStringFlag(flags, 'label'),
      blockedBy: getRepeatedStringFlag(flags, 'blocked-by'),
      ...(findingOf ? { findingOf } : {})
    })
    printResult(result, json, (finding) => `${finding.id} ${finding.title}\n${finding.url}`)
  },
  'tickets items': async ({ flags, client, json }) => {
    const repo = getOptionalStringFlag(flags, 'repo')
    const result = await client.call<{ items: TicketItem[] }>('tickets.items', repo ? { repo } : {})
    printResult(result, json, formatItems)
  }
}
