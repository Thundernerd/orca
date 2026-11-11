import { useState } from 'react'
import { MessageSquareReply, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslate } from '@/i18n/use-translate'
import type { OverviewWorkspaceRow } from './overview-model-types'

/** The table's reply to a waiting agent, shown beside its row. */
export function OverviewReplyPopover({
  row,
  busy,
  reply,
  open,
  setOpen
}: {
  row: OverviewWorkspaceRow
  busy: boolean
  reply: (worktreeId: string, text: string) => Promise<boolean>
  /** Controlled by the page so R in keyboard triage can open it. */
  open: boolean
  setOpen: (open: boolean) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [text, setText] = useState('')

  const submit = async (): Promise<void> => {
    if (!text.trim()) {
      return
    }
    if (await reply(row.worktreeId, text)) {
      setText('')
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" disabled={busy}>
          <MessageSquareReply />
          {t('auto.components.overview.reply', 'Reply')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="flex flex-col gap-2 p-3">
          <p className="truncate text-xs font-semibold" title={row.name}>
            {row.name}
          </p>
          {row.lastMessage ? (
            <p className="line-clamp-4 text-xs text-muted-foreground">{row.lastMessage}</p>
          ) : null}
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
                name: row.name
              })}
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              disabled={busy || !text.trim()}
              aria-label={t('auto.components.overview.sendReply', 'Send reply')}
            >
              <Send />
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  )
}
