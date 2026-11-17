import { describe, expect, it } from 'vitest'
import { parsePRFindings } from './ticket-pr-findings'

describe('parsePRFindings', () => {
  it('reads each finding under the Findings heading, up to the next section', () => {
    const body = [
      '## Summary',
      'Fixed the hook.',
      '',
      '## Findings',
      '',
      '### Upload retries ignore 429',
      'Blocked by: #314',
      '#### Goal',
      'Retry after the server says so.',
      '',
      '### README typo',
      'The install step says `npm i`.',
      '',
      '## Evidence',
      'All tests pass.'
    ].join('\n')
    expect(parsePRFindings(body)).toEqual([
      {
        title: 'Upload retries ignore 429',
        body: '#### Goal\nRetry after the server says so.',
        blockedBy: ['#314']
      },
      { title: 'README typo', body: 'The install step says `npm i`.', blockedBy: [] }
    ])
  })

  it('finds nothing in a PR body without a Findings section', () => {
    expect(parsePRFindings('## Summary\nDone.\n\nCloses #12')).toEqual([])
  })
})
