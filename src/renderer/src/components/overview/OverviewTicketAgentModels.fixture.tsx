import { defineFixture } from '../../component-fixtures/component-fixture'
import { TicketAgentModelRows } from './OverviewTicketAgentModels'

export const triageOnSonnet = defineFixture({
  width: 480,
  render: () => (
    <div className="flex flex-col gap-2 p-3">
      <TicketAgentModelRows
        settings={{ triageModel: 'sonnet', findingCheckModel: null }}
        onChange={() => undefined}
      />
    </div>
  )
})

export const modelMenuOpen = defineFixture({
  width: 480,
  render: () => (
    <div className="flex flex-col gap-2 p-3">
      <TicketAgentModelRows
        settings={{ triageModel: null, findingCheckModel: 'haiku' }}
        onChange={() => undefined}
      />
    </div>
  ),
  interact: (frame) => {
    // Radix Select opens on pointerdown, not click.
    frame.querySelector('[aria-label="Triage runs"]')?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse'
      })
    )
  }
})
