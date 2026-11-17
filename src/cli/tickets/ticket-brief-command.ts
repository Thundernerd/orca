import { CONVENTIONAL_TYPES } from '../../shared/ticket-pipeline/ticket-types'
import type { CloudTicketBrief } from '../../shared/ticket-pipeline/ticket-cloud-brief'
import type { CommandHandler } from '../dispatch/dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/connection/types'
import { currentWorktree } from './ticket-cli-worktree'

/** `orca tickets brief`: a Claude cloud session's brief, printed bare for `claude --cloud`. */
export const TICKET_BRIEF_HANDLERS: Record<string, CommandHandler> = {
  'tickets brief': async ({ flags, client, cwd, json }) => {
    const worktree = await currentWorktree(flags, cwd, client)
    const ticket = getRequiredStringFlag(flags, 'ticket')
    const type = getOptionalStringFlag(flags, 'type')
    if (type !== undefined && !CONVENTIONAL_TYPES.some((t) => t === type)) {
      throw new RuntimeClientError(
        'invalid_argument',
        `--type must be one of ${CONVENTIONAL_TYPES.join(', ')}.`
      )
    }
    const result = await client.call<CloudTicketBrief>('tickets.brief', {
      worktree,
      ticket,
      ...(type ? { type } : {}),
      ...(flags.get('claim') === true ? { claim: true } : {})
    })
    printResult(result, json, (r) => r.brief)
  }
}
