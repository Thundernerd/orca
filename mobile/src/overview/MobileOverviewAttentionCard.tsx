import { Pressable, Text, View } from 'react-native'
import { Check, ExternalLink, MessageSquareReply } from 'lucide-react-native'
import type {
  OverviewAttentionItem,
  OverviewAttentionKind
} from '../../../src/shared/overview/overview-model-types'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { formatTimeAgo } from '../worktree/agent-row-display'
import { overviewStyles as styles } from './mobile-overview-styles'

function kindTone(kind: OverviewAttentionKind) {
  switch (kind) {
    case 'agent-waiting':
    case 'ci-failing':
      return { card: styles.cardUrgent, chip: styles.chipUrgent, text: styles.chipUrgentText }
    case 'pr-ready':
      return { card: styles.cardReady, chip: styles.chipReady, text: styles.chipReadyText }
    case 'flagged':
      return { card: styles.cardFlagged, chip: styles.chipFlagged, text: styles.chipFlaggedText }
  }
}

export function MobileOverviewAttentionCard({
  item,
  now,
  canMarkRead,
  onOpen,
  onReply,
  onMarkRead
}: {
  item: OverviewAttentionItem
  now: number
  canMarkRead: boolean
  onOpen: () => void
  onReply: () => void
  onMarkRead: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const kindLabel = (kind: OverviewAttentionKind): string => {
    switch (kind) {
      case 'agent-waiting':
        return t('overview.mobile.kind.agentWaiting', 'Agent waiting')
      case 'ci-failing':
        return t('overview.mobile.kind.ciFailing', 'CI failing')
      case 'pr-ready':
        return t('overview.mobile.kind.prReady', 'Ready to merge')
      case 'flagged':
        return t('overview.mobile.kind.flagged', 'Flagged')
    }
  }
  const waiting = item.kinds.includes('agent-waiting')
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.projectName} · ${item.workspaceName}`}
      style={({ pressed }) => [styles.card, kindTone(item.kind).card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={[styles.wrap, styles.grow]}>
          {item.kinds.map((kind) => {
            const tone = kindTone(kind)
            return (
              <View key={kind} style={[styles.chip, tone.chip]}>
                <Text style={[styles.chipText, tone.text]}>{kindLabel(kind)}</Text>
              </View>
            )
          })}
          {item.host ? (
            <View style={[styles.chip, styles.chipNeutral]}>
              <Text style={[styles.chipText, styles.chipNeutralText]}>{item.host}</Text>
            </View>
          ) : null}
        </View>
        {item.since ? <Text style={styles.meta}>{formatTimeAgo(item.since, now)}</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {item.projectName} · {item.workspaceName}
      </Text>
      {item.reasons.map((reason) => (
        <Text key={reason} style={styles.meta} numberOfLines={3}>
          {reason}
        </Text>
      ))}
      <View style={styles.wrap}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <ExternalLink size={14} color={colors.textPrimary} />
          <Text style={styles.buttonText}>{t('overview.mobile.open', 'Open')}</Text>
        </Pressable>
        {waiting ? (
          <Pressable
            onPress={onReply}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <MessageSquareReply size={14} color={colors.textPrimary} />
            <Text style={styles.buttonText}>{t('overview.mobile.reply', 'Reply')}</Text>
          </Pressable>
        ) : null}
        {item.unread && canMarkRead ? (
          <Pressable
            onPress={onMarkRead}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Check size={14} color={colors.textPrimary} />
            <Text style={styles.buttonText}>{t('overview.mobile.markRead', 'Mark read')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  )
}
