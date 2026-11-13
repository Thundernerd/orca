import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { OverviewPrefs } from '../../../../shared/overview-prefs'
import { useOverviewData } from './use-overview-data'
import { useOverviewTicketSurveys } from './use-overview-ticket-surveys'
import {
  cleanOverviewWorkspaces,
  launchOverviewTickets,
  mergeOverviewQueueHead,
  publishedDraftsNotice,
  startOverviewDraftingWithNotice
} from './overview-ticket-pipeline'
import type { TicketDraftBatch } from '../../../../shared/ticket-pipeline/ticket-draft-types'
import type { TicketLaunchSelection } from '../../../../shared/ticket-pipeline/ticket-types'
import {
  markOverviewWorkspaceRead,
  openOverviewWorkspace,
  replyToOverviewWorkspace,
  type OverviewActionResult
} from './overview-actions'
import { OverviewAttentionCard, type OverviewAttentionCardActions } from './OverviewAttentionCard'
import { OverviewProjectCard, type OverviewProjectCardActions } from './OverviewProjectCard'
import { OverviewHeader } from './OverviewHeader'
import { OverviewStatsStrip } from './OverviewStatsStrip'
import { OverviewTable } from './OverviewTable'
import { OverviewViewMenu } from './OverviewViewMenu'
import { useOverviewKeyboardTriage } from './use-overview-keyboard-triage'
import { sectionOverviewProjects } from './overview-project-sections'
import { tierOverviewProjects } from '../../../../shared/overview/overview-project-tiers'
import { OverviewProjectTierList } from './OverviewProjectTierList'
import { runWorktreeDelete } from '@/components/sidebar/workspace-actions/deletion/delete-worktree-flow'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'

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
  const projectGroups = useAppStore((state) => state.projectGroups)
  const surveys = useOverviewTicketSurveys()
  const { snapshot, worktreesById } = useOverviewData(surveys.ticketsLoading)
  const [notice, setNotice] = useState<OverviewActionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useCloseOnEscape(closePage)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [])

  // The list changes on every agent update; read it at refresh time so the timer is not restarted.
  const worktreesRef = useRef(worktreesById)
  worktreesRef.current = worktreesById
  const refreshPrs = useCallback(() => {
    const { refreshGitHubForWorktreeIfStale } = useAppStore.getState()
    for (const w of worktreesRef.current.values()) {
      if (parseWorkspaceKey(w.id)?.type !== 'folder') {
        refreshGitHubForWorktreeIfStale(w.id)
      }
    }
  }, [])
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
  const triage = useOverviewKeyboardTriage({
    items: snapshot.attention,
    onOpen: open,
    onMarkRead: (worktreeId) => {
      const worktree = worktreesById.get(worktreeId)
      if (worktree) {
        markOverviewWorkspaceRead(worktree)
      }
    }
  })
  const mainOf = useCallback(
    (projectId: string) => {
      const mainId = snapshot.projects.find((p) => p.id === projectId)?.mainWorktreeId
      return mainId ? (worktreesById.get(mainId) ?? null) : null
    },
    [snapshot.projects, worktreesById]
  )
  const writeTicket = useCallback(
    (projectId: string, request: string) => {
      const project = snapshot.projects.find((p) => p.id === projectId)
      if (project) {
        void run(() => startOverviewDraftingWithNotice(projectId, project.name, request))
      }
    },
    [run, snapshot.projects]
  )
  const ticketsPublished = useCallback(
    (projectId: string, batch: TicketDraftBatch) => {
      const project = snapshot.projects.find((p) => p.id === projectId)
      setNotice(publishedDraftsNotice(batch, project?.name ?? ''))
      if (project?.ticketSource) {
        surveys.requestSurvey(project.ticketSource)
      }
    },
    [snapshot.projects, surveys]
  )
  const mergeQueueHead = useCallback(
    (projectId: string) => {
      const project = snapshot.projects.find((p) => p.id === projectId)
      if (project) {
        void run(() => mergeOverviewQueueHead(projectId, project.name))
      }
    },
    [run, snapshot.projects]
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
    mergeTickets: mergeQueueHead,
    // The sidebar's delete funnel: its confirmation, unsaved-file and host checks apply.
    removeWorkspace: (worktreeId) => {
      const worktree = worktreesById.get(worktreeId)
      if (worktree) {
        runWorktreeDelete(
          worktree.id,
          worktree.executionHostId === LOCAL_EXECUTION_HOST_ID
            ? {}
            : { expectedHostId: worktree.executionHostId }
        )
      }
    }
  }
  const launchTickets = useCallback(
    (projectId: string, tickets: TicketLaunchSelection[]) => {
      const project = snapshot.projects.find((p) => p.id === projectId)
      if (!project) {
        return
      }
      void run(async () => {
        const result = await launchOverviewTickets(projectId, project.name, tickets)
        if (project.ticketSource) {
          surveys.requestSurvey(project.ticketSource)
        }
        return result
      })
    },
    [run, snapshot.projects, surveys]
  )
  const cleanUp = useCallback(
    (projectId: string, worktreeIds: string[]) => {
      const project = snapshot.projects.find((p) => p.id === projectId)
      if (project) {
        void run(() => cleanOverviewWorkspaces(projectId, project.name, worktreeIds))
      }
    },
    [run, snapshot.projects]
  )
  const projectActions: OverviewProjectCardActions = {
    busy,
    open,
    writeTicket,
    ticketsPublished,
    launchTickets,
    cleanUp,
    mergeQueueHead,
    refreshTickets: surveys.requestSurvey,
    togglePinned: (id) => updatePrefs((p) => toggled(p, 'pinned', id)),
    toggleMinimized: (id) => updatePrefs((p) => toggled(p, 'minimized', id)),
    toggleHidden: (id) => updatePrefs((p) => toggled(p, 'hidden', id)),
    toggleTable: (id) => updatePrefs((p) => toggled(p, 'openTables', id))
  }

  const layout = prefs.layout ?? 'cards'
  const sort = prefs.sort ?? 'attention'
  const groupBy = prefs.groupBy ?? 'none'
  const ungroupedLabel = t('auto.components.overview.ungrouped', 'Ungrouped')
  const tiers = tierOverviewProjects(snapshot.projects).map((tier) => ({
    key: tier.key,
    sections: sectionOverviewProjects(tier.projects, projectGroups, groupBy, ungroupedLabel)
  }))
  // Hidden projects are already out of Needs you, so they keep their unread flags.
  const unreadItems = snapshot.attention.filter((item) => item.unread)
  const refreshAll = (): void => {
    refreshPrs()
    for (const project of snapshot.projects) {
      if (project.usesTickets && project.ticketSource && !project.hidden) {
        surveys.requestSurvey(project.ticketSource)
      }
    }
  }

  return (
    <main className="@container relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground @3xl:pt-6">
      <OverviewHeader
        needYou={snapshot.attention.length}
        activeProject={snapshot.projects.find((p) => p.isActive)}
        notice={notice}
        layout={layout}
        onLayoutChange={(next) => updatePrefs((p) => ({ ...p, layout: next }))}
        onRefresh={refreshAll}
        onDismissNotice={() => setNotice(null)}
        unreadCount={unreadItems.length}
        viewMenu={
          <OverviewViewMenu
            sort={sort}
            groupBy={groupBy}
            onSortChange={(next) => updatePrefs((p) => ({ ...p, sort: next }))}
            onGroupByChange={(next) => updatePrefs((p) => ({ ...p, groupBy: next }))}
          />
        }
        onMarkAllRead={() => {
          for (const item of unreadItems) {
            const worktree = worktreesById.get(item.worktreeId)
            if (worktree) {
              markOverviewWorkspaceRead(worktree)
            }
          }
        }}
      />

      {snapshot.projects.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground @3xl:px-5">
          {t('auto.components.overview.empty', 'Add a project to see it here.')}
        </p>
      ) : layout === 'table' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 @3xl:px-5">
          <OverviewStatsStrip snapshot={snapshot} />
          <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-6 overflow-auto">
            <OverviewProjectTierList
              tiers={tiers}
              renderTier={(sections) => (
                <OverviewTable
                  sections={sections}
                  minimized={prefs.minimized}
                  ticketsUnavailable={(source) => surveys.unavailable.has(source)}
                  now={now}
                  projectActions={projectActions}
                  attentionActions={attentionActions}
                  triage={triage}
                />
              )}
            />
          </div>
        </div>
      ) : (
        // One scrolling column when narrow (Needs you first); two independent columns when wide.
        <div className="scrollbar-sleek grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto px-4 pb-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] @3xl:content-stretch @3xl:overflow-hidden @3xl:px-5">
          <section
            aria-label={t('auto.components.overview.projects', 'Projects')}
            className="scrollbar-sleek @container order-2 min-h-0 @3xl:order-1 @3xl:overflow-y-auto"
          >
            <div className="flex flex-col gap-6">
              <OverviewProjectTierList
                tiers={tiers}
                renderTier={(sections) => (
                  <div className="flex flex-col gap-4">
                    {sections.map((section) => (
                      <div key={section.key} className="flex flex-col gap-2">
                        {section.label ? (
                          <h2 className="text-xs font-semibold text-muted-foreground">
                            {section.label}
                          </h2>
                        ) : null}
                        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
                          {section.projects.map((project) => (
                            <OverviewProjectCard
                              key={project.id}
                              project={project}
                              minimized={prefs.minimized.includes(project.id)}
                              tableOpen={prefs.openTables.includes(project.id)}
                              ticketsUnavailable={
                                project.ticketSource !== null &&
                                surveys.unavailable.has(project.ticketSource)
                              }
                              now={now}
                              actions={projectActions}
                              onRemoveWorkspace={attentionActions.removeWorkspace}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
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
                  triage={triage}
                />
              ))
            )}
          </aside>
        </div>
      )}
    </main>
  )
}
