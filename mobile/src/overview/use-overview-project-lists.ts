import { useEffect, useState } from 'react'
import {
  loadOverviewProjectList,
  saveOverviewProjectList,
  type OverviewProjectList
} from './overview-view-preferences'

type ProjectLists = Record<OverviewProjectList, ReadonlySet<string>>

/** The phone's pinned and hidden projects, saved on the phone. */
export function useOverviewProjectLists(): ProjectLists & {
  toggle: (list: OverviewProjectList, projectId: string) => void
} {
  const [lists, setLists] = useState<ProjectLists>({ pinned: new Set(), hidden: new Set() })
  useEffect(() => {
    let live = true
    void Promise.all([loadOverviewProjectList('pinned'), loadOverviewProjectList('hidden')]).then(
      ([pinned, hidden]) => {
        if (live) {
          setLists({ pinned: new Set(pinned), hidden: new Set(hidden) })
        }
      }
    )
    return () => {
      live = false
    }
  }, [])
  const toggle = (list: OverviewProjectList, projectId: string): void => {
    const next = new Set(lists[list])
    if (!next.delete(projectId)) {
      next.add(projectId)
    }
    setLists({ ...lists, [list]: next })
    void saveOverviewProjectList(list, [...next]).catch(() => {})
  }
  return { ...lists, toggle }
}
