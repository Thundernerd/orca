import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { OverviewPrefs } from '../../../../shared/overview-prefs'
import { useOverviewData } from './use-overview-data'
import { useOverviewTicketSurveys } from './use-overview-ticket-surveys'
import {
  markOverviewWorkspaceRead,
  openOverviewWorkspace,
  replyToOverviewWorkspace,
  runOverviewSkill,
  type OverviewActionResult,
  type OverviewSkill
} from './overview-actions'
import { OverviewAttentionCard, type OverviewAttentionCardActions } from './OverviewAttentionCard'
import { OverviewProjectCard, type OverviewProjectCardActions } from './OverviewProjectCard'

const PR_REFRESH_MS = 2 * 60_000
const CLOCK_MS = 30_000

type ListKey = 'pinned' | 'minimized' | 'hidden' | 'openTables'

function toggled(prefs: OverviewPrefs, key: ListKey, id: string): OverviewPrefs {
  const list = prefs[key]
  return { ...prefs, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }
}

function useCloseOnEscape(close: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        event.preventDefault()
        target.blur()
        return
      }
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])
}

export default function OverviewPage(): React.JSX.Element {
  const t = useTranslate()
  const closePage = useAppStore((state) => state.closeOverviewPage)
  const prefs = useAppStore((state) => state.overviewPrefs)
  const updatePrefs = useAppStore((state) => state.updateOverviewPrefs)
  const surveys = useOverviewTicketSurveys()
  const { snapshot, worktreesById, markMergePending } = useOverviewData(surveys.ticketsLoading)
  const [notice, setNotice] = useState<OverviewActionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useCloseOnEscape(closePage)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const gitWorktreeIds = useMemo(
    () => [...worktreesById.keys()].filter((id) => parseWorkspaceKey(id)?.type !== 'folder'),
    [worktreesById]
  )
  const refreshPrs = useCallback(() => {
    const { refreshGitHubForWorktreeIfStale } = useAppStore.getState()
    for (const id of gitWorktreeIds) {
      refreshGitHubForWorktreeIfStale(id)
    }
  }, [gitWorktreeIds])
  // PR/CI data is otherwise fetched only for cards on screen; keep every row here fresh.
  useEffect(() => {
    refreshPrs()
    const timer = window.setInterval(refreshPrs, PR_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refreshPrs])

  const { scheduleStale } = surveys
  useEffect(() => {
    scheduleStale(snapshot.projects)
  }, [now, scheduleStale, snapshot.projects])

  const run = useCallback(async (action: () => Promise<OverviewActionResult | null>) => {
    setBusy(true)
    try {
      const result = await action()
      if (result) {
        setNotice(result)
      }
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }, [])

  const open = useCallback(
    (worktreeId: string) => {
      const worktree = worktreesById.get(worktreeId)
      if (worktree) {
        openOverviewWorkspace(worktree)
      }
    },
    [worktreesById]
  )
  const mainOf = useCallback(
    (projectId: string) => {
      const mainId = snapshot.projects.find((p) => p.id === projectId)?.mainWorktreeId
      return mainId ? (worktreesById.get(mainId) ?? null) : null
    },
    [snapshot.projects, worktreesById]
  )
  const runSkill = useCallback(
    (projectId: string, skill: OverviewSkill) => {
      const main = mainOf(projectId)
      const project = snapshot.projects.find((p) => p.id === projectId)
      if (!main || !project) {
        return
      }
      void run(async () => {
        const result = await runOverviewSkill(main, project.name, skill)
        if (result.ok && skill === 'merge-tickets') {
          markMergePending(projectId)
        }
        return result
      })
    },
    [mainOf, markMergePending, run, snapshot.projects]
  )

  const attentionActions: OverviewAttentionCardActions = {
    busy,
    open,
    openMain: (projectId) => {
      const main = mainOf(projectId)
      if (main) {
        openOverviewWorkspace(main)
      }
    },
    reply: async (worktreeId, text) => {
      const worktree = worktreesById.get(worktreeId)
      if (!worktree) {
        return false
      }
      let sent = false
      await run(async () => {
        const result = await replyToOverviewWorkspace(worktree, text)
        sent = result.ok
        return result
      })
      return sent
    },
    markRead: (worktreeId) => {
      const worktree = worktreesById.get(worktreeId)
      if (worktree) {
        markOverviewWorkspaceRead(worktree)
      }
    },
    mergeTickets: (projectId) => runSkill(projectId, 'merge-tickets')
  }
  const projectActions: OverviewProjectCardActions = {
    busy,
    open,
    runSkill,
    refreshTickets: surveys.requestSurvey,
    togglePinned: (id) => updatePrefs((p) => toggled(p, 'pinned', id)),
    toggleMinimized: (id) => updatePrefs((p) => toggled(p, 'minimized', id)),
    toggleHidden: (id) => updatePrefs((p) => toggled(p, 'hidden', id)),
    toggleTable: (id) => updatePrefs((p) => toggled(p, 'openTables', id))
  }

  const activeProject = snapshot.projects.find((p) => p.isActive)
  const needYou = snapshot.attention.length

  return (
    <main className="@container relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground @3xl:pt-6">
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
              <span className="rounded-full border border-status-warning-border bg-status-warning-background px-2 py-0.5 text-xs font-medium text-status-warning-text">
                {t('auto.components.overview.needYouCount', '{{count}} need you', {
                  count: needYou
                })}
              </span>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('auto.components.overview.refresh', 'Refresh')}
            title={t('auto.components.overview.refresh', 'Refresh')}
            onClick={() => {
              refreshPrs()
              for (const project of snapshot.projects) {
                if (project.usesTickets && project.ticketSource && !project.hidden) {
                  surveys.requestSurvey(project.ticketSource)
                }
              }
            }}
          >
            <RefreshCw />
          </Button>
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
              onClick={() => setNotice(null)}
            >
              <X />
            </Button>
          </div>
        ) : null}
      </header>

      {snapshot.projects.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground @3xl:px-5">
          {t('auto.components.overview.empty', 'Add a project to see it here.')}
        </p>
      ) : (
        // One scrolling column when narrow (Needs you first); two independent columns when wide.
        <div className="scrollbar-sleek grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto px-4 pb-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] @3xl:content-stretch @3xl:overflow-hidden @3xl:px-5">
          <section
            aria-label={t('auto.components.overview.projects', 'Projects')}
            className="scrollbar-sleek @container order-2 min-h-0 @3xl:order-1 @3xl:overflow-y-auto"
          >
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
              {snapshot.projects.map((project) => (
                <OverviewProjectCard
                  key={project.id}
                  project={project}
                  minimized={prefs.minimized.includes(project.id)}
                  tableOpen={prefs.openTables.includes(project.id)}
                  ticketsUnavailable={
                    project.ticketSource !== null && surveys.unavailable.has(project.ticketSource)
                  }
                  now={now}
                  actions={projectActions}
                />
              ))}
            </div>
          </section>
          <aside
            aria-label={t('auto.components.overview.needsYou', 'Needs you')}
            className="scrollbar-sleek order-1 flex min-h-0 flex-col gap-2 @3xl:order-2 @3xl:overflow-y-auto"
          >
            <h2 className="text-sm font-semibold">
              {t('auto.components.overview.needsYou', 'Needs you')}
            </h2>
            {snapshot.attention.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('auto.components.overview.allClear', 'Nothing needs you right now.')}
              </p>
            ) : (
              snapshot.attention.map((item) => (
                <OverviewAttentionCard
                  key={item.key}
                  item={item}
                  canMerge={mainOf(item.projectId) !== null}
                  now={now}
                  actions={attentionActions}
                />
              ))
            )}
          </aside>
        </div>
      )}
    </main>
  )
}
