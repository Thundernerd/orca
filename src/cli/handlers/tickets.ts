import {
  CONVENTIONAL_TYPES,
  type ConventionalType,
  type TicketItem,
  type TicketLaunchResult,
  type TicketLaunchSelection,
  type TicketSourceKind,
  type TicketSurveyResult
} from '../../shared/ticket-pipeline/ticket-types'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRepeatedStringFlag } from '../flags'
import { printResult } from '../format'
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

function formatLaunch(result: TicketLaunchResult): string {
  return result.outcomes
    .map((o) =>
      o.status === 'launched'
        ? `launched\t${o.id}\t${o.branch}`
        : `${o.status}\t${o.id}\t${o.reason}`
    )
    .join('\n')
}

function formatItems(result: { items: TicketItem[] }): string {
  if (result.items.length === 0) {
    return 'No launched tickets.'
  }
  return result.items
    .map((item) =>
      [item.stage, item.ticketId, item.ticketTitle, item.reviewUrl ?? item.branch].join('\t')
    )
    .join('\n')
}

function formatSurvey(result: TicketSurveyResult): string {
  const lines = [`source: ${result.source} (${result.baseRef})`]
  for (const row of result.rows) {
    const waiting = row.waitingOn.length > 0 ? row.waitingOn.join(' ') : '-'
    lines.push([row.status, row.ticket.id, row.ticket.title, waiting].join('\t'))
  }
  if (result.rows.length === 0) {
    lines.push('No open tickets.')
  }
  return lines.join('\n')
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
  'tickets items': async ({ flags, client, json }) => {
    const repo = getOptionalStringFlag(flags, 'repo')
    const result = await client.call<{ items: TicketItem[] }>('tickets.items', repo ? { repo } : {})
    printResult(result, json, formatItems)
  }
}
