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
  }
]
