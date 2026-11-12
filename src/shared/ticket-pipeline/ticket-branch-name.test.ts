import { describe, expect, it } from 'vitest'
import { conventionalTypeForTicket, ticketBranchName } from './ticket-branch-name'

describe('ticket branch names', () => {
  it('carries the type, the slug id and a bounded title slug', () => {
    expect(
      ticketBranchName({ slugId: 'gh-12', title: 'Login form: keep "email" on error!' }, 'fix')
    ).toBe('fix/gh-12-login-form-keep-email-on-error')
    expect(
      ticketBranchName(
        {
          slugId: 't86',
          title: 'Discover filters survive navigation away and back again, every time'
        },
        'feat'
      )
    ).toBe('feat/t86-discover-filters-survive-navigation-away')
  })

  it('reads the type from labels, defaulting to feat', () => {
    expect(conventionalTypeForTicket({ labels: ['Bug', 'area: ui'] })).toBe('fix')
    expect(conventionalTypeForTicket({ labels: ['documentation'] })).toBe('docs')
    expect(conventionalTypeForTicket({ labels: ['enhancement'] })).toBe('feat')
    expect(conventionalTypeForTicket({ labels: [] })).toBe('feat')
  })
})
