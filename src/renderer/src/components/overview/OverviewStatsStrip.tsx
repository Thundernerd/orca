import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import type { OverviewSnapshot } from '../../../../shared/overview/overview-model-types'

/** Totals across the visible projects, shown above the table layout. */
export function OverviewStatsStrip({
  snapshot
}: {
  snapshot: OverviewSnapshot
}): React.JSX.Element {
  const t = useTranslate()
  const projects = snapshot.projects.filter((p) => !p.hidden)
  const sum = (pick: (p: (typeof projects)[number]) => number): number =>
    projects.reduce((total, p) => total + pick(p), 0)
  const stats = [
    {
      key: 'needYou',
      value: snapshot.attention.length,
      label: t('auto.components.overview.stats.needYou', 'need you'),
      tone: 'text-destructive'
    },
    {
      key: 'working',
      value: sum((p) => p.runningAgents),
      label: t('auto.components.overview.stats.working', 'agents working')
    },
    {
      key: 'openPrs',
      value: sum((p) => p.openPrs),
      label: t('auto.components.overview.stats.openPrs', 'open PRs')
    },
    {
      key: 'ready',
      value: sum((p) => p.readyPrs),
      label: t('auto.components.overview.stats.ready', 'ready to merge'),
      tone: 'text-status-success'
    },
    {
      key: 'tickets',
      value: sum((p) => p.tickets?.ready ?? 0),
      label: t('auto.components.overview.stats.tickets', 'tickets ready')
    },
    {
      key: 'cleanup',
      value: sum((p) => p.cleanupCount),
      label: t('auto.components.overview.stats.cleanup', 'to clean up')
    }
  ]
  return (
    <div className="grid shrink-0 grid-cols-3 gap-2 @3xl:grid-cols-6">
      {stats.map((stat) => (
        <div key={stat.key} className="rounded-lg border border-border px-3 py-2">
          <div className={cn('text-xl font-semibold tabular-nums', stat.value > 0 && stat.tone)}>
            {stat.value}
          </div>
          <div className="text-xs text-muted-foreground">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
