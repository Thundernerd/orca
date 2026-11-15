import { useEffect, useState } from 'react'
import { useAppActive } from '../hooks/use-now'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { mobileTicketActions } from './mobile-ticket-actions'
import type { MobileTicketPipelineStatus } from './overview-ticket-operations'

const POLL_MS = 15_000

/** Every project's merge queue, auto-clean and draft status, read while the app is in front. */
export function useMobileTicketStatuses(
  client: RpcClient | null,
  projectIds: readonly string[]
): ReadonlyMap<string, MobileTicketPipelineStatus | null> {
  const active = useAppActive()
  const key = projectIds.join('\n')
  const [statuses, setStatuses] = useState<ReadonlyMap<string, MobileTicketPipelineStatus | null>>(
    () => new Map()
  )
  useEffect(() => {
    if (!client || !active || !key) {
      return
    }
    let current = true
    const ids = key.split('\n')
    const read = (): void => {
      void Promise.all(
        ids.map((id) =>
          mobileTicketActions(client, id)
            .status()
            // An older desktop lacks the method; a failed read leaves nothing to show.
            .catch(() => null)
            .then((status) => [id, status] as const)
        )
      ).then((entries) => current && setStatuses(new Map(entries)))
    }
    read()
    const timer = setInterval(read, POLL_MS)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [client, key, active])
  return statuses
}
