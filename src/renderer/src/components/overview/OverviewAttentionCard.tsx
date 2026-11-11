import { useState } from 'react'
import {
  Check,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  House,
  MessageSquareReply,
  Send
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { formatRelativeTime } from '@/components/activity/activity-thread-presentation'
import { openHttpLink } from '@/lib/browser/navigation/http-link-routing'
import type { OverviewAttentionItem } from './overview-model-types'
import { OVERVIEW_TRIAGE_ATTRIBUTE, type OverviewTriage } from './use-overview-keyboard-triage'
import { ATTENTION_TONE, attentionKindLabel } from './overview-presentation'

export type OverviewAttentionCardActions = {
  busy: boolean
  open: (worktreeId: string) => void
  openMain: (projectId: string) => void
  reply: (worktreeId: string, text: string) => Promise<boolean>
  markRead: (worktreeId: string) => void
  mergeTickets: (projectId: string) => void
  removeWorkspace: (worktreeId: string) => void
}

export function OverviewAttentionCard({
  item,
  canMerge,
  now,
  actions,
  triage
}: {
  item: OverviewAttentionItem
  canMerge: boolean
  now: number
  actions: OverviewAttentionCardActions
  triage: OverviewTriage
}): React.JSX.Element {
  const t = useTranslate()
  const replying = triage.replyOpenId === item.worktreeId
  const setReplying = (open: boolean): void => triage.setReplyOpen(open ? item.worktreeId : null)
  const selected = triage.selectedId === item.worktreeId
  const [text, setText] = useState('')
  const tone = ATTENTION_TONE[item.kind]
  const headingId = `overview-attention-${item.key}`
  const waiting = item.kinds.includes('agent-waiting')

  const submit = async (): Promise<void> => {
    if (!text.trim()) {
      return
    }
    if (await actions.reply(item.worktreeId, text)) {
      setText('')
      setReplying(false)
    }
  }

  return (
    <article
      aria-labelledby={headingId}
      aria-current={selected ? 'true' : undefined}
      {...{ [OVERVIEW_TRIAGE_ATTRIBUTE]: item.worktreeId }}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground',
        tone.border,
        selected && 'outline-2 -outline-offset-2 outline-ring'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {item.kinds.map((kind) => (
            <span
              key={kind}
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                ATTENTION_TONE[kind].chip
              )}
            >
              {attentionKindLabel(kind)}
            </span>
          ))}
        </div>
        {item.since ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(item.since, now)}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {item.host ? <Badge variant="hostContext">{item.host}</Badge> : null}
        <h3
          id={headingId}
          className="min-w-0 truncate text-sm font-semibold"
          title={`${item.projectName} · ${item.workspaceName}`}
        >
          {item.projectName} · {item.workspaceName}
        </h3>
      </div>
      {item.reasons.map((reason) => (
        <p key={reason} className="line-clamp-3 text-xs text-muted-foreground">
          {reason}
        </p>
      ))}
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="xs"
          disabled={actions.busy}
          onClick={() => actions.open(item.worktreeId)}
        >
          <ExternalLink />
          {t('auto.components.overview.open', 'Open')}
        </Button>
        {item.isMain ? null : (
          <Button
            variant="outline"
            size="xs"
            disabled={actions.busy}
            onClick={() => actions.openMain(item.projectId)}
          >
            <House />
            {t('auto.components.overview.openMain', 'Open main')}
          </Button>
        )}
        {waiting ? (
          <Button
            variant="outline"
            size="xs"
            disabled={actions.busy}
            aria-expanded={replying}
            onClick={() => setReplying(!replying)}
          >
            <MessageSquareReply />
            {t('auto.components.overview.reply', 'Reply')}
          </Button>
        ) : null}
        {item.prUrl ? (
          <Button
            variant="outline"
            size="xs"
            onClick={() => item.prUrl && openHttpLink(item.prUrl)}
          >
            <GitPullRequest />
            {t('auto.components.overview.openPr', 'PR')}
          </Button>
        ) : null}
        {item.unread ? (
          <Button
            variant="outline"
            size="xs"
            disabled={actions.busy}
            onClick={() => actions.markRead(item.worktreeId)}
          >
            <Check />
            {t('auto.components.overview.markRead', 'Mark read')}
          </Button>
        ) : null}
        {item.kind === 'pr-ready' && canMerge ? (
          <Button
            variant="outline"
            size="xs"
            disabled={actions.busy}
            onClick={() => actions.mergeTickets(item.projectId)}
          >
            <GitMerge />
            {t('auto.components.overview.mergeTickets', 'Merge tickets')}
          </Button>
        ) : null}
      </div>
      {replying && waiting ? (
        <form
          className="flex gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('auto.components.overview.replyPlaceholder', 'Reply to the agent…')}
            aria-label={t('auto.components.overview.replyLabel', 'Reply to {{name}}', {
              name: item.workspaceName
            })}
          />
          <Button
            type="submit"
            size="icon-xs"
            variant="outline"
            disabled={actions.busy || !text.trim()}
            aria-label={t('auto.components.overview.sendReply', 'Send reply')}
          >
            <Send />
          </Button>
        </form>
      ) : null}
    </article>
  )
}
