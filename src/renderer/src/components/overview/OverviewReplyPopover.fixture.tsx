import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { OverviewReplyPopover } from './OverviewReplyPopover'
import type { OverviewWorkspaceRow } from '../../../../shared/overview/overview-model-types'

const row: OverviewWorkspaceRow = {
  worktreeId: 'alpha::/code/alpha/feat',
  executionHostId: 'local',
  name: 'feat/gh-311-units-face-target',
  isMain: false,
  isActive: false,
  status: null,
  issue: 311,
  pr: null,
  agentState: 'waiting',
  agentSince: Date.now() - 4 * 60_000,
  lastMessage: 'Should units keep facing their target while retreating, or turn to face the path?',
  comment: null,
  unread: false,
  lastActivityAt: Date.now() - 4 * 60_000,
  attention: ['agent-waiting'],
  cleanable: false
}

function ControlledReplyPopover(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <OverviewReplyPopover
      row={row}
      busy={false}
      reply={async () => true}
      open={open}
      setOpen={setOpen}
    />
  )
}

export const open = defineFixture({
  width: 480,
  render: () => (
    <div className="flex h-56 justify-end p-4">
      <ControlledReplyPopover />
    </div>
  ),
  interact: (frame) => {
    frame.querySelector('button')?.click()
  }
})
