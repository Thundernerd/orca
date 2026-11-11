import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslate } from '@/i18n/use-translate'
import type { OverviewSkill } from './overview-actions'

// Command names stay untranslated, like the other skill buttons.
const SKILL = 'write-ticket' satisfies OverviewSkill

/** `/write-ticket` with what to write up: one item or a list, sent as the skill's argument. */
export function OverviewWriteTicketPopover({
  projectName,
  busy,
  variant,
  onSubmit
}: {
  projectName: string
  busy: boolean
  variant: 'outline' | 'ghost'
  onSubmit: (description: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const submit = (): void => {
    onSubmit(text.trim())
    setText('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size="xs" disabled={busy}>
          /{SKILL}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[28rem]">
        <form
          className="flex flex-col gap-2 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <p className="text-xs font-semibold">
            {t('auto.components.overview.writeTicket.title', 'Write a ticket for {{project}}', {
              project: projectName
            })}
          </p>
          <Textarea
            autoFocus
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={t(
              'auto.components.overview.writeTicket.placeholder',
              'What is broken, awkward or wanted? One item, or a list.'
            )}
            aria-label={t('auto.components.overview.writeTicket.label', 'Ticket description')}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {t(
                'auto.components.overview.writeTicket.hint',
                'Claude investigates and asks you to confirm the drafts.'
              )}
            </span>
            <Button type="submit" size="sm" disabled={busy}>
              {text.trim()
                ? t('auto.components.overview.writeTicket.send', 'Write ticket')
                : t('auto.components.overview.writeTicket.sendEmpty', 'Start without text')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
