import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorkspaceWithOutcome } from '@/lib/workspace/activation/worktree-activation'
import { activateWorktreeAgentPane } from '@/components/sidebar/workspace-card/activity/use-worktree-agent-activation'
import { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { createNonSecureContextUuid } from '../../../../shared/non-secure-context-uuid'
import { agentsByUrgency, isIdleClaude, isWaitingAgent } from './overview-model'
import type { OverviewAgentInput, OverviewWorktreeInput } from './overview-model-types'

export const OVERVIEW_SKILLS = [
  'launch-tickets',
  'merge-tickets',
  'clean-workspaces',
  'write-ticket'
] as const
export type OverviewSkill = (typeof OVERVIEW_SKILLS)[number]

export type OverviewActionResult = { ok: true; message: string } | { ok: false; message: string }

function terminalTarget(agent: OverviewAgentInput) {
  const parsed = parsePaneKey(agent.paneKey)
  return parsed ? { kind: 'terminal' as const, tabId: parsed.tabId, leafId: parsed.leafId } : null
}

function focusAgent(worktree: OverviewWorktreeInput, agent: OverviewAgentInput): boolean {
  const target = terminalTarget(agent)
  // Folder workspaces have no worktree activation path for panes; opening the workspace is enough.
  if (!target || parseWorkspaceKey(worktree.id)?.type === 'folder') {
    return false
  }
  activateWorktreeAgentPane(worktree.id, target.tabId, agent.paneKey)
  return true
}

/** Opens the workspace on the agent that needs you, else its busiest agent. */
export function openOverviewWorkspace(worktree: OverviewWorktreeInput): void {
  const agent = agentsByUrgency(worktree.agents)[0]
  if (agent && focusAgent(worktree, agent)) {
    return
  }
  activateAndRevealWorkspaceWithOutcome(worktree.id, { executionHostId: worktree.executionHostId })
}

export function markOverviewWorkspaceRead(worktree: OverviewWorktreeInput): void {
  useAppStore.getState().setWorkspaceUnreadByUser(worktree.id, false, worktree.executionHostId)
}

async function sendToAgent(
  worktree: OverviewWorktreeInput,
  agent: OverviewAgentInput,
  text: string
): Promise<boolean> {
  const target = terminalTarget(agent)
  if (!target) {
    return false
  }
  const result = await sendMessageToAgent({ worktreeId: worktree.id, target, prompt: text })
  return result.status === 'sent' || result.status === 'unconfirmed'
}

/** Types a reply into the waiting agent, or the workspace's only agent. */
export async function replyToOverviewWorkspace(
  worktree: OverviewWorktreeInput,
  text: string
): Promise<OverviewActionResult> {
  const waiting = worktree.agents.filter(isWaitingAgent)
  const candidates = waiting.length > 0 ? waiting : worktree.agents
  for (const agent of candidates) {
    if (await sendToAgent(worktree, agent, text)) {
      return {
        ok: true,
        message: translate('auto.components.overview.result.replied', 'Replied in {{name}}.', {
          name: worktree.name
        })
      }
    }
  }
  return {
    ok: false,
    message: translate(
      'auto.components.overview.result.replyRefused',
      'No agent in {{name}} took the reply.',
      { name: worktree.name }
    )
  }
}

/** Types `/<skill>` into an idle Claude session in the main workspace, or starts one with it. */
export async function runOverviewSkill(
  main: OverviewWorktreeInput,
  projectName: string,
  skill: OverviewSkill,
  args = ''
): Promise<OverviewActionResult> {
  const prompt = args ? `/${skill} ${args}` : `/${skill}`
  for (const agent of main.agents.filter(isIdleClaude)) {
    if (await sendToAgent(main, agent, prompt)) {
      // The skills ask before they act: show the session so the question is seen.
      focusAgent(main, agent)
      return {
        ok: true,
        message: translate(
          'auto.components.overview.result.sentSkill',
          'Sent {{prompt}} to the idle Claude session in {{project}}.',
          { prompt, project: projectName }
        )
      }
    }
  }
  activateAndRevealWorkspaceWithOutcome(main.id, { executionHostId: main.executionHostId })
  const outcome = launchAgentInNewTabWithOutcome({
    requestId: createNonSecureContextUuid(),
    agent: 'claude',
    worktreeId: main.id,
    workspaceExecutionHostId: main.executionHostId,
    prompt,
    launchSource: 'sidebar'
  })
  if (!outcome || 'refused' in outcome) {
    // A refusal is already notified by the launcher.
    return {
      ok: false,
      message: translate(
        'auto.components.overview.result.launchRefused',
        'Claude did not start in {{project}}.',
        { project: projectName }
      )
    }
  }
  return {
    ok: true,
    message: translate(
      'auto.components.overview.result.launched',
      'Started Claude with {{prompt}} in {{project}}.',
      { prompt, project: projectName }
    )
  }
}
