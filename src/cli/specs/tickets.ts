import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const TICKET_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['tickets', 'survey'],
    summary: 'List the project tickets and which ones the workspace can launch now',
    usage:
      'orca tickets survey [--worktree <selector>] [--source github-issues|repo-files] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'source'],
    notes: [
      'Read-only. Without --worktree it surveys from the workspace of the current directory.',
      'The source is docs/tickets/<ID>-<slug>.md files when the default branch has them, GitHub issues otherwise.',
      'Statuses: ready (every blocker done), blocked, launched (a workspace exists), owned (Owner: user), claimed (assigned).'
    ],
    examples: ['orca tickets survey', 'orca tickets survey --source github-issues --json']
  },
  {
    path: ['tickets', 'launch'],
    summary: 'Claim ready tickets and start an agent on each in its own child workspace',
    usage:
      'orca tickets launch --ticket <id> [--ticket <id>...] [--type <ticket-id>=<type>...] [--worktree <selector>] [--source github-issues|repo-files] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'source', 'ticket', 'type'],
    repeatableFlags: ['ticket', 'type'],
    notes: [
      'Each ticket must still be ready when the launch re-surveys; others are skipped with the reason.',
      'An issue is claimed by assigning it to you; a failed launch releases the claim.',
      'The branch is <type>/<id>-<title slug>; the type comes from the ticket labels (feat when none says otherwise) unless --type sets it.',
      'Corka then follows each ticket to its PR and moves the workspace to In review.'
    ],
    examples: [
      'orca tickets launch --ticket "#12" --ticket "#14"',
      'orca tickets launch --ticket T86 --type T86=fix'
    ]
  },
  {
    path: ['tickets', 'items'],
    summary: 'List launched tickets and where each stands',
    usage: 'orca tickets items [--repo <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo'],
    examples: ['orca tickets items', 'orca tickets items --json']
  },
  {
    path: ['tickets', 'clean'],
    summary: 'Show which child workspaces hold nothing worth keeping, and remove them with --apply',
    usage: 'orca tickets clean [--worktree <selector>] [--apply] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'apply'],
    notes: [
      'Without --apply this only prints the plan: remove or keep, with the reason, per child of the workspace.',
      'A child is removed only when its checkout is clean, it has no children, its agent is quiet, and its work is in the default branch or a merged PR it has nothing beyond.',
      'Removal is never forced; a leftover local branch is deleted only with git branch -d.'
    ],
    examples: ['orca tickets clean', 'orca tickets clean --apply']
  },
  {
    path: ['tickets', 'settings'],
    summary: "Show or change the project's ticket settings",
    usage:
      'orca tickets settings [--worktree <selector>] [--auto-clean on|off] [--auto-merge on|off] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'auto-clean', 'auto-merge'],
    notes: [
      'With --auto-clean on, Corka removes a ticket workspace once its PR merges and the clean-up survey clears it.',
      'With --auto-merge on, the merge queue merges its head as soon as it is ready instead of waiting for `orca tickets merge`.'
    ],
    examples: ['orca tickets settings', 'orca tickets settings --auto-clean on --auto-merge on']
  },
  {
    path: ['tickets', 'queue'],
    summary: "Show the workspace's merge queue",
    usage: 'orca tickets queue [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      'Ticket PRs merge one at a time in ticket order. The head is brought up to date, waits for green CI, and gets fix briefs sent to its agent for attribution, conflicts or failing checks.',
      'The queue pauses after a second failed fix for the same cause, with no live agent, after 3 hours without a push, or when GitHub blocks the merge; `orca tickets resume` clears the pause.'
    ],
    examples: ['orca tickets queue', 'orca tickets queue --json']
  },
  {
    path: ['tickets', 'resume'],
    summary: 'Resume a paused merge queue, giving its head fresh fix attempts',
    usage: 'orca tickets resume [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    examples: ['orca tickets resume']
  },
  {
    path: ['tickets', 'merge'],
    summary: 'Merge the head of the merge queue once it is ready',
    usage: 'orca tickets merge [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: ['Merges with a merge commit, and only when the queue reports the head as ready.'],
    examples: ['orca tickets merge']
  }
]
