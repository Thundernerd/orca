import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { SettingsSwitchRow } from '../form-controls/SettingsFormControls'
import { useTranslate } from '@/i18n/use-translate'

export function OverviewButtonSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const label = t(
    'auto.components.settings.AppearancePane.showOverviewButton',
    'Show overview button'
  )
  const shown = settings.showOverviewButton !== false
  return (
    <SearchableSetting title={label} keywords={['overview', 'projects', 'needs you', 'sidebar']}>
      <SettingsSwitchRow
        label={label}
        checked={shown}
        onChange={() => updateSettings({ showOverviewButton: !shown })}
      />
    </SearchableSetting>
  )
}
