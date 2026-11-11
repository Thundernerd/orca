import { useTranslate } from '@/i18n/use-translate'
import { useOverviewData } from './use-overview-data'

/** The sidebar entry's count of workspaces that need you. */
export function OverviewNeedsYouBadge(): React.JSX.Element | null {
  const t = useTranslate()
  const count = useOverviewData().snapshot.attention.length
  if (count === 0) {
    return null
  }
  return (
    <span
      className="rounded-full bg-status-warning-background px-1.5 text-[11px] font-medium text-status-warning-text"
      aria-label={t('auto.components.overview.badge', '{{count}} need you', { count })}
    >
      {count}
    </span>
  )
}
