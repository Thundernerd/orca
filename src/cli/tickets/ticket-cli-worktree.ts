import type { CommandHandler } from '../dispatch/dispatch'
import {
  getOptionalWorktreeSelector,
  resolveCurrentWorktreeSelector
} from '../workspace-selection/workspace-selector'

/** The parent workspace a tickets command acts from: `--worktree`, else the one at the cwd. */
export async function currentWorktree(
  flags: Map<string, string | boolean>,
  cwd: string,
  client: Parameters<CommandHandler>[0]['client']
): Promise<string> {
  return (
    (await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)) ??
    (await resolveCurrentWorktreeSelector(cwd, client, 'worktree'))
  )
}
