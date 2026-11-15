import { useMemo } from 'react'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import {
  selectOverviewNeedsYouCount,
  selectOverviewTicketProjectKey
} from './overview-needs-you-count'
import { useOverviewAutomatedWorktrees } from './use-overview-ticket-status'

/** The sidebar entry's count of workspaces that need you. */
export function OverviewNeedsYouBadge(): React.JSX.Element | null {
  const t = useTranslate()
  const projectKey = useAppStore(selectOverviewTicketProjectKey)
  const projectIds = useMemo(() => (projectKey ? projectKey.split('\n') : []), [projectKey])
  const automated = useOverviewAutomatedWorktrees(projectIds)
  const count = useAppStore((state) => selectOverviewNeedsYouCount(state, automated))
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
