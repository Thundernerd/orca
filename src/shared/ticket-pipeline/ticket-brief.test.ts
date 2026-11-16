import { describe, expect, it } from 'vitest'
import { renderTicketBrief, type TicketBriefInput } from './ticket-brief'

function brief(
  findingsPublish: boolean,
  commentCommand: string | null = 'gh issue comment 12 --body-file <file>'
): string {
  const input: TicketBriefInput = {
    ticket: { id: '#12', ref: '12', title: 'Add export' },
    readCommand: 'gh issue view 12',
    reviewRule: 'with "Closes #12" in it',
    commentCommand,
    findingsPublish,
    branch: 'feat/12-add-export',
    baseBranch: 'develop',
    agentDocs: ['AGENTS.md'],
    untrackedContext: []
  }
  return renderTicketBrief(input)
}

describe('renderTicketBrief proof and ticket record', () => {
  const lines = brief(true).split('\n')
  const index = (prefix: string) => lines.findIndex((line) => line.startsWith(prefix))

  it('captures the before ahead of any change, and the after in the PR', () => {
    expect(index('- Proof:')).toBeGreaterThan(-1)
    expect(index('- Proof:')).toBeLessThan(index('- Use the /tdd skill.'))
    const pr = lines[index('- When every fix is committed')]
    expect(pr).toContain('Evidence')
    expect(pr).toContain('--attach <path>')
  })

  it('records the work on the ticket with its comment command after the PR', () => {
    const record = lines[index('- Then ')]
    expect(index('- Then ')).toBeGreaterThan(index('- When every fix is committed'))
    expect(record).toContain('`gh issue comment 12 --body-file <file>`')
  })

  it('writes a resolution into a ticket file that has no comment command', () => {
    const record = brief(false, null)
      .split('\n')
      .find((line) => line.startsWith('- Then '))
    expect(record).toContain('## Resolution')
    expect(record).not.toContain('comment on the ticket')
  })
})
