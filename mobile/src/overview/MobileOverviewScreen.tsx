import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { CheckCheck, ChevronLeft, X } from 'lucide-react-native'
import { NavBar } from '../components/nav-bar/NavBar'
import { NavBarButton } from '../components/nav-bar/NavBarButton'
import { TextInputModal } from '../components/TextInputModal'
import { useHostProtocolGates } from '../components/host-protocol-gates-context'
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
import type { OverviewWorktreeInput } from '../../../src/shared/overview/overview-model-types'
import { overviewInputsFromRows } from './overview-ps-inputs'
import {
  canMarkReadFromPhone,
  useMobileOverviewActions,
  type MobileOverviewResult,
  type MobileOverviewSkill
} from './use-mobile-overview-actions'
import { MobileOverviewAttentionCard } from './MobileOverviewAttentionCard'
import { MobileOverviewProjectCard } from './MobileOverviewProjectCard'
import { overviewStyles as styles } from './mobile-overview-styles'

const NONE: ReadonlySet<string> = new Set()

type TextPrompt =
  | { kind: 'reply'; worktree: OverviewWorktreeInput; message: string | null }
  | { kind: 'write-ticket'; main: OverviewWorktreeInput; projectName: string }

/** Every project and workspace on this computer, with what needs you first. */
export function MobileOverviewScreen() {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const router = useRouteHandoff()
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const { client, state: connState } = useHostClient(hostId)
  const { hostCapabilities } = useHostProtocolGates()
  const now = useNow(30_000)
  const catalog = useHostQuery(
    hostWorktreeCatalogQuery,
    { hostId, client },
    HOST_LIST_TARGET,
    NO_HOST_LIST_INPUT
  )
  const actions = useMobileOverviewActions({ hostId, client, connState, hostCapabilities })
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [prompt, setPrompt] = useState<TextPrompt | null>(null)
  const [notice, setNotice] = useState<MobileOverviewResult | null>(null)
  const [busy, setBusy] = useState(false)

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
        pendingMerges: NONE,
        hidden: NONE,
        pinned: NONE,
        sort: 'attention',
        locale: getMobileUiLocale()
      })
    }
  }, [catalog.data])

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

  const mainOf = (projectId: string): OverviewWorktreeInput | null => {
    const id = snapshot.projects.find((p) => p.id === projectId)?.mainWorktreeId
    return id ? (byKey.get(id) ?? null) : null
  }
  const runSkill = (projectId: string, projectName: string, skill: MobileOverviewSkill): void => {
    const main = mainOf(projectId)
    if (!main) {
      return
    }
    if (skill === 'write-ticket') {
      setPrompt({ kind: 'write-ticket', main, projectName })
      return
    }
    void run(() => actions.runSkill(main, projectName, skill))
  }
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
            onRunSkill={(skill) => runSkill(project.id, project.name, skill)}
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
                'overview.mobile.writeTicketMessage',
                'What is broken, awkward or wanted? Claude investigates and asks you to confirm.'
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
        allowEmpty={prompt?.kind === 'write-ticket'}
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => {
          const current = prompt
          setPrompt(null)
          if (current?.kind === 'reply') {
            void run(() => actions.reply(current.worktree, value))
          } else if (current?.kind === 'write-ticket') {
            void run(() =>
              actions.runSkill(current.main, current.projectName, 'write-ticket', value)
            )
          }
        }}
      />
    </SafeAreaView>
  )
}
