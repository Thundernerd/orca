import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/index'
import { buildOverviewSnapshot, isMergingTickets } from './overview-model'
import type { OverviewSnapshot, OverviewWorktreeInput } from './overview-model-types'
import { buildOverviewStoreInputs, selectOverviewStoreSlice } from './overview-store-inputs'

// A merge started from the page counts as running until its agent reports, or this long.
const PENDING_MERGE_MS = 2 * 60_000
const EMPTY_SET: ReadonlySet<string> = new Set()

export type OverviewData = {
  snapshot: OverviewSnapshot
  worktreesById: ReadonlyMap<string, OverviewWorktreeInput>
  markMergePending: (projectId: string) => void
}

export function useOverviewData(ticketsLoading: ReadonlySet<string> = EMPTY_SET): OverviewData {
  const slice = useAppStore(useShallow(selectOverviewStoreSlice))
  const prefs = useAppStore((state) => state.overviewPrefs)
  const [pendingMerges, setPendingMerges] = useState<ReadonlyMap<string, number>>(new Map())
  const inputs = useMemo(() => buildOverviewStoreInputs(slice), [slice])
  const worktreesById = useMemo(
    () => new Map(inputs.worktrees.map((worktree) => [worktree.id, worktree])),
    [inputs]
  )

  const snapshot = useMemo(
    () =>
      buildOverviewSnapshot({
        repos: inputs.repos,
        worktrees: inputs.worktrees,
        tickets: prefs.tickets,
        ticketsLoading,
        pendingMerges: new Set(pendingMerges.keys()),
        hidden: new Set(prefs.hidden),
        pinned: new Set(prefs.pinned)
      }),
    [inputs, prefs, ticketsLoading, pendingMerges]
  )

  // Drop a pending merge once its agent reports, or when it never does.
  const pendingRef = useRef(pendingMerges)
  pendingRef.current = pendingMerges
  useEffect(() => {
    if (pendingMerges.size === 0) {
      return
    }
    const settle = (): void => {
      const now = Date.now()
      const next = new Map(pendingRef.current)
      for (const [projectId, startedAt] of pendingRef.current) {
        const main = snapshot.projects.find((p) => p.id === projectId)?.mainWorktreeId
        const reported = main ? isMergingTickets(worktreesById.get(main) ?? null) : false
        if (reported || now - startedAt > PENDING_MERGE_MS) {
          next.delete(projectId)
        }
      }
      if (next.size !== pendingRef.current.size) {
        setPendingMerges(next)
      }
    }
    settle()
    const timer = window.setInterval(settle, 10_000)
    return () => window.clearInterval(timer)
  }, [pendingMerges, snapshot, worktreesById])

  const markMergePending = useCallback((projectId: string) => {
    setPendingMerges((current) => new Map(current).set(projectId, Date.now()))
  }, [])

  return { snapshot, worktreesById, markMergePending }
}
