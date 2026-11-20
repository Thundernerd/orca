import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { OverviewAttentionItem } from '../../../../shared/overview/overview-model-types'

/** What the cards and table rows read to show the selection and an open reply. */
export type OverviewTriage = {
  /** The selected workspace (its overview key), or null. */
  selectedId: string | null
  /** The workspace whose reply field is open, or null. */
  replyOpenId: string | null
  setReplyOpen: (worktreeId: string | null) => void
}

export const OVERVIEW_TRIAGE_ATTRIBUTE = 'data-overview-triage-id'

function isTypingOrInOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) {
    return true
  }
  // Menus, popovers and dialogs own their keys.
  return (
    target.closest('[data-radix-popper-content-wrapper],[role="dialog"],[role="menu"]') !== null
  )
}

/** Enter presses a focused control and arrows move within toggle groups; leave those keys to it. */
function isOnControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('button,a[href],[role="button"],[role="radio"],[role="tab"]') !== null
  )
}

/**
 * Keyboard triage of Needs you: ↑/↓ or j/k select, Enter opens, R replies to a waiting agent,
 * E marks read, Esc clears the selection (a second Esc reaches the page and closes it).
 */
export function useOverviewKeyboardTriage(args: {
  items: readonly OverviewAttentionItem[]
  onOpen: (worktreeId: string) => void
  onMarkRead: (worktreeId: string) => void
}): OverviewTriage {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyOpenId, setReplyOpen] = useState<string | null>(null)
  // Only the listener changes the selection, and key repeat can outrun a render: it keeps its own
  // copy so the next press sees the last one.
  const selectedRef = useRef<string | null>(null)

  const visibleSelectedId =
    selectedId !== null && args.items.some((item) => item.worktreeId === selectedId)
      ? selectedId
      : null

  // An effect event reads the latest list and callbacks without re-subscribing on every update.
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isTypingOrInOverlay(event.target)
    ) {
      return
    }
    const { items, onOpen, onMarkRead } = args
    const index = items.findIndex((item) => item.worktreeId === selectedRef.current)
    const selected = index !== -1 ? items[index] : null
    const select = (next: number): void => {
      const item = items[Math.max(0, Math.min(items.length - 1, next))]
      if (item) {
        // Key repeat can outrun a render; the next press must see this selection.
        selectedRef.current = item.worktreeId
        setSelectedId(item.worktreeId)
      }
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if ((key === 'Enter' || key.startsWith('Arrow')) && isOnControl(event.target)) {
      return
    }
    if (key === 'ArrowDown' || key === 'j') {
      select(index + 1)
    } else if (key === 'ArrowUp' || key === 'k') {
      select(index === -1 ? 0 : index - 1)
    } else if (key === 'Enter' && selected) {
      onOpen(selected.worktreeId)
    } else if (key === 'e' && selected?.unread) {
      onMarkRead(selected.worktreeId)
    } else if (key === 'r' && selected?.kinds.includes('agent-waiting')) {
      setReplyOpen(selected.worktreeId)
    } else if (key === 'Escape' && selected) {
      selectedRef.current = null
      setSelectedId(null)
    } else {
      return
    }
    // Capture phase: claim the key before the page's own Escape handler sees it.
    event.preventDefault()
    event.stopPropagation()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onKeyDown(event)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  useEffect(() => {
    if (!visibleSelectedId) {
      return
    }
    const element = document.querySelector(
      `[${OVERVIEW_TRIAGE_ATTRIBUTE}="${CSS.escape(visibleSelectedId)}"]`
    )
    element?.scrollIntoView({ block: 'nearest' })
  }, [visibleSelectedId])

  return { selectedId: visibleSelectedId, replyOpenId, setReplyOpen }
}
