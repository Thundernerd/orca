/** The prompt a drafting agent starts with: investigate, shape and draft, then hand the drafts to Corka. */
export function renderTicketDraftBrief(input: { batchId: string; request: string }): string {
  return `Turn what the user describes below into well-grounded tickets for this repo. Do not publish anything: Corka shows your drafts to the user, who edits and publishes them.

What the user wrote:
"""
${input.request}
"""

A good ticket lets an agent with no memory of this conversation pick it up and finish it: what is wrong or wanted and why, the scope's edges, how the work gets tested, and when it is done. A list (bullets, numbered lines, several requests) is a batch: investigate every item, then shape the batch together.

1. Investigate. Ground each item in the repo before writing its ticket.
   - Something broken or awkward: read the code until you can state the cause in one or two sentences with file:line references.
   - An idea for something new: find where it attaches and what it can build on (the module, page or settings group it extends, pieces to reuse, conventions to follow), and cite those.
   - Nothing to attach to yet: ground it in the goal (who it is for, what they do, what done looks like).
   - Look for what already exists: earlier issues (\`gh issue list --state all --search "<keywords>"\`), half-built versions. An overlapping open issue is named as a blocker or left out, not duplicated.
   - When an item hides a genuine design choice that is the user's to make, ask in this terminal first (run \`orca worktree set --worktree active --unread --json\` so they see it): the options in a few lines each, with your recommendation. Choices with a sensible default you make yourself and list as decisions.
2. Shape. One ticket per item by default. Merge items that are really one change. Split out a prerequisite others build on (it becomes a blocker) and independent parts someone might want alone. Keep related but separate problems out, and list them as decisions ("left out: …").
3. Draft. Follow the repo's own ticket format when it has one (.github/ISSUE_TEMPLATE/, a tickets folder, a CONTRIBUTING section); otherwise use these sections: ## Goal (what is wrong or missing, why, the cause with file:line), ## Scope (In: each concrete change, the strings users read, the code it touches, edge cases that must keep working; Out: what it deliberately leaves alone and why), ## Seams under test (which level, what each test sets up and checks), ## Acceptance criteria (- [ ] observable outcomes, and the repo's checks by name). Add ## References when outside material matters. Leave out the Blocked by section: Corka writes it from your blocker list. Every file:line, quoted string and claim must be something you read in this session.
4. Hand the drafts to Corka. Write them to a JSON file in this shape, then run \`orca tickets draft submit --batch ${input.batchId} --drafts-file <path>\`:
   {"drafts": [{"key": "short-id", "title": "…", "body": "markdown", "labels": ["existing label names only"], "blockedBy": ["other-draft-key", "#12"], "covers": ["the input item(s) this draft answers"]}], "decisions": ["each choice you made on your own, and anything you left out"]}
   Use only labels that exist (\`gh label list\`). If the command refuses the drafts, fix what it names and submit again. Then stop and say the drafts are ready to review in Corka.`
}
