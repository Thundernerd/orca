import { defineFixture } from '../../component-fixtures/component-fixture'
import type { TicketSurveyRow } from '../../../../shared/ticket-pipeline/ticket-types'
import {
  LaunchTicketsList,
  LaunchTicketsRouting,
  type LaunchTicketChoice
} from './OverviewLaunchTicketsList'
import { Button } from '@/components/ui/button'

function choice(id: string, title: string, runsIn?: 'cloud' | 'local'): LaunchTicketChoice {
  const row: TicketSurveyRow = {
    ticket: {
      id,
      slugId: `gh-${id.slice(1)}`,
      externalId: null,
      title,
      url: null,
      ref: id.slice(1),
      issueNumber: Number(id.slice(1)),
      assignees: [],
      ownedByUser: false,
      blockerIds: [],
      labels: runsIn ? [runsIn === 'cloud' ? 'ready-for-agent' : 'ready-for-human'] : [],
      needsTriage: false
    },
    status: 'ready',
    waitingOn: [],
    ...(runsIn ? { runsIn } : {})
  }
  return { row, selected: true, type: 'feat' }
}

function Launch({ choices }: { choices: LaunchTicketChoice[] }): React.JSX.Element {
  return (
    <div className="flex w-[32rem] flex-col gap-2 p-3">
      <LaunchTicketsList
        choices={choices}
        onChange={() => undefined}
        onSelectAll={() => undefined}
      />
      <LaunchTicketsRouting
        selected={choices.filter((c) => c.selected)}
        inCloud={false}
        cloudCapable
        onInCloud={() => undefined}
      >
        <Button size="sm">Launch {choices.filter((c) => c.selected).length}</Button>
      </LaunchTicketsRouting>
    </div>
  )
}

export const mixedSelection = defineFixture({
  width: 540,
  render: () => (
    <Launch
      choices={[
        choice('#41', 'Show where each ticket will run in Launch tickets', 'cloud'),
        choice('#42', 'Pair the phone over the local network', 'local'),
        choice('#43', 'Tidy the merge queue copy')
      ]}
    />
  )
})

export const allLabelled = defineFixture({
  width: 540,
  render: () => (
    <Launch
      choices={[
        choice('#41', 'Show where each ticket will run in Launch tickets', 'cloud'),
        choice('#42', 'Pair the phone over the local network', 'local')
      ]}
    />
  )
})
