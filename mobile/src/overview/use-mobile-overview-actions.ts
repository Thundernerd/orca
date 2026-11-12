import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { translate } from '../i18n/mobile-i18n'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { ConnectionState } from '../transport/connection/connection-state'
import { interpretOrThrowRefusalMessage } from '../transport/rpc/rpc-refusal-message'
import { useOpenMobileSession } from '../session/use-open-mobile-session'
import { healMobileNativeChatStaleInput } from '../session/native-chat/composer/mobile-native-chat-stale-input'
import {
  reviewTerminalListRead,
  reviewTerminalSendRun
} from '../source-control/review/mobile-review-terminal-operations'
import { hostWorktreeCatalogKey } from '../host-screen/host-list-queries'
import { agentsByUrgency, isWaitingAgent } from '../../../src/shared/overview/overview-model'
import type {
  OverviewAgentInput,
  OverviewWorktreeInput
} from '../../../src/shared/overview/overview-model-types'
import { parseWorkspaceKey } from '../../../src/shared/workspace-scope'
import { worktreeMarkReadWrite } from './overview-operations'

export type MobileOverviewResult = { ok: boolean; message: string }

function waitingForDesktop(): MobileOverviewResult {
  return {
    ok: false,
    message: translate('overview.mobile.waitingForDesktop', 'Waiting for desktop...')
  }
}

/** Folder workspaces are written through another method the phone does not reach. */
export function canMarkReadFromPhone(worktree: OverviewWorktreeInput): boolean {
  return parseWorkspaceKey(worktree.id)?.type !== 'folder'
}

/** The terminal running an agent pane: pane keys are `<tabId>:<leafId>`. */
async function terminalForAgent(
  client: RpcClient,
  worktreeId: string,
  agent: OverviewAgentInput
): Promise<string | null> {
  const response = await reviewTerminalListRead.request(client, { worktree: `id:${worktreeId}` })
  const tabs = interpretOrThrowRefusalMessage(
    () => reviewTerminalListRead.interpret(response),
    translate('overview.mobile.loadSessionsFailed', 'Unable to load agent sessions')
  )
  const tabId = agent.paneKey.split(':')[0]
  return tabs.find((tab) => tab.id === tabId)?.terminal ?? null
}

async function sendToAgent(
  client: RpcClient,
  worktreeId: string,
  agent: OverviewAgentInput,
  text: string
): Promise<boolean> {
  const terminal = await terminalForAgent(client, worktreeId, agent)
  if (!terminal) {
    return false
  }
  // Clear a chat's leftover attachments so they cannot ride along with the reply.
  if (!(await healMobileNativeChatStaleInput({ client, terminal, deviceToken: null }))) {
    return false
  }
  const response = await reviewTerminalSendRun.request(client, { terminal, text, enter: true })
  return interpretOrThrowRefusalMessage(
    () => reviewTerminalSendRun.interpret(response),
    translate('overview.mobile.sendFailed', 'The message was not sent')
  )
}

export function useMobileOverviewActions(args: {
  hostId: string
  client: RpcClient | null
  connState: ConnectionState
}) {
  const { hostId, client, connState } = args
  const openSession = useOpenMobileSession()
  const queryClient = useQueryClient()
  const live = client !== null && connState === 'connected' ? client : null

  const refreshRows = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: hostWorktreeCatalogKey(hostId) })
  }, [hostId, queryClient])

  const open = useCallback(
    (worktree: OverviewWorktreeInput) => {
      const agent = agentsByUrgency(worktree.agents)[0]
      openSession({
        hostId,
        worktreeId: worktree.id,
        name: worktree.name,
        ...(agent ? { paneKey: agent.paneKey } : {}),
        // Only a paired server's workspace names its host; the desktop routes its own (SSH too).
        ...(worktree.executionHostId.startsWith('runtime:')
          ? { executionHost: worktree.executionHostId }
          : {})
      })
    },
    [hostId, openSession]
  )

  const markRead = useCallback(
    async (worktrees: readonly OverviewWorktreeInput[]): Promise<MobileOverviewResult> => {
      if (!live) {
        return waitingForDesktop()
      }
      const writable = worktrees.filter(canMarkReadFromPhone)
      const results = await Promise.allSettled(
        writable.map(async (worktree) =>
          worktreeMarkReadWrite.interpret(
            await worktreeMarkReadWrite.request(live, {
              worktree: `id:${worktree.id}`,
              isUnread: false,
              // Like the desktop's Mark read: also clear the workspace's attention markers.
              acknowledgeAttention: true
            })
          )
        )
      )
      refreshRows()
      const failed = results.filter((r) => r.status === 'rejected').length
      return failed === 0
        ? {
            ok: true,
            message: translate('overview.mobile.markedRead', 'Marked {{count}} read', {
              count: writable.length
            })
          }
        : {
            ok: false,
            message: translate(
              'overview.mobile.markReadFailed',
              '{{count}} could not be marked read',
              {
                count: failed
              }
            )
          }
    },
    [live, refreshRows]
  )

  const reply = useCallback(
    async (worktree: OverviewWorktreeInput, text: string): Promise<MobileOverviewResult> => {
      if (!live) {
        return waitingForDesktop()
      }
      const waiting = worktree.agents.filter(isWaitingAgent)
      for (const agent of waiting.length > 0 ? waiting : worktree.agents) {
        if (await sendToAgent(live, worktree.id, agent, text)) {
          refreshRows()
          return {
            ok: true,
            message: translate('overview.mobile.replied', 'Replied in {{name}}', {
              name: worktree.name
            })
          }
        }
      }
      return {
        ok: false,
        message: translate('overview.mobile.replyRefused', 'No agent in {{name}} took the reply', {
          name: worktree.name
        })
      }
    },
    [live, refreshRows]
  )

  return { open, markRead, reply }
}
