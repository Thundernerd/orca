import { describe, expect, it, vi } from 'vitest'
import type {
  TicketLaunchResult,
  TicketLaunchSelection,
  TicketSurveyRow
} from '../../shared/ticket-pipeline/ticket-types'
import { launchRoutedTickets } from './ticket-launch-routed'

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

// One ready-for-agent, one ready-for-human and one unlabelled issue.
const rows = [row('#1', 'cloud'), row('#2', 'local'), row('#3')]
const selections: TicketLaunchSelection[] = [{ id: '#1' }, { id: '#2' }, { id: '#3' }]

const result = (outcomes: TicketLaunchResult['outcomes']): TicketLaunchResult => ({
  source: 'github-issues',
  parentWorktreeId: 'parent',
  outcomes
})

function launchers() {
  return {
    launchCloud: vi.fn(async (picked: readonly TicketLaunchSelection[]) =>
      result(
        picked.map((s) => ({ id: s.id, status: 'started', branch: `b${s.id}`, terminal: 't' }))
      )
    ),
    launchLocal: vi.fn(async (picked: readonly TicketLaunchSelection[]) =>
      result(
        picked.map((s) => ({
          id: s.id,
          status: 'launched',
          itemId: 'i',
          worktreeId: 'w',
          branch: `b${s.id}`
        }))
      )
    )
  }
}

describe('launchRoutedTickets', () => {
  it('starts one cloud session and two local workspaces with the cloud switch off', async () => {
    const l = launchers()
    const launched = await launchRoutedTickets({ selections, rows, cloud: false, ...l })
    expect(l.launchCloud).toHaveBeenCalledWith([{ id: '#1' }])
    expect(l.launchLocal).toHaveBeenCalledWith([{ id: '#2' }, { id: '#3' }])
    expect(launched.outcomes.map((o) => [o.id, o.status])).toEqual([
      ['#1', 'started'],
      ['#2', 'launched'],
      ['#3', 'launched']
    ])
    expect(launched.outcomes.some((o) => o.status === 'launched' && o.keptLocal)).toBe(false)
  })

  it('starts two cloud sessions and keeps the ready-for-human one local with the switch on', async () => {
    const l = launchers()
    const launched = await launchRoutedTickets({ selections, rows, cloud: true, ...l })
    expect(l.launchCloud).toHaveBeenCalledWith([{ id: '#1' }, { id: '#3' }])
    expect(l.launchLocal).toHaveBeenCalledWith([{ id: '#2' }])
    expect(launched.outcomes).toEqual([
      expect.objectContaining({ id: '#1', status: 'started' }),
      expect.objectContaining({ id: '#2', status: 'launched', keptLocal: 'ready-for-human' }),
      expect.objectContaining({ id: '#3', status: 'started' })
    ])
  })

  it('never calls the cloud launcher when nothing runs in the cloud', async () => {
    const l = launchers()
    await launchRoutedTickets({
      selections: [{ id: '#2' }, { id: '#3' }],
      rows,
      cloud: false,
      ...l
    })
    expect(l.launchCloud).not.toHaveBeenCalled()
  })

  it('fails only the cloud tickets when the cloud launch is refused in a mixed launch', async () => {
    const l = launchers()
    l.launchCloud.mockRejectedValueOnce(new Error('check out main first'))
    const launched = await launchRoutedTickets({ selections, rows, cloud: false, ...l })
    expect(launched.outcomes).toEqual([
      { id: '#1', status: 'failed', reason: 'check out main first' },
      expect.objectContaining({ id: '#2', status: 'launched' }),
      expect.objectContaining({ id: '#3', status: 'launched' })
    ])
  })

  it('throws the refusal when every ticket was meant for the refused launch', async () => {
    const l = launchers()
    l.launchCloud.mockRejectedValueOnce(new Error('check out main first'))
    await expect(
      launchRoutedTickets({ selections: [{ id: '#1' }, { id: '#3' }], rows, cloud: true, ...l })
    ).rejects.toThrow('check out main first')
  })
})
