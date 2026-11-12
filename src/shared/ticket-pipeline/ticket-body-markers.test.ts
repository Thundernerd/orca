import { describe, expect, it } from 'vitest'
import {
  isOwnedByUser,
  parseBlockedBySection,
  parseTicketFileDeps,
  parseTicketFileTitle
} from './ticket-body-markers'

describe('ticket body markers', () => {
  it('reads issue numbers only from the Blocked by section', () => {
    const body = [
      '## Goal',
      'Follows #99.',
      '## Blocked by',
      '- #12 Tokens',
      '- #14 and #12',
      '## Acceptance criteria',
      '- [ ] see #50'
    ].join('\n')
    expect(parseBlockedBySection(body)).toEqual([12, 14])
    expect(parseBlockedBySection('## Blocked by\nNone')).toEqual([])
  })

  it('reads ticket-file deps, title and owner', () => {
    const body = '# T86: Discover filters\nDeps: T12, T40\nOwner: user\n'
    expect(parseTicketFileDeps(body)).toEqual(['T12', 'T40'])
    expect(parseTicketFileTitle(body)).toBe('Discover filters')
    expect(isOwnedByUser(body)).toBe(true)
    expect(isOwnedByUser('Owner: someone')).toBe(false)
  })
})
