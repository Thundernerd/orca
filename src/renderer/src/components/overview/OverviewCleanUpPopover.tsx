import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useTranslate } from '@/i18n/use-translate'
import type { WorkspaceCleanReason } from '../../../../shared/ticket-pipeline/workspace-clean-verdict'
import type { WorkspaceCleanRow } from '../../../../shared/ticket-pipeline/ticket-types'
import { overviewTicketSettings, surveyOverviewClean } from './overview-ticket-pipeline'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; rows: WorkspaceCleanRow[]; selected: ReadonlySet<string>; autoClean: boolean }

function useReasonLabel(): (reason: WorkspaceCleanReason) => string {
  const t = useTranslate()
  const labels: Record<WorkspaceCleanReason, string> = {
    'not-in-orca': t('auto.components.overview.cleanUpWorkspaces.reason.notInOrca', 'not in Orca'),
    'has-children': t(
      'auto.components.overview.cleanUpWorkspaces.reason.hasChildren',
      'has workspaces of its own'
    ),
    'folder-gone': t(
      'auto.components.overview.cleanUpWorkspaces.reason.folderGone',
      'folder already gone'
    ),
    dirty: t(
      'auto.components.overview.cleanUpWorkspaces.reason.dirty',
      'uncommitted or untracked changes'
    ),
    'merge-in-progress': t(
      'auto.components.overview.cleanUpWorkspaces.reason.mergeInProgress',
      'merge or rebase in progress'
    ),
    'agent-active': t(
      'auto.components.overview.cleanUpWorkspaces.reason.agentActive',
      'an agent may be working'
    ),
    'merged-into-base': t(
      'auto.components.overview.cleanUpWorkspaces.reason.mergedIntoBase',
      'every commit is in the default branch'
    ),
    'review-merged': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewMerged',
      'PR merged'
    ),
    'review-merged-extra-commits': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewMergedExtra',
      'PR merged, but it has commits the PR never had'
    ),
    'review-open': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewOpen',
      'PR still open'
    ),
    'review-closed': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewClosed',
      'PR closed without merging'
    ),
    'not-merged': t(
      'auto.components.overview.cleanUpWorkspaces.reason.notMerged',
      'not merged and no PR'
    )
  }
  return (reason) => labels[reason]
}

/** Removes the main workspace's children that hold nothing worth keeping, after the user confirms. */
export function OverviewCleanUpPopover({
  projectId,
  projectName,
  busy,
  variant,
  onClean
}: {
  projectId: string
  projectName: string
  busy: boolean
  variant: 'outline' | 'ghost'
  onClean: (worktreeIds: string[]) => void
}): React.JSX.Element {
  const t = useTranslate()
  const reasonLabel = useReasonLabel()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const load = async (): Promise<void> => {
    setState({ kind: 'loading' })
    try {
      const [survey, settings] = await Promise.all([
        surveyOverviewClean(projectId),
        overviewTicketSettings(projectId)
      ])
      const removable = survey.rows.filter((row) => row.verdict === 'remove')
      setState({
        kind: 'loaded',
        rows: [...removable, ...survey.rows.filter((row) => row.verdict === 'keep')],
        selected: new Set(removable.map((row) => row.worktreeId)),
        autoClean: settings.autoClean
      })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const toggle = (worktreeId: string, checked: boolean): void => {
    setState((current) => {
      if (current.kind !== 'loaded') {
        return current
      }
      const selected = new Set(current.selected)
      if (checked) {
        selected.add(worktreeId)
      } else {
        selected.delete(worktreeId)
      }
      return { ...current, selected }
    })
  }

  const setAutoClean = (autoClean: boolean): void => {
    setState((current) => (current.kind === 'loaded' ? { ...current, autoClean } : current))
    void overviewTicketSettings(projectId, { autoClean }).catch(() =>
      setState((current) =>
        current.kind === 'loaded' ? { ...current, autoClean: !autoClean } : current
      )
    )
  }

  const selected = state.kind === 'loaded' ? [...state.selected] : []
  const autoCleanLabel = t(
    'auto.components.overview.cleanUpWorkspaces.auto',
    'Remove a ticket workspace automatically once its PR merges'
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          void load()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={variant} size="xs" disabled={busy}>
          {t('auto.components.overview.cleanUpWorkspaces.button', 'Clean up')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[32rem]">
        <div className="flex flex-col gap-2 p-3">
          <p className="text-xs font-semibold">
            {t(
              'auto.components.overview.cleanUpWorkspaces.title',
              'Clean up workspaces in {{project}}',
              {
                project: projectName
              }
            )}
          </p>
          {state.kind === 'loading' ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'auto.components.overview.cleanUpWorkspaces.loading',
                'Checking which workspaces are done…'
              )}
            </p>
          ) : state.kind === 'error' ? (
            <p className="text-xs text-destructive">{state.message}</p>
          ) : state.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'auto.components.overview.cleanUpWorkspaces.none',
                'The main workspace has no child workspaces.'
              )}
            </p>
          ) : (
            <ul className="scrollbar-sleek flex max-h-72 flex-col gap-1 overflow-y-auto">
              {state.rows.map((row) => (
                <li key={row.worktreeId} className="flex items-center gap-2">
                  <Checkbox
                    checked={state.selected.has(row.worktreeId)}
                    disabled={row.verdict === 'keep'}
                    onCheckedChange={(checked) => toggle(row.worktreeId, checked === true)}
                    aria-label={row.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">{row.name}</span>
                  <span
                    className={
                      row.verdict === 'remove'
                        ? 'shrink-0 text-xs text-muted-foreground'
                        : 'shrink-0 text-xs text-muted-foreground/70'
                    }
                  >
                    {reasonLabel(row.reason)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {state.kind === 'loaded' ? (
            <div className="flex items-center gap-2">
              <Switch
                checked={state.autoClean}
                onCheckedChange={setAutoClean}
                aria-label={autoCleanLabel}
              />
              <span className="text-xs text-muted-foreground">{autoCleanLabel}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {t(
                'auto.components.overview.cleanUpWorkspaces.hint',
                'Removal deletes the folder and closes its terminals. It cannot be undone.'
              )}
            </span>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || selected.length === 0}
              onClick={() => {
                onClean(selected)
                setOpen(false)
              }}
            >
              {t('auto.components.overview.cleanUpWorkspaces.remove', 'Remove {{count}}', {
                count: selected.length
              })}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
