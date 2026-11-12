import { useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { CheckCheck, ChevronLeft, X } from 'lucide-react-native'
import { NavBar } from '../components/nav-bar/NavBar'
import { NavBarButton } from '../components/nav-bar/NavBarButton'
import { TextInputModal } from '../components/TextInputModal'
import { useHostClient } from '../transport/connection/host-client-hooks'
import { useRouteHandoff } from '../navigation/route-handoff'
import { useHostQuery } from '../query/host-query'
import {
  HOST_LIST_TARGET,
  NO_HOST_LIST_INPUT,
  hostWorktreeCatalogQuery
} from '../host-screen/host-list-queries'
import { useNow } from '../hooks/use-now'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { getMobileUiLocale } from '../i18n/mobile-i18n'
import { getExecutionHostLabel } from '../../../src/shared/execution-host'
import { buildOverviewSnapshot } from '../../../src/shared/overview/overview-model'
import type {
  OverviewSort,
  OverviewWorktreeInput
} from '../../../src/shared/overview/overview-model-types'
import { MobileSegmentedControl } from '../components/MobileSegmentedControl'
import { overviewInputsFromRows } from './overview-ps-inputs'
import { loadOverviewSort, saveOverviewSort } from './overview-sort-preference'
import {
  canMarkReadFromPhone,
  useMobileOverviewActions,
  type MobileOverviewResult
} from './use-mobile-overview-actions'
import { mobileTicketActions } from './mobile-ticket-actions'
import { MobileTicketSheet, type MobileTicketSheetMode } from './MobileTicketSheet'
import { MobileOverviewAttentionCard } from './MobileOverviewAttentionCard'
import { MobileOverviewProjectCard } from './MobileOverviewProjectCard'
import { overviewStyles as styles } from './mobile-overview-styles'

const NONE: ReadonlySet<string> = new Set()

type TextPrompt =
  | { kind: 'reply'; worktree: OverviewWorktreeInput; message: string | null }
  | { kind: 'write-ticket'; projectId: string; projectName: string }

/** Every project and workspace on this computer, with what needs you first. */
export function MobileOverviewScreen() {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const router = useRouteHandoff()
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const { client, state: connState } = useHostClient(hostId)
  const now = useNow(30_000)
  const catalog = useHostQuery(
    hostWorktreeCatalogQuery,
    { hostId, client },
    HOST_LIST_TARGET,
    NO_HOST_LIST_INPUT
  )
  const actions = useMobileOverviewActions({ hostId, client, connState })
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [prompt, setPrompt] = useState<TextPrompt | null>(null)
  const [sheet, setSheet] = useState<{
    mode: MobileTicketSheetMode
    projectId: string
    projectName: string
  } | null>(null)
  const [notice, setNotice] = useState<MobileOverviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [sort, setSort] = useState<OverviewSort>('attention')

  useEffect(() => {
    let cancelled = false
    void loadOverviewSort().then((saved) => {
      if (!cancelled) {
        setSort(saved)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const changeSort = (next: OverviewSort): void => {
    setSort(next)
    void saveOverviewSort(next).catch(() => {})
  }

  const { snapshot, byKey } = useMemo(() => {
    const inputs = overviewInputsFromRows(catalog.data?.worktrees ?? [], (hostId) =>
      getExecutionHostLabel(hostId)
    )
    return {
      byKey: new Map(inputs.worktrees.map((w) => [w.key, w])),
      snapshot: buildOverviewSnapshot({
        ...inputs,
        tickets: {},
        ticketsLoading: NONE,
        hidden: NONE,
        pinned: NONE,
        sort,
        locale: getMobileUiLocale()
      })
    }
  }, [catalog.data, sort])

  const run = async (action: () => Promise<MobileOverviewResult>): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await action()
      setNotice(result)
      return result.ok
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) })
      return false
    } finally {
      setBusy(false)
    }
  }

  const live = client !== null && connState === 'connected' ? client : null
  const ticketActions = useMemo(
    () => (live && sheet ? mobileTicketActions(live, sheet.projectId) : null),
    [live, sheet]
  )
  const unread = snapshot.attention
    .filter((item) => item.unread)
    .flatMap((item) => byKey.get(item.worktreeId) ?? [])
    .filter(canMarkReadFromPhone)

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <NavBar
        leading={
          <NavBarButton
            icon={ChevronLeft}
            onPress={() => router.back()}
            accessibilityLabel={t('common.back', 'Back')}
          />
        }
        title={t('overview.mobile.title', 'Overview')}
        subtitle={
          snapshot.attention.length > 0
            ? t('overview.mobile.needYouCount', '{{count}} need you', {
                count: snapshot.attention.length
              })
            : undefined
        }
        refreshing={catalog.isFetching}
        trailing={
          unread.length > 0 ? (
            <NavBarButton
              icon={CheckCheck}
              disabled={busy}
              onPress={() => void run(() => actions.markRead(unread))}
              accessibilityLabel={t('overview.mobile.markAllRead', 'Mark all {{count}} read', {
                count: unread.length
              })}
            />
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={catalog.isRefetching}
            onRefresh={() => void catalog.refetch()}
            tintColor={colors.textSecondary}
          />
        }
      >
        {notice ? (
          <View style={[styles.notice, notice.ok ? styles.noticeOk : styles.noticeError]}>
            <Text style={[styles.text, styles.grow]}>{notice.message}</Text>
            <Pressable
              onPress={() => setNotice(null)}
              accessibilityRole="button"
              accessibilityLabel={t('overview.mobile.dismiss', 'Dismiss')}
            >
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('overview.mobile.needsYou', 'Needs you')}</Text>
        </View>
        {snapshot.attention.length === 0 ? (
          <Text style={styles.empty}>
            {catalog.isPending
              ? t('overview.mobile.loading', 'Reading your workspaces…')
              : t('overview.mobile.allClear', 'Nothing needs you right now.')}
          </Text>
        ) : (
          snapshot.attention.map((item) => {
            const worktree = byKey.get(item.worktreeId)
            if (!worktree) {
              return null
            }
            return (
              <MobileOverviewAttentionCard
                key={item.key}
                item={item}
                now={now}
                canMarkRead={canMarkReadFromPhone(worktree)}
                onOpen={() => actions.open(worktree)}
                onReply={() =>
                  setPrompt({
                    kind: 'reply',
                    worktree,
                    message: item.reasons[0] ?? null
                  })
                }
                onMarkRead={() => void run(() => actions.markRead([worktree]))}
              />
            )
          })
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('overview.mobile.projects', 'Projects')}</Text>
          <MobileSegmentedControl
            segments={[
              {
                value: 'attention',
                label: t('overview.mobile.sortAttention', 'Needs you first')
              },
              { value: 'name', label: t('overview.mobile.sortName', 'Name') }
            ]}
            selected={sort}
            onSelect={changeSort}
            testIDPrefix="overview-sort-"
          />
        </View>
        {snapshot.projects.map((project) => (
          <MobileOverviewProjectCard
            key={project.id}
            project={project}
            now={now}
            busy={busy}
            expanded={expanded.has(project.id)}
            onToggle={() =>
              setExpanded((current) => {
                const next = new Set(current)
                if (!next.delete(project.id)) {
                  next.add(project.id)
                }
                return next
              })
            }
            onOpenWorkspace={(key) => {
              const worktree = byKey.get(key)
              if (worktree) {
                actions.open(worktree)
              }
            }}
            onOpenTickets={(mode) =>
              setSheet({ mode, projectId: project.id, projectName: project.name })
            }
            onWriteTicket={() =>
              setPrompt({ kind: 'write-ticket', projectId: project.id, projectName: project.name })
            }
          />
        ))}
      </ScrollView>

      <TextInputModal
        visible={prompt !== null}
        title={
          prompt?.kind === 'reply'
            ? t('overview.mobile.replyTitle', 'Reply to {{name}}', { name: prompt.worktree.name })
            : t('overview.mobile.writeTicketTitle', 'Write a ticket for {{project}}', {
                project: prompt?.kind === 'write-ticket' ? prompt.projectName : ''
              })
        }
        message={
          prompt?.kind === 'reply'
            ? (prompt.message ?? undefined)
            : t(
                'overview.mobile.writeTicketDraftMessage',
                'What is broken, awkward or wanted? Claude drafts the tickets; you publish them from Drafts.'
              )
        }
        placeholder={
          prompt?.kind === 'reply'
            ? t('overview.mobile.replyPlaceholder', 'Reply to the agent…')
            : t('overview.mobile.writeTicketPlaceholder', 'One item, or a list')
        }
        submitLabel={
          prompt?.kind === 'reply'
            ? t('overview.mobile.send', 'Send')
            : t('overview.mobile.writeTicket', 'Write ticket')
        }
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => {
          const current = prompt
          setPrompt(null)
          if (current?.kind === 'reply') {
            void run(() => actions.reply(current.worktree, value))
          } else if (current?.kind === 'write-ticket' && live) {
            void run(() => mobileTicketActions(live, current.projectId).startDraft(value))
          }
        }}
      />
      <MobileTicketSheet
        mode={sheet?.mode ?? null}
        projectName={sheet?.projectName ?? ''}
        actions={ticketActions}
        onClose={() => setSheet(null)}
        onResult={(action) => void run(action)}
      />
    </SafeAreaView>
  )
}
