import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { openHttpLink } from '@/lib/browser/navigation/http-link-routing'
import type { OverviewPr } from './overview-model-types'
import { prChecksClass, prSummary } from './overview-presentation'

/** A workspace's PR state; opens the PR where links open, and names failing checks on hover. */
export function OverviewPrLink({ pr }: { pr: OverviewPr | null }): React.JSX.Element {
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
      onClick={() => openHttpLink(url)}
    >
      {prSummary(pr)}
    </button>
  )
}
