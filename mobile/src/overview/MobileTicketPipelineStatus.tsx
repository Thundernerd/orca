import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { hasTicketPipelineStatus } from '../../../src/shared/ticket-pipeline/ticket-pipeline-status-presence'
import { useAppActive } from '../hooks/use-now'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { Translate } from '../i18n/mobile-i18n'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { formatTimeAgo } from '../worktree/agent-row-display'
import { mobileTicketActions } from './mobile-ticket-actions'
import type { MobileTicketPipelineStatus as Status } from './overview-ticket-operations'
import { overviewStyles as styles } from './mobile-overview-styles'

const POLL_MS = 15_000
const HELD_SHOWN = 2

function useTicketStatus(client: RpcClient | null, projectId: string): Status | null {
  const active = useAppActive()
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => {
    if (!client || !active) {
      return
    }
    let current = true
    const actions = mobileTicketActions(client, projectId)
    const read = (): void => {
      actions.status().then(
        (next) => current && setStatus(next),
        // An older desktop lacks the method; a failed read leaves nothing to show.
        () => current && setStatus(null)
      )
    }
    read()
    const timer = setInterval(read, POLL_MS)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [client, projectId, active])
  return status
}

function queueText({ queue }: Status, now: number, t: Translate): string {
  if (queue.pausedReason) {
    return t('overview.mobile.status.paused', 'Paused: {{reason}}', { reason: queue.pausedReason })
  }
  const head = queue.head
  if (!head) {
    return t('overview.mobile.status.queueEmpty', 'Nothing waiting to merge.')
  }
  return [
    head.reviewNumber === null
      ? head.ticketId
      : t('overview.mobile.status.head', '{{ticket}} (PR #{{number}})', {
          ticket: head.ticketId,
          number: head.reviewNumber
        }),
    head.detail ?? t('overview.mobile.status.notChecked', 'Not checked yet.'),
    ...(head.since ? [formatTimeAgo(head.since, now)] : []),
    ...(queue.waiting > 0
      ? [t('overview.mobile.status.behind', '{{count}} behind it', { count: queue.waiting })]
      : [])
  ].join(' · ')
}

function cleanText({ autoClean, clean }: Status, now: number, t: Translate): string {
  const parts = [
    ...(autoClean ? [] : [t('overview.mobile.status.cleanOff', 'Off')]),
    ...(clean.lastRemoved
      ? [
          t('overview.mobile.status.removed', 'removed {{ticket}} {{when}}', {
            ticket: clean.lastRemoved.ticketId,
            when: formatTimeAgo(clean.lastRemoved.at, now)
          })
        ]
      : []),
    ...clean.held.slice(0, HELD_SHOWN).map((held) =>
      t('overview.mobile.status.keeping', 'keeping {{ticket}}: {{reason}}', {
        ticket: held.ticketId,
        reason: held.reason.replaceAll('-', ' ')
      })
    ),
    ...(clean.held.length > HELD_SHOWN
      ? [
          t('overview.mobile.status.keepingMore', '{{count}} more kept', {
            count: clean.held.length - HELD_SHOWN
          })
        ]
      : []),
    ...(clean.pending > 0
      ? [t('overview.mobile.status.pending', '{{count}} to check', { count: clean.pending })]
      : [])
  ]
  return parts.length > 0
    ? parts.join(' · ')
    : t('overview.mobile.status.cleanIdle', 'Nothing to remove.')
}

function checkedText(status: Status, now: number, t: Translate): string {
  if (!status.watching) {
    return t('overview.mobile.status.idle', 'Not checking: nothing left to follow.')
  }
  return status.checkedAt
    ? t('overview.mobile.status.checked', 'Checked {{when}}', {
        when: formatTimeAgo(status.checkedAt, now)
      })
    : t('overview.mobile.status.checking', 'Checking for the first time…')
}

/** What the merge queue and auto-clean are doing right now, read from the desktop that runs them. */
export function MobileTicketPipelineStatus({
  client,
  projectId,
  now,
  onReviewDrafts
}: {
  client: RpcClient | null
  projectId: string
  now: number
  onReviewDrafts: () => void
}) {
  const t = useMobileTranslation()
  const status = useTicketStatus(client, projectId)
  if (!status) {
    return null
  }
  const review = status.drafts?.review ?? []
  const draftCount = review.reduce((sum, batch) => sum + batch.count, 0)
  const draftsRow =
    review.length > 0 ? (
      <Pressable
        onPress={onReviewDrafts}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.chip,
          styles.chipFlagged,
          styles.selfStart,
          pressed && styles.pressed
        ]}
      >
        <Text style={[styles.chipText, styles.chipFlaggedText]}>
          {t('overview.mobile.status.draftsReview', '{{count}} drafts to review', {
            count: draftCount
          })}
        </Text>
      </Pressable>
    ) : status.drafts && status.drafts.drafting > 0 ? (
      <Text style={styles.meta}>{t('overview.mobile.status.drafting', 'Drafting tickets…')}</Text>
    ) : null
  if (!hasTicketPipelineStatus(status)) {
    return draftsRow
  }
  return (
    <View style={styles.statusBlock}>
      {draftsRow}
      <Text style={[styles.meta, status.queue.pausedReason ? styles.danger : null]}>
        <Text style={styles.metaLabel}>
          {status.autoMerge
            ? t('overview.mobile.status.queueAuto', 'Merge queue (auto)')
            : t('overview.mobile.status.queue', 'Merge queue')}
          {': '}
        </Text>
        {queueText(status, now, t)}
      </Text>
      <Text style={styles.meta}>
        <Text style={styles.metaLabel}>
          {t('overview.mobile.status.clean', 'Auto-clean')}
          {': '}
        </Text>
        {cleanText(status, now, t)}
      </Text>
      <Text style={styles.meta}>{checkedText(status, now, t)}</Text>
    </View>
  )
}
