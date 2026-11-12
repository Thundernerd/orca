import { describe, expect, it } from 'vitest'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { OverviewProject } from '../../../../shared/overview/overview-model-types'
import { sectionOverviewProjects } from './overview-project-sections'

function group(id: string, name: string, tabOrder: number, parentGroupId: string | null = null) {
  const g: ProjectGroup = {
    id,
    name,
    parentPath: null,
    parentGroupId,
    createdFrom: 'manual',
    tabOrder,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0
  }
  return g
}

function project(id: string, groupId: string | null): OverviewProject {
  return {
    id,
    name: id,
    host: null,
    groupId,
    ticketSource: null,
    mainWorktreeId: null,
    isActive: false,
    activeWorkspace: null,
    hidden: false,
    pinned: false,
    usesTickets: false,
    attentionCount: 0,
    runningAgents: 0,
    openPrs: 0,
    readyPrs: 0,
    cleanupCount: 0,
    lastActivityAt: 0,
    tickets: null,
    ticketsLoading: false,
    workspaces: []
  }
}

describe('sectionOverviewProjects', () => {
  it('orders groups like the sidebar, nests labels, keeps project order and puts ungrouped last', () => {
    const groups = [
      group('games', 'Games', 2),
      group('web', 'Web', 1),
      group('idle', 'Idle', 0, 'games')
    ]
    const sections = sectionOverviewProjects(
      [
        project('p1', null),
        project('p2', 'games'),
        project('p3', 'idle'),
        project('p4', 'web'),
        project('p5', 'games')
      ],
      groups,
      'group',
      'Ungrouped'
    )
    expect(sections.map((s) => [s.label, s.projects.map((p) => p.id)])).toEqual([
      ['Web', ['p4']],
      ['Games', ['p2', 'p5']],
      ['Games / Idle', ['p3']],
      ['Ungrouped', ['p1']]
    ])
  })
})
