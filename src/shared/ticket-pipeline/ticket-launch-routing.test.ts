import { describe, expect, it } from 'vitest'
import { routeTicketLaunch } from './ticket-launch-routing'
import type { TicketSurveyRow } from './ticket-types'

function row(id: string, runsIn?: 'cloud' | 'local'): TicketSurveyRow {
  return {
    status: 'ready',
    waitingOn: [],
    ticket: {
      id,
      slugId: id,
      title: id,
      url: null,
      ref: id,
      issueNumber: Number(id.slice(1)),
      assignees: [],
      ownedByUser: false,
      blockerIds: [],
      labels: [],
      needsTriage: false,
      externalId: null
    },
    ...(runsIn ? { runsIn } : {})
  }
}

const rows = [row('#1', 'cloud'), row('#2', 'local'), row('#3')]
const selections = [{ id: '#1' }, { id: '#2' }, { id: '#3' }]
const ids = (list: readonly { id: string }[]) => list.map((s) => s.id)

describe('routeTicketLaunch', () => {
  it('sends labelled tickets where their label says and the rest locally with the switch off', () => {
    const route = routeTicketLaunch(selections, rows, false)
    expect(ids(route.cloud)).toEqual(['#1'])
    expect(ids(route.local)).toEqual(['#2', '#3'])
    expect([...route.keptLocal]).toEqual([])
  })

  it('keeps a ready-for-human ticket local with the switch on, and says so', () => {
    const route = routeTicketLaunch(selections, rows, true)
    expect(ids(route.cloud)).toEqual(['#1', '#3'])
    expect(ids(route.local)).toEqual(['#2'])
    expect([...route.keptLocal]).toEqual(['#2'])
  })

  it('lets a ticket the survey no longer has follow the switch', () => {
    expect(ids(routeTicketLaunch([{ id: '#9' }], rows, true).cloud)).toEqual(['#9'])
    expect(ids(routeTicketLaunch([{ id: '#9' }], rows, false).local)).toEqual(['#9'])
  })
})
