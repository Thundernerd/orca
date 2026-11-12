import { describe, expect, it } from 'vitest'
import { draftBlockerNumbers, draftIssueBody, orderDraftsForPublish } from './ticket-draft-order'
import type { TicketDraft } from './ticket-draft-types'

const draft = (
  key: string,
  blockedBy: string[] = [],
  extra: Partial<TicketDraft> = {}
): TicketDraft => ({
  key,
  title: `Title ${key}`,
  body: `## Goal\nDo ${key}.`,
  labels: [],
  blockedBy,
  covers: [],
  ...extra
})

describe('orderDraftsForPublish', () => {
  it('publishes blockers before the drafts that wait on them', () => {
    const result = orderDraftsForPublish([draft('themes', ['tokens', '#7']), draft('tokens')])
    expect(result.ok && result.order.map((d) => d.key)).toEqual(['tokens', 'themes'])
  })

  it('refuses cycles, unknown blockers, duplicate keys and empty titles', () => {
    expect(orderDraftsForPublish([draft('a', ['b']), draft('b', ['a'])])).toMatchObject({
      ok: false
    })
    expect(orderDraftsForPublish([draft('a', ['missing'])])).toMatchObject({ ok: false })
    expect(orderDraftsForPublish([draft('a'), draft('a')])).toMatchObject({ ok: false })
    expect(orderDraftsForPublish([draft('a', [], { title: '  ' })])).toMatchObject({ ok: false })
  })
})

describe('draftIssueBody', () => {
  it('writes the Blocked by section with published numbers, replacing one the agent wrote', () => {
    const themes = draft('themes', ['tokens', '#7'], {
      body: '## Goal\nThemes.\n\n## Blocked by\n- tokens'
    })
    expect(
      draftIssueBody(
        themes,
        new Map([['tokens', 41]]),
        new Map([['tokens', 'Move colors to tokens']])
      )
    ).toBe('## Goal\nThemes.\n\n## Blocked by\n- #41 Move colors to tokens\n- #7\n')
    expect(draftIssueBody(draft('solo'), new Map(), new Map())).toBe(
      '## Goal\nDo solo.\n\n## Blocked by\nNone\n'
    )
  })

  it('lists the issue numbers to link natively', () => {
    expect(draftBlockerNumbers(draft('x', ['tokens', '#7']), new Map([['tokens', 41]]))).toEqual([
      41, 7
    ])
  })
})
