import { describe, expect, it } from 'vitest'
import { overviewWorktreeIdFromKey } from './overview-store-inputs'

describe('overviewWorktreeIdFromKey', () => {
  it('returns a local workspace key as its id', () => {
    expect(overviewWorktreeIdFromKey('repo-1::/home/me/repo')).toBe('repo-1::/home/me/repo')
  })

  it('strips the host from a remote workspace key', () => {
    expect(overviewWorktreeIdFromKey('runtime:server-1|repo-1::/srv/repo')).toBe(
      'repo-1::/srv/repo'
    )
    expect(overviewWorktreeIdFromKey('ssh:box%3A22|repo-1::/srv/repo')).toBe('repo-1::/srv/repo')
  })

  it('keeps a local id whose path holds a pipe whole', () => {
    expect(overviewWorktreeIdFromKey('repo-1::/home/me/a|b')).toBe('repo-1::/home/me/a|b')
  })
})
