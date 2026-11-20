import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/index'
import { useIntlLocale } from '@/i18n/use-translate'
import { buildOverviewSnapshot } from '../../../../shared/overview/overview-model'
import type {
  OverviewSnapshot,
  OverviewWorktreeInput
} from '../../../../shared/overview/overview-model-types'
import { buildOverviewStoreInputs, selectOverviewStoreSlice } from './overview-store-inputs'
import { ticketProjectIds } from '../../../../shared/overview/overview-ticket-projects'
import { useOverviewAutomatedWorktrees } from './use-overview-ticket-status'
import { useOverviewHostLabels } from './use-overview-host-labels'

const EMPTY_SET: ReadonlySet<string> = new Set()

export type OverviewData = {
  snapshot: OverviewSnapshot
  worktreesById: ReadonlyMap<string, OverviewWorktreeInput>
}

export function useOverviewData(ticketsLoading: ReadonlySet<string> = EMPTY_SET): OverviewData {
  const slice = useAppStore(useShallow(selectOverviewStoreSlice))
  const prefs = useAppStore((state) => state.overviewPrefs)
  const locale = useIntlLocale()
  const hostLabels = useOverviewHostLabels()
  const inputs = useMemo(() => buildOverviewStoreInputs(slice, hostLabels), [slice, hostLabels])
  const worktreesById = useMemo(
    () => new Map(inputs.worktrees.map((worktree) => [worktree.key, worktree])),
    [inputs]
  )

  const projectIds = useMemo(() => ticketProjectIds(inputs.worktrees), [inputs])
  const automated = useOverviewAutomatedWorktrees(projectIds)

  const snapshot = useMemo(
    () =>
      buildOverviewSnapshot({
        repos: inputs.repos,
        worktrees: inputs.worktrees,
        tickets: prefs.tickets,
        ticketsLoading,
        hidden: new Set(prefs.hidden),
        pinned: new Set(prefs.pinned),
        sort: prefs.sort ?? 'attention',
        locale,
        automated
      }),
    [inputs, prefs, ticketsLoading, automated, locale]
  )

  return { snapshot, worktreesById }
}
