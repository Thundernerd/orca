import type { AppState } from '@/store/types'
import { buildOverviewSnapshot } from '../../../../shared/overview/overview-model'
import {
  buildOverviewStoreInputs,
  selectOverviewStoreSlice,
  type OverviewHostLabels,
  type OverviewStoreSlice
} from './overview-store-inputs'

const NO_LABELS: OverviewHostLabels = new Map()
const SLICE_KEYS: readonly (keyof OverviewStoreSlice)[] = [
  'repos',
  'worktreesByRepo',
  'folderWorkspaces',
  'projectGroups',
  'activeWorktreeId',
  'activeWorkspaceExecutionHostId',
  'prCache',
  'agentStatusByPaneKey',
  'migrationUnsupportedByPtyId',
  'retainedAgentsByPaneKey',
  'tabsByWorktree',
  'unifiedTabsByWorktree'
]
const NONE: ReadonlySet<string> = new Set()

type Cached = {
  slice: OverviewStoreSlice
  hidden: readonly string[]
  count: number
}
let cached: Cached | null = null

function sameSlice(a: OverviewStoreSlice, b: OverviewStoreSlice): boolean {
  return SLICE_KEYS.every((key) => a[key] === b[key])
}

/**
 * How many workspaces need you, for the sidebar entry. Store selectors run on every update, so
 * this only rebuilds when the inputs the Overview reads changed, and returns a number so the
 * badge re-renders only when the count does.
 */
export function selectOverviewNeedsYouCount(state: AppState): number {
  const slice = selectOverviewStoreSlice(state)
  const hidden = state.overviewPrefs.hidden
  if (cached && cached.hidden === hidden && sameSlice(cached.slice, slice)) {
    return cached.count
  }
  const inputs = buildOverviewStoreInputs(slice, NO_LABELS)
  const count = buildOverviewSnapshot({
    ...inputs,
    tickets: {},
    ticketsLoading: NONE,
    pendingMerges: NONE,
    hidden: new Set(hidden),
    pinned: NONE,
    sort: 'attention'
  }).attention.length
  cached = { slice, hidden, count }
  return count
}
