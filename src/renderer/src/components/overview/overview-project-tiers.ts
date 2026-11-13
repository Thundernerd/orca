import type { OverviewProject } from '../../../../shared/overview/overview-model-types'

export type OverviewProjectTierKey = 'pinned' | 'regular' | 'hidden'

export type OverviewProjectTier = {
  key: OverviewProjectTierKey
  projects: OverviewProject[]
}

/** Pinned, regular, then hidden, keeping the sort within each; hiding wins over pinning, and empty tiers drop out. */
export function tierOverviewProjects(projects: readonly OverviewProject[]): OverviewProjectTier[] {
  const tierOf = (p: OverviewProject): OverviewProjectTierKey =>
    p.hidden ? 'hidden' : p.pinned ? 'pinned' : 'regular'
  const keys: OverviewProjectTierKey[] = ['pinned', 'regular', 'hidden']
  return keys
    .map((key) => ({ key, projects: projects.filter((p) => tierOf(p) === key) }))
    .filter((tier) => tier.projects.length > 0)
}
