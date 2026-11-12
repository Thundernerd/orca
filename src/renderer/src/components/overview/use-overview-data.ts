import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/index'
import { getIntlLocale } from '@/i18n/i18n'
import { buildOverviewSnapshot } from '../../../../shared/overview/overview-model'
import type {
  OverviewSnapshot,
  OverviewWorktreeInput
} from '../../../../shared/overview/overview-model-types'
import { buildOverviewStoreInputs, selectOverviewStoreSlice } from './overview-store-inputs'
import { useSidebarHostScopeOptions } from '@/components/sidebar/worktree-list/controls/use-sidebar-host-scope-options'
import { sidebarHostDisplayLabel } from '@/components/sidebar/worktree-list/controls/sidebar-host-options'

const EMPTY_SET: ReadonlySet<string> = new Set()

export type OverviewData = {
  snapshot: OverviewSnapshot
  worktreesById: ReadonlyMap<string, OverviewWorktreeInput>
}

export function useOverviewData(ticketsLoading: ReadonlySet<string> = EMPTY_SET): OverviewData {
  const slice = useAppStore(useShallow(selectOverviewStoreSlice))
  const prefs = useAppStore((state) => state.overviewPrefs)
  const { hostOptions } = useSidebarHostScopeOptions()
  const hostLabels = useMemo(
    () => new Map(hostOptions.map((host) => [host.id, sidebarHostDisplayLabel(host)])),
    [hostOptions]
  )
  const inputs = useMemo(() => buildOverviewStoreInputs(slice, hostLabels), [slice, hostLabels])
  const worktreesById = useMemo(
    () => new Map(inputs.worktrees.map((worktree) => [worktree.key, worktree])),
    [inputs]
  )

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
        locale: getIntlLocale()
      }),
    [inputs, prefs, ticketsLoading]
  )

  return { snapshot, worktreesById }
}
