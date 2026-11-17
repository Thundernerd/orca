import { runProcess } from '@orca/process-host'
import { withCliRuntimeOnPath } from '../../../shared/shell/command-resolution/node-cli-command-resolution'
import { stripInheritedAgentSessionEnv } from '../../../shared/agent-launch/startup/parent-agent-session-env'
import { resolveClaudeCommand } from '../../codex-cli/command'
import { buildWindowsCommandInvocation } from '../../claude-accounts/sign-in/windows-command-invocation'

const SEND_TIMEOUT_MS = 60_000

export type CloudSessionSendResult = { ok: true } | { ok: false; error: string }

function parseReply(stdout: string): CloudSessionSendResult | null {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const reply: unknown = JSON.parse(line)
      if (typeof reply === 'object' && reply !== null && 'ok' in reply) {
        if (reply.ok === true) {
          return { ok: true }
        }
        const error = 'error' in reply && typeof reply.error === 'string' ? reply.error : null
        return { ok: false, error: error ?? 'The cloud session refused the message.' }
      }
    } catch {
      // Not the JSON reply line.
    }
  }
  return null
}

/** Queues a message into a Claude cloud session through the user's own `claude` login. */
export async function sendClaudeCloudSessionMessage(
  sessionId: string,
  text: string
): Promise<CloudSessionSendResult> {
  const claude = resolveClaudeCommand()
  // The message goes on stdin: a fix brief is long, and cmd.exe cannot quote one safely.
  const args = ['-p', '--output-format', 'json', '--cloud', sessionId]
  const invocation =
    process.platform === 'win32'
      ? buildWindowsCommandInvocation(claude, args)
      : { command: claude, args, windowsVerbatimArguments: false }
  const env = { ...process.env }
  stripInheritedAgentSessionEnv(env)
  const result = await runProcess({
    program: invocation.command,
    args: invocation.args,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    env: withCliRuntimeOnPath(claude, env),
    input: text,
    timeoutMs: SEND_TIMEOUT_MS
  })
  if (result.timedOut) {
    return { ok: false, error: 'Claude did not answer within a minute.' }
  }
  return (
    parseReply(result.stdout) ?? {
      ok: false,
      error: result.stderr.trim() || `claude exited with code ${String(result.code)}.`
    }
  )
}
