import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { openOverviewPrLink } from './overview-actions'
import type { OverviewPr } from '../../../../shared/overview/overview-model-types'
import { prChecksClass, prSummary } from './overview-presentation'

/** A workspace's PR state; opens the PR where links open, and names failing checks on hover. */
export function OverviewPrLink({
  pr,
  worktreeKey
}: {
  pr: OverviewPr | null
  /** The workspace's Overview key, so the link opens on the workspace's own host. */
  worktreeKey: string
}): React.JSX.Element {
  const t = useTranslate()
  if (!pr) {
    return <span className="text-muted-foreground">–</span>
  }
  const failing =
    pr.failingChecks.length > 0
      ? t('auto.components.overview.pr.failingChecks', 'Failing: {{names}}', {
          names: pr.failingChecks.join(', ')
        })
      : undefined
  if (!pr.url) {
    return (
      <span className={prChecksClass(pr)} title={failing}>
        {prSummary(pr)}
      </span>
    )
  }
  const url = pr.url
  return (
    <button
      type="button"
      className={cn('hover:underline', prChecksClass(pr))}
      title={
        failing ??
        t('auto.components.overview.pr.open', 'Open PR #{{number}}', {
          number: pr.number
        })
      }
      onClick={() => openOverviewPrLink(url, worktreeKey)}
    >
      {prSummary(pr)}
    </button>
  )
}
