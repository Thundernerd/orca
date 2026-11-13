import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Check, Circle } from 'lucide-react-native'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { MobileTicketActions, MobileTicketResult } from './mobile-ticket-actions'
import type {
  MobileTicketDraftBatch,
  MobileTicketQueue,
  MobileTicketSurvey,
  MobileWorkspaceCleanSurvey
} from './overview-ticket-operations'
import { overviewStyles as styles } from './mobile-overview-styles'

export type MobileTicketSheetMode = 'launch' | 'clean' | 'queue' | 'drafts'

type Loaded =
  | { mode: 'launch'; survey: MobileTicketSurvey }
  | { mode: 'clean'; survey: MobileWorkspaceCleanSurvey }
  | { mode: 'queue'; queue: MobileTicketQueue }
  | { mode: 'drafts'; batches: MobileTicketDraftBatch[] }

async function load(mode: MobileTicketSheetMode, actions: MobileTicketActions): Promise<Loaded> {
  switch (mode) {
    case 'launch':
      return { mode, survey: await actions.survey() }
    case 'clean':
      return { mode, survey: await actions.cleanSurvey() }
    case 'queue':
      return { mode, queue: await actions.queue() }
    case 'drafts':
      return { mode, batches: (await actions.drafts()).filter((b) => b.status === 'review') }
  }
}

function Toggle({
  checked,
  label,
  meta,
  disabled,
  onPress
}: {
  checked: boolean
  label: string
  meta?: string
  disabled?: boolean
  onPress: () => void
}) {
  const Icon = checked ? Check : Circle
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.workspaceRow, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Icon size={16} color={disabled ? colors.textSecondary : colors.textPrimary} />
        <View style={styles.grow}>
          <Text style={styles.text} numberOfLines={2}>
            {label}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </View>
    </Pressable>
  )
}

/** Selects every row that can go, or none once all are selected. */
function SelectAllToggle({
  ids,
  selected,
  onChange
}: {
  ids: readonly string[]
  selected: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}) {
  const t = useMobileTranslation()
  if (ids.length < 2) {
    return null
  }
  const all = selected.size === ids.length
  return (
    <Toggle
      checked={all}
      label={
        all
          ? t('overview.mobile.tickets.deselectAll', 'Deselect all')
          : t('overview.mobile.tickets.selectAll', 'Select all')
      }
      meta={t('overview.mobile.tickets.selectedCount', '{{count}} of {{total}} selected', {
        count: selected.size,
        total: ids.length
      })}
      onPress={() => onChange(new Set(all ? [] : ids))}
    />
  )
}

function ActionButton({
  label,
  disabled,
  onPress
}: {
  label: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

/** Launch, clean up, merge and draft review for one project, run on the host that serves it. */
export function MobileTicketSheet({
  mode,
  projectName,
  actions,
  onClose,
  onResult
}: {
  mode: MobileTicketSheetMode | null
  projectName: string
  actions: MobileTicketActions | null
  onClose: () => void
  onResult: (run: () => Promise<MobileTicketResult>) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    setLoaded(null)
    setError(null)
    if (!mode || !actions) {
      return
    }
    let live = true
    load(mode, actions).then(
      (next) => {
        if (!live) {
          return
        }
        setLoaded(next)
        // Everything that can go is preselected, as on the desktop.
        if (next.mode === 'launch') {
          setSelected(
            new Set(next.survey.rows.filter((r) => r.status === 'ready').map((r) => r.ticket.id))
          )
        } else if (next.mode === 'clean') {
          setSelected(
            new Set(next.survey.rows.filter((r) => r.verdict === 'remove').map((r) => r.worktreeId))
          )
        }
      },
      (caught: unknown) =>
        live && setError(caught instanceof Error ? caught.message : String(caught))
    )
    return () => {
      live = false
    }
  }, [mode, actions])

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) {
        next.add(id)
      }
      return next
    })

  const selectableIds =
    loaded?.mode === 'launch'
      ? loaded.survey.rows.filter((r) => r.status === 'ready').map((r) => r.ticket.id)
      : loaded?.mode === 'clean'
        ? loaded.survey.rows.filter((r) => r.verdict === 'remove').map((r) => r.worktreeId)
        : []

  const finish = (run: () => Promise<MobileTicketResult>) => {
    onClose()
    onResult(run)
  }

  const title = {
    launch: t('overview.mobile.tickets.launchTitle', 'Launch tickets in {{project}}', {
      project: projectName
    }),
    clean: t('overview.mobile.tickets.cleanTitle', 'Clean up {{project}}', {
      project: projectName
    }),
    queue: t('overview.mobile.tickets.queueTitle', 'Merge queue in {{project}}', {
      project: projectName
    }),
    drafts: t('overview.mobile.tickets.draftsTitle', 'Ticket drafts for {{project}}', {
      project: projectName
    })
  }

  return (
    <BottomDrawer visible={mode !== null} onClose={onClose} contentScrollable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{mode ? title[mode] : ''}</Text>
        {error ? <Text style={styles.empty}>{error}</Text> : null}
        {!loaded && !error ? (
          <Text style={styles.empty}>{t('overview.mobile.tickets.loading', 'Loading…')}</Text>
        ) : null}

        {loaded?.mode === 'launch' ? (
          <>
            <SelectAllToggle ids={selectableIds} selected={selected} onChange={setSelected} />
            {loaded.survey.rows.map((row) => (
              <Toggle
                key={row.ticket.id}
                checked={selected.has(row.ticket.id)}
                disabled={row.status !== 'ready'}
                label={`${row.ticket.id} ${row.ticket.title}`}
                meta={
                  row.status === 'ready'
                    ? undefined
                    : row.waitingOn.length > 0
                      ? `${row.status}: ${row.waitingOn.join(', ')}`
                      : row.status
                }
                onPress={() => toggle(row.ticket.id)}
              />
            ))}
            {loaded.survey.rows.length === 0 ? (
              <Text style={styles.empty}>
                {t('overview.mobile.tickets.noTickets', 'No open tickets.')}
              </Text>
            ) : null}
            <ActionButton
              label={t('overview.mobile.tickets.launch', 'Launch {{count}}', {
                count: selected.size
              })}
              disabled={selected.size === 0}
              onPress={() => {
                const ids = [...selected]
                finish(() => actions!.launch(ids))
              }}
            />
          </>
        ) : null}

        {loaded?.mode === 'clean' ? (
          <>
            <SelectAllToggle ids={selectableIds} selected={selected} onChange={setSelected} />
            {loaded.survey.rows.map((row) => (
              <Toggle
                key={row.worktreeId}
                checked={selected.has(row.worktreeId)}
                disabled={row.verdict !== 'remove'}
                label={row.name}
                meta={row.reason}
                onPress={() => toggle(row.worktreeId)}
              />
            ))}
            {loaded.survey.rows.length === 0 ? (
              <Text style={styles.empty}>
                {t(
                  'overview.mobile.tickets.noChildren',
                  'The main workspace has no child workspaces.'
                )}
              </Text>
            ) : null}
            <ActionButton
              label={t('overview.mobile.tickets.remove', 'Remove {{count}}', {
                count: selected.size
              })}
              disabled={selected.size === 0}
              onPress={() => {
                const ids = [...selected]
                const names = new Map(loaded.survey.rows.map((row) => [row.worktreeId, row.name]))
                finish(() => actions!.clean(ids, names))
              }}
            />
          </>
        ) : null}

        {loaded?.mode === 'queue' ? (
          <>
            {loaded.queue.pausedReason ? (
              <Text style={styles.text}>
                {t('overview.mobile.tickets.paused', 'Paused: {{reason}}', {
                  reason: loaded.queue.pausedReason
                })}
              </Text>
            ) : null}
            {loaded.queue.entries.map((entry) => (
              <View key={entry.itemId} style={styles.workspaceRow}>
                <Text style={styles.text} numberOfLines={2}>
                  {`${entry.ticketId} ${entry.ticketTitle}${entry.reviewNumber ? ` · #${entry.reviewNumber}` : ''}`}
                </Text>
                <Text style={styles.meta}>
                  {entry.queue?.detail ??
                    t('overview.mobile.tickets.waitingTurn', 'Waiting its turn.')}
                </Text>
              </View>
            ))}
            {loaded.queue.entries.length === 0 ? (
              <Text style={styles.empty}>
                {t('overview.mobile.tickets.queueEmpty', 'No ticket PRs are waiting to merge.')}
              </Text>
            ) : null}
            <View style={styles.wrap}>
              {loaded.queue.pausedReason ? (
                <ActionButton
                  label={t('overview.mobile.tickets.resume', 'Resume')}
                  onPress={() =>
                    finish(async () => {
                      await actions!.queue('resume')
                      return {
                        ok: true,
                        message: t('overview.mobile.tickets.resumed', 'Merge queue resumed')
                      }
                    })
                  }
                />
              ) : null}
              {loaded.queue.entries[0]?.queue?.status === 'ready' && !loaded.queue.pausedReason ? (
                <ActionButton
                  label={t('overview.mobile.tickets.merge', 'Merge {{ticket}}', {
                    ticket: loaded.queue.entries[0].ticketId
                  })}
                  onPress={() => {
                    const head = loaded.queue.entries[0]!
                    finish(async () => {
                      await actions!.merge(head.itemId)
                      return {
                        ok: true,
                        message: t('overview.mobile.tickets.merged', 'Merged {{ticket}}', {
                          ticket: head.ticketId
                        })
                      }
                    })
                  }}
                />
              ) : null}
            </View>
          </>
        ) : null}

        {loaded?.mode === 'drafts' ? (
          <>
            {loaded.batches.length === 0 ? (
              <Text style={styles.empty}>
                {t('overview.mobile.tickets.noDrafts', 'No drafts are waiting for review.')}
              </Text>
            ) : null}
            {loaded.batches.map((batch) => (
              <View key={batch.id} style={styles.card}>
                <Text style={styles.meta} numberOfLines={2}>
                  {batch.request}
                </Text>
                {batch.drafts.map((draft) => (
                  <Text key={draft.key} style={styles.text}>{`• ${draft.title}`}</Text>
                ))}
                {batch.decisions.map((decision) => (
                  <Text key={decision} style={styles.meta}>{`– ${decision}`}</Text>
                ))}
                <View style={styles.wrap}>
                  <ActionButton
                    label={t('overview.mobile.tickets.publish', 'Publish {{count}}', {
                      count: batch.drafts.length
                    })}
                    onPress={() =>
                      finish(async () => {
                        const done = await actions!.publish(batch)
                        return done.status === 'published'
                          ? {
                              ok: true,
                              message: t('overview.mobile.tickets.published', 'Published {{ids}}', {
                                ids: done.published.map((p) => p.id).join(', ')
                              })
                            }
                          : {
                              ok: false,
                              message:
                                done.error ??
                                t('overview.mobile.tickets.publishStopped', 'Publishing stopped')
                            }
                      })
                    }
                  />
                  <ActionButton
                    label={t('overview.mobile.tickets.discard', 'Discard')}
                    onPress={() =>
                      finish(async () => {
                        await actions!.discard(batch.id)
                        return {
                          ok: true,
                          message: t('overview.mobile.tickets.discarded', 'Drafts discarded')
                        }
                      })
                    }
                  />
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </BottomDrawer>
  )
}
