import { LayoutGrid, RefreshCw, Rows3, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import type { OverviewLayout } from '../../../../shared/overview-prefs'
import type { OverviewActionResult } from './overview-actions'
import type { OverviewProject } from './overview-model-types'

export function OverviewHeader({
  needYou,
  activeProject,
  notice,
  layout,
  onLayoutChange,
  onRefresh,
  onDismissNotice
}: {
  needYou: number
  activeProject: OverviewProject | undefined
  notice: OverviewActionResult | null
  layout: OverviewLayout
  onLayoutChange: (layout: OverviewLayout) => void
  onRefresh: () => void
  onDismissNotice: () => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <header
      className="flex shrink-0 flex-col gap-1 px-4 pb-3 @3xl:px-5"
      // Why: no stacked center titlebar on this page; keep the header clear of Windows/Linux window controls.
      style={{ paddingRight: 'max(1rem, var(--window-controls-width, 0px))' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-base font-semibold leading-8">
            {t('auto.components.overview.title', 'Overview')}
          </h1>
          {needYou > 0 ? (
            <span className="rounded-full border border-status-warning-border bg-status-warning-background px-2 py-0.5 text-xs font-medium whitespace-nowrap text-status-warning-text">
              {t('auto.components.overview.needYouCount', '{{count}} need you', {
                count: needYou
              })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={layout}
            aria-label={t('auto.components.overview.layout', 'Layout')}
            onValueChange={(value) => {
              if (value === 'cards' || value === 'table') {
                onLayoutChange(value)
              }
            }}
          >
            <ToggleGroupItem
              value="cards"
              aria-label={t('auto.components.overview.layoutCards', 'Cards')}
              title={t('auto.components.overview.layoutCards', 'Cards')}
            >
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="table"
              aria-label={t('auto.components.overview.layoutTable', 'Table')}
              title={t('auto.components.overview.layoutTable', 'Table')}
            >
              <Rows3 />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('auto.components.overview.refresh', 'Refresh')}
            title={t('auto.components.overview.refresh', 'Refresh')}
            onClick={onRefresh}
          >
            <RefreshCw />
          </Button>
        </div>
      </div>
      {activeProject ? (
        <p className="truncate text-xs text-muted-foreground">
          {t('auto.components.overview.active', 'Active: {{project}} · {{workspace}}', {
            project: activeProject.name,
            workspace: activeProject.activeWorkspace ?? ''
          })}
        </p>
      ) : null}
      {notice ? (
        <div
          role={notice.ok ? 'status' : 'alert'}
          className={cn(
            'mt-1 flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs',
            notice.ok
              ? 'border-status-success-border bg-status-success-background'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          )}
        >
          <span>{notice.message}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('auto.components.overview.dismiss', 'Dismiss')}
            onClick={onDismissNotice}
          >
            <X />
          </Button>
        </div>
      ) : null}
    </header>
  )
}
