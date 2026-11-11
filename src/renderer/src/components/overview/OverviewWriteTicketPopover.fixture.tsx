import { defineFixture } from '../../component-fixtures/component-fixture'
import { OverviewWriteTicketPopover } from './OverviewWriteTicketPopover'

export const open = defineFixture({
  width: 560,
  render: () => (
    <div className="h-72 p-4">
      <OverviewWriteTicketPopover
        projectName="rally-point"
        busy={false}
        variant="outline"
        onSubmit={() => {}}
      />
    </div>
  ),
  interact: (frame) => {
    frame.querySelector('button')?.click()
  }
})
