import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { OverviewProject } from '../../../../shared/overview/overview-model-types'

export type OverviewGroupBy = 'none' | 'group'

export type OverviewProjectSection = {
  key: string
  /** Null for the single unlabelled section when not grouping. */
  label: string | null
  projects: OverviewProject[]
}

const UNGROUPED = 'ungrouped'

function groupPath(group: ProjectGroup, byId: ReadonlyMap<string, ProjectGroup>): ProjectGroup[] {
  const path: ProjectGroup[] = []
  const seen = new Set<string>()
  for (let g: ProjectGroup | undefined = group; g && !seen.has(g.id);) {
    seen.add(g.id)
    path.unshift(g)
    g = g.parentGroupId ? byId.get(g.parentGroupId) : undefined
  }
  return path
}

/**
 * Splits the already sorted projects into project-group sections, keeping their order within
 * each. Sections follow the sidebar's group order (nested groups after their parent), named
 * "Parent / Child"; ungrouped projects come last.
 */
export function sectionOverviewProjects(
  projects: readonly OverviewProject[],
  groups: readonly ProjectGroup[],
  groupBy: OverviewGroupBy,
  ungroupedLabel: string
): OverviewProjectSection[] {
  if (groupBy !== 'group') {
    return [{ key: 'all', label: null, projects: [...projects] }]
  }
  const byId = new Map(groups.map((group) => [group.id, group]))
  const sections = new Map<string, OverviewProjectSection & { order: number[] }>()
  for (const project of projects) {
    const group = project.groupId ? byId.get(project.groupId) : undefined
    const key = group?.id ?? UNGROUPED
    let section = sections.get(key)
    if (!section) {
      const path = group ? groupPath(group, byId) : []
      section = {
        key,
        label: group ? path.map((g) => g.name).join(' / ') : ungroupedLabel,
        projects: [],
        order: group ? path.map((g) => g.tabOrder) : [Number.MAX_SAFE_INTEGER]
      }
      sections.set(key, section)
    }
    section.projects.push(project)
  }
  return [...sections.values()]
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.order.length, b.order.length); i += 1) {
        const diff = (a.order[i] ?? -1) - (b.order[i] ?? -1)
        if (diff !== 0) {
          return diff
        }
      }
      return (a.label ?? '').localeCompare(b.label ?? '')
    })
    .map(({ key, label, projects: list }) => ({ key, label, projects: list }))
}
