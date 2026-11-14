import { describe, expect, it } from 'vitest'
import { renderTicketBrief, type TicketBriefInput } from './ticket-brief'

function brief(findingsPublish: boolean): string {
  const input: TicketBriefInput = {
    ticket: { id: '#12', ref: '12', title: 'Add export' },
    readCommand: 'gh issue view 12',
    reviewRule: 'with "Closes #12" in it',
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

  it('parks an off-roadmap finding by the label the agent docs name', () => {
    const filed = findingsSection(text)[3]
    expect(filed).toContain('AGENTS.md')
    expect(filed).toContain('parking label')
  })

  it('reports every finding with its outcome', () => {
    const report = text.split('\n').find((line) => line.startsWith('- Once the PR is up, report:'))
    for (const outcome of ['done already', 'extended', 'fixed', 'filed', 'parked']) {
      expect(report).toContain(outcome)
    }
  })
})

describe('renderTicketBrief ticket sources', () => {
  it('labels and comments in the tracker when findings publish', () => {
    const [, ticketed, , filed] = findingsSection(brief(true))
    expect(ticketed).toContain('comment on it in its tracker')
    expect(filed).toContain('--label')
  })

  it('searches other branches and notes the ticket file when findings are files', () => {
    const [, ticketed, , filed] = findingsSection(brief(false))
    expect(ticketed).toContain('docs/tickets')
    expect(ticketed).toContain('git branch -r')
    expect(filed).not.toContain('--label')
  })
})
