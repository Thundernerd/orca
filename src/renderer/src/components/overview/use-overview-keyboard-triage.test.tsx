// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OverviewAttentionItem } from '../../../../shared/overview/overview-model-types'
import { useOverviewKeyboardTriage } from './use-overview-keyboard-triage'

function item(worktreeId: string, overrides: Partial<OverviewAttentionItem> = {}) {
  const value: OverviewAttentionItem = {
    key: `ws:${worktreeId}`,
    kind: 'flagged',
    kinds: ['flagged'],
    reasons: ['Marked unread'],
    worktreeId,
    executionHostId: 'local',
    workspaceName: worktreeId,
    projectId: 'p',
    projectName: 'p',
    host: null,
    prUrl: null,
    isMain: false,
    unread: true,
    since: null,
    ...overrides
  }
  return value
}

function press(key: string, target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

afterEach(cleanup)

describe('useOverviewKeyboardTriage', () => {
  it('walks the list, acts on the selection, and claims Esc before the page closes', () => {
    const onOpen = vi.fn()
    const onMarkRead = vi.fn()
    const items = [
      item('a', { kinds: ['agent-waiting'], kind: 'agent-waiting', unread: false }),
      item('b')
    ]
    const { result } = renderHook(() => useOverviewKeyboardTriage({ items, onOpen, onMarkRead }))
    const pageEscape = vi.fn()
    window.addEventListener('keydown', pageEscape)

    press('j')
    press('ArrowDown')
    press('ArrowDown')
    expect(result.current.selectedId).toBe('b')
    press('e')
    expect(onMarkRead).toHaveBeenCalledWith('b')

    press('k')
    press('r')
    expect(result.current.replyOpenId).toBe('a')
    press('Enter')
    expect(onOpen).toHaveBeenCalledWith('a')

    press('Escape')
    expect(result.current.selectedId).toBeNull()
    expect(pageEscape).not.toHaveBeenCalled()
    press('Escape')
    expect(pageEscape).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', pageEscape)
  })

  it('leaves keys alone while typing', () => {
    const onMarkRead = vi.fn()
    const { result } = renderHook(() =>
      useOverviewKeyboardTriage({ items: [item('a')], onOpen: vi.fn(), onMarkRead })
    )
    const input = document.createElement('input')
    document.body.append(input)
    press('j', input)
    expect(result.current.selectedId).toBeNull()
    input.remove()
  })
})
