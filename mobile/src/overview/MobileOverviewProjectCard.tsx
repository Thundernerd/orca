import { Pressable, Text, View } from 'react-native'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import type {
  OverviewProject,
  OverviewWorkspaceRow
} from '../../../src/shared/overview/overview-model-types'
import { AgentStateDot } from '../components/AgentStateDot'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { Translate } from '../i18n/mobile-i18n'
import { formatTimeAgo } from '../worktree/agent-row-display'
import type { MobileTicketSheetMode } from './MobileTicketSheet'
import { overviewStyles as styles } from './mobile-overview-styles'

function Stat({ label, tone }: { label: string; tone?: 'urgent' | 'ready' }) {
  const chip =
    tone === 'urgent' ? styles.chipUrgent : tone === 'ready' ? styles.chipReady : styles.chipNeutral
  const text =
    tone === 'urgent'
      ? styles.chipUrgentText
      : tone === 'ready'
        ? styles.chipReadyText
        : styles.chipNeutralText
  return (
    <View style={[styles.chip, chip]}>
      <Text style={[styles.chipText, text]}>{label}</Text>
    </View>
  )
}

function prLabel(pr: NonNullable<OverviewWorkspaceRow['pr']>, t: Translate): string {
  const number = pr.number
  if (pr.state === 'merged') {
    return t('overview.mobile.pr.merged', '#{{number}} merged', { number })
  }
  if (pr.state === 'closed') {
    return t('overview.mobile.pr.closed', '#{{number}} closed', { number })
  }
  switch (pr.checks) {
    case 'failure':
      return t('overview.mobile.pr.failing', '#{{number}} failing', { number })
    case 'pending':
      return t('overview.mobile.pr.pending', '#{{number}} pending', { number })
    case 'success':
      return t('overview.mobile.pr.green', '#{{number}} green', { number })
    case 'none':
      return `#${number}`
  }
}

function WorkspaceRow({
  row,
  now,
  onOpen
}: {
  row: OverviewWorkspaceRow
  now: number
  onOpen: () => void
}) {
  const t = useMobileTranslation()
  const pr = row.pr
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={row.name}
      style={({ pressed }) => [styles.workspaceRow, pressed && styles.pressed]}
    >
      {row.agentState ? <AgentStateDot state={row.agentState} /> : null}
      <Text style={[styles.text, styles.grow]} numberOfLines={1}>
        {row.name}
        {row.isMain && row.name !== 'main' ? ` ${t('overview.mobile.mainLabel', '(main)')}` : ''}
      </Text>
      {pr ? <Text style={styles.meta}>{prLabel(pr, t)}</Text> : null}
      {row.cleanable ? (
        <Text style={styles.meta}>{t('overview.mobile.cleanUp', 'clean up')}</Text>
      ) : row.lastActivityAt ? (
        <Text style={styles.meta}>{formatTimeAgo(row.lastActivityAt, now)}</Text>
      ) : null}
    </Pressable>
  )
}

export function MobileOverviewProjectCard({
  project,
  now,
  expanded,
  busy,
  onToggle,
  onOpenWorkspace,
  onOpenTickets,
  onWriteTicket
}: {
  project: OverviewProject
  now: number
  expanded: boolean
  busy: boolean
  onToggle: () => void
  onOpenWorkspace: (worktreeId: string) => void
  onOpenTickets: (mode: MobileTicketSheetMode) => void
  onWriteTicket: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Chevron size={16} color={colors.textSecondary} />
        <Text style={[styles.title, styles.grow]} numberOfLines={1}>
          {project.name}
        </Text>
        {project.host ? <Stat label={project.host} /> : null}
      </Pressable>
      <View style={styles.wrap}>
        {project.attentionCount > 0 ? (
          <Stat
            tone="urgent"
            label={t('overview.mobile.stat.needYou', '{{count}} need you', {
              count: project.attentionCount
            })}
          />
        ) : null}
        {project.runningAgents > 0 ? (
          <Stat
            label={t('overview.mobile.stat.working', '{{count}} working', {
              count: project.runningAgents
            })}
          />
        ) : null}
        {project.openPrs > 0 ? (
          <Stat
            label={
              project.openPrs === 1
                ? t('overview.mobile.stat.openPrs_one', '{{count}} open PR', { count: 1 })
                : t('overview.mobile.stat.openPrs_other', '{{count}} open PRs', {
                    count: project.openPrs
                  })
            }
          />
        ) : null}
        {project.readyPrs > 0 ? (
          <Stat
            tone="ready"
            label={t('overview.mobile.stat.ready', '{{count}} ready', { count: project.readyPrs })}
          />
        ) : null}
        <Stat
          label={
            project.workspaces.length === 1
              ? t('overview.mobile.stat.workspaces_one', '{{count}} workspace', { count: 1 })
              : t('overview.mobile.stat.workspaces_other', '{{count}} workspaces', {
                  count: project.workspaces.length
                })
          }
        />
      </View>
      {expanded ? (
        <>
          {project.mainWorktreeId ? (
            <View style={styles.wrap}>
              {(
                [
                  ['launch', t('overview.mobile.tickets.launchButton', 'Launch tickets')],
                  ['queue', t('overview.mobile.tickets.queueButton', 'Merge queue')],
                  ['clean', t('overview.mobile.tickets.cleanButton', 'Clean up')],
                  ['drafts', t('overview.mobile.tickets.draftsButton', 'Drafts')]
                ] as const
              ).map(([mode, label]) => (
                <Pressable
                  key={mode}
                  disabled={busy}
                  onPress={() => onOpenTickets(mode)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                >
                  <Text style={styles.buttonText}>{label}</Text>
                </Pressable>
              ))}
              <Pressable
                disabled={busy}
                onPress={onWriteTicket}
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>
                  {t('overview.mobile.writeTicket', 'Write ticket')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View>
            {project.workspaces.map((row) => (
              <WorkspaceRow
                key={row.worktreeId}
                row={row}
                now={now}
                onOpen={() => onOpenWorkspace(row.worktreeId)}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}
