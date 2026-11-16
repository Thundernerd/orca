import type { PRInfo } from '../../shared/github/pull-requests/pull-request-types'
import {
  isPRRevalidationOnly,
  type PRSnapshotReply
} from '../../shared/github/pull-requests/refresh/pull-request-refresh-types'

/** The PR a branch lookup found; a revalidation-only reply has not read one yet. */
export function foundPR(reply: PRSnapshotReply | null): PRInfo | null {
  return reply && !isPRRevalidationOnly(reply) && reply.kind === 'found' ? reply.pr : null
}
