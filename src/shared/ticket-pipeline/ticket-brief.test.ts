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

function findingsSection(text: string): string[] {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.startsWith('- Findings:'))
  const end = lines.findIndex((line, index) => index > start && line.startsWith('- '))
  return lines.slice(start + 1, end)
}

describe.each([true, false])('renderTicketBrief with findingsPublish %s', (findingsPublish) => {
  const text = brief(findingsPublish)

  it('triages each finding: done, ticketed, fix here, file, then ask', () => {
    expect(findingsSection(text).map((line) => line.split(':')[0].trim())).toEqual([
      '- Already done',
      '- Already ticketed',
      '- Related to this ticket and small',
      '- Bigger, or unrelated',
      '- Unsure which'
    ])
  })

  it('checks the fetched base branch before anything is filed', () => {
    const [done] = findingsSection(text)
    expect(done).toContain('git fetch origin')
    expect(done).toContain('origin/develop')
  })

  it('searches the open tickets through the survey', () => {
    expect(findingsSection(text)[1]).toContain('orca tickets survey --json')
  })

  it('reports every finding with its outcome', () => {
    const report = text.split('\n').find((line) => line.startsWith('- Once the PR is up, report:'))
    for (const outcome of ['done already', 'extended', 'fixed', 'filed']) {
      expect(report).toContain(outcome)
    }
  })
})

describe('renderTicketBrief ticket sources', () => {
  it('comments in the tracker when findings publish', () => {
    expect(findingsSection(brief(true))[1]).toContain('comment on it in its tracker')
  })

  it('searches other branches and notes the ticket file when findings are files', () => {
    const [, ticketed] = findingsSection(brief(false))
    expect(ticketed).toContain('docs/tickets')
    expect(ticketed).toContain('git branch -r')
  })
})

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
