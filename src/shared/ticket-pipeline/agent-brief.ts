/** The heading the triage skill's agent brief template (`.agents/skills/triage/AGENT-BRIEF.md`)
 *  puts on its comment. The comment starts with an AI disclaimer, so the heading is its own line,
 *  not necessarily the first. */
export const AGENT_BRIEF_HEADING = '## Agent Brief'

export type IssueComment = { body: string; createdAt: string }

const FENCE = /^\s*(```|~~~)/

/** Whether a line of the comment, outside code fences, is exactly the agent brief heading. */
function hasAgentBriefHeading(body: string): boolean {
  let fenced = false
  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (!fenced && line.trimEnd() === AGENT_BRIEF_HEADING) {
      return true
    }
  }
  return false
}

/** The body of the latest comment that is an agent brief, by creation time; null when none is.
 *  A revised brief is posted as a new comment, so the latest one is the specification. */
export function findAgentBrief(comments: readonly IssueComment[]): string | null {
  let latest: IssueComment | null = null
  for (const comment of comments) {
    if (!hasAgentBriefHeading(comment.body)) {
      continue
    }
    if (latest === null || comment.createdAt >= latest.createdAt) {
      latest = comment
    }
  }
  return latest?.body ?? null
}
