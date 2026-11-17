import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { getAgentSessionOptionLaunchCatalog } from '../../../../shared/agent-session/options/agent-session-option-catalog'
import { classifyAgentModels } from '../../../../shared/agent-session/options/model-catalog/legacy-agent-models'
import type { TicketPipelineSettings } from '../../../../shared/ticket-pipeline/ticket-types'
import { useOverviewTicketSettings } from './use-overview-ticket-settings'

// Radix Select reserves the empty string, so the user's own default needs a value of its own.
const USER_DEFAULT = '__user-default'

type StepModelKey = 'triageModel' | 'findingCheckModel'

/** Which Claude model the project's triage and finding-check agents run; implementation keeps the user's default. */
export function OverviewTicketAgentModels({
  projectId
}: {
  projectId: string
}): React.JSX.Element | null {
  const { settings, update } = useOverviewTicketSettings(projectId, true)
  return settings ? <TicketAgentModelRows settings={settings} onChange={update} /> : null
}

export function TicketAgentModelRows({
  settings,
  onChange
}: {
  settings: Pick<TicketPipelineSettings, StepModelKey>
  onChange: (patch: Partial<TicketPipelineSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const models = getAgentSessionOptionLaunchCatalog('claude')?.models ?? []
  const hidden = classifyAgentModels('claude', models).hidden
  const steps: { key: StepModelKey; label: string }[] = [
    {
      key: 'triageModel',
      label: t('auto.components.overview.launchTickets.triageModel', 'Triage runs')
    },
    {
      key: 'findingCheckModel',
      label: t('auto.components.overview.launchTickets.findingModel', 'Finding checks run')
    }
  ]
  return (
    // One grid for both rows so their selects line up whatever the label widths.
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
      {steps.map(({ key, label }) => (
        <StepModelSelect
          key={key}
          label={label}
          current={settings[key]}
          // A hidden model stays listed while it is the saved choice.
          models={models.filter(({ id }) => !hidden.has(id) || id === settings[key])}
          defaultLabel={t(
            'auto.components.overview.launchTickets.userDefaultModel',
            'Your default'
          )}
          onChange={(model) => onChange({ [key]: model } satisfies Partial<TicketPipelineSettings>)}
        />
      ))}
    </div>
  )
}

function StepModelSelect({
  label,
  current,
  models,
  defaultLabel,
  onChange
}: {
  label: string
  current: string | null
  models: readonly { id: string; label: string }[]
  defaultLabel: string
  onChange: (model: string | null) => void
}): React.JSX.Element {
  // A model set from the CLI that the catalog does not know still shows as itself.
  const unlisted = current && !models.some(({ id }) => id === current) ? current : null
  return (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select
        value={current ?? USER_DEFAULT}
        onValueChange={(value) => onChange(value === USER_DEFAULT ? null : value)}
      >
        <SelectTrigger size="sm" className="w-full min-w-0" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={USER_DEFAULT}>{defaultLabel}</SelectItem>
          {models.map(({ id, label: modelLabel }) => (
            <SelectItem key={id} value={id}>
              {modelLabel}
            </SelectItem>
          ))}
          {unlisted ? <SelectItem value={unlisted}>{unlisted}</SelectItem> : null}
        </SelectContent>
      </Select>
    </>
  )
}
