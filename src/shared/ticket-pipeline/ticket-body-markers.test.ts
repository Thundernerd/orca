import { describe, expect, it } from 'vitest'
import {
  isOwnedByUser,
  needsTriage,
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

  it('reads triage from labels, a workflow state or a body line, but not once triaged', () => {
    expect(needsTriage({ labels: ['bug', 'needs-triage'] })).toBe(true)
    expect(needsTriage({ labels: ['Status: Triage'] })).toBe(true)
    expect(needsTriage({ labels: ['untriaged'] })).toBe(true)
    expect(needsTriage({ labels: ['triaged', 'bug'] })).toBe(false)
    expect(needsTriage({ labels: [], state: 'Needs Triage' })).toBe(true)
    expect(needsTriage({ labels: [], body: '# Crash\nStatus: needs triage\n' })).toBe(true)
    expect(needsTriage({ labels: [], body: 'We should triage this later in the sprint.' })).toBe(
      false
    )
  })
})
