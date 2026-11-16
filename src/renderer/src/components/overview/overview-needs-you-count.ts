import type { AppState } from '@/store/types'
import { buildOverviewSnapshot } from '../../../../shared/overview/overview-model'
import {
  buildOverviewStoreInputs,
  selectOverviewStoreSlice,
  type OverviewHostLabels,
  type OverviewStoreSlice
} from './overview-store-inputs'
import { ticketProjectIds } from '../../../../shared/overview/overview-ticket-projects'

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
  'tabsByWorktree',
  'unifiedTabsByWorktree'
]
const NONE: ReadonlySet<string> = new Set()

type Cached = {
  slice: OverviewStoreSlice
  inputs: ReturnType<typeof buildOverviewStoreInputs>
}
let cached: Cached | null = null
let counted: {
  inputs: Cached['inputs']
  hidden: readonly string[]
  automated: ReadonlyMap<string, ReadonlySet<string>>
  count: number
} | null = null

function sameSlice(a: OverviewStoreSlice, b: OverviewStoreSlice): boolean {
  return SLICE_KEYS.every((key) => a[key] === b[key])
}

function overviewInputs(state: AppState): Cached['inputs'] {
  const slice = selectOverviewStoreSlice(state)
  if (!cached || !sameSlice(cached.slice, slice)) {
    cached = { slice, inputs: buildOverviewStoreInputs(slice, NO_LABELS) }
  }
  return cached.inputs
}

/** The projects whose ticket status the count needs, as one string so the selector stays stable. */
export function selectOverviewTicketProjectKey(state: AppState): string {
  return ticketProjectIds(overviewInputs(state).worktrees).join('\n')
}

/**
 * How many workspaces need you, for the sidebar entry. Store selectors run on every update, so
 * the inputs only rebuild when the slice the Overview reads changed, and it returns a number so
 * the badge re-renders only when the count does.
 */
export function selectOverviewNeedsYouCount(
  state: AppState,
  automated: ReadonlyMap<string, ReadonlySet<string>>
): number {
  const inputs = overviewInputs(state)
  const hidden = state.overviewPrefs.hidden
  if (
    counted &&
    counted.inputs === inputs &&
    counted.hidden === hidden &&
    counted.automated === automated
  ) {
    return counted.count
  }
  const count = buildOverviewSnapshot({
    ...inputs,
    tickets: {},
    ticketsLoading: NONE,
    hidden: new Set(hidden),
    pinned: NONE,
    sort: 'attention',
    automated
  }).attention.length
  counted = { inputs, hidden, automated, count }
  return count
}
