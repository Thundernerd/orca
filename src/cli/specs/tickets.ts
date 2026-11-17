import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

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
      'orca tickets launch --ticket <id> [--ticket <id>...] [--type <ticket-id>=<type>...] [--cloud] [--worktree <selector>] [--source github-issues|repo-files] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'source', 'ticket', 'type', 'cloud'],
    repeatableFlags: ['ticket', 'type'],
    notes: [
      'Each ticket must still be ready when the launch re-surveys; others are skipped with the reason.',
      'An issue is claimed by assigning it to you; a failed launch releases the claim.',
      'The branch is <type>/<id>-<title slug>; the type comes from the ticket labels (feat when none says otherwise) unless --type sets it.',
      'Corka then follows each ticket to its PR and moves the workspace to In review.',
      'With --cloud, each GitHub issue starts as a Claude cloud session instead, in a terminal of the parent workspace, which must be on the default branch. This host then takes their PRs into the merge queue.'
    ],
    examples: [
      'orca tickets launch --ticket "#12" --ticket "#14"',
      'orca tickets launch --ticket T86 --type T86=fix'
    ]
  },
  {
    path: ['tickets', 'brief'],
    summary: 'Print the brief to start a Claude cloud session on one GitHub issue with',
    usage:
      'orca tickets brief --ticket <id> [--type <type>] [--claim] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'ticket', 'type', 'claim'],
    notes: [
      'Prints only the brief, so it can go straight into `claude --cloud`. Start the session from a checkout of the default branch: the cloud clones the branch your checkout is on.',
      'With --claim, a ready issue is first assigned to you, as a launch would, so no host launches it too.',
      'The brief names the branch <type>/<id>-<title slug> and asks for findings in the PR body. With `orca tickets settings --adopt-cloud on`, Corka takes the PR into the merge queue and checks those findings.'
    ],
    examples: [
      'claude --cloud "$(orca tickets brief --ticket 312 --claim)"',
      'orca tickets brief --ticket "#312" --type fix'
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
      'orca tickets settings [--worktree <selector>] [--source <source>] [--auto-clean on|off] [--auto-merge on|off] [--adopt-cloud on|off] [--triage-model <model>|default] [--finding-model <model>|default] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'source',
      'auto-clean',
      'auto-merge',
      'adopt-cloud',
      'triage-model',
      'finding-model'
    ],
    notes: [
      'The source is auto (ticket files, else GitHub issues), github-issues, linear:<TEAM KEY> or jira:<PROJECT KEY>, from the Linear and Jira accounts connected in Settings.',
      'With --auto-clean on, Corka removes a ticket workspace once its PR merges and the clean-up survey clears it.',
      'With --auto-merge on, the merge queue merges its head as soon as it is ready instead of waiting for `orca tickets merge`.',
      'With --adopt-cloud on, Corka takes PRs that Claude cloud sessions open on ticket branches into the merge queue and sends their fix briefs to the session. Turn it on for one host only.',
      'With --triage-model and --finding-model, triage and finding-check agents run that model (sonnet, haiku, or a full id) instead of your default; `default` goes back to it. Implementation agents keep your default.'
    ],
    examples: [
      'orca tickets settings',
      'orca tickets settings --source linear:ENG',
      'orca tickets settings --auto-clean on --auto-merge on',
      'orca tickets settings --triage-model sonnet --finding-model haiku'
    ]
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
  },
  {
    path: ['tickets', 'draft', 'submit'],
    summary: 'Hand ticket drafts to Corka for the user to review; used by drafting agents',
    usage:
      'orca tickets draft submit --batch <id> (--drafts <json> | --drafts-file <path|->) [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'batch', 'drafts', 'drafts-file'],
    notes: [
      'The JSON is {"drafts": [{"key", "title", "body", "labels", "blockedBy", "covers"}], "decisions": [...]}; blockedBy names other draft keys or existing tickets as #<n>.',
      'Nothing is published: the drafts wait in Corka until the user reviews and publishes them. A refusal names what to fix; submit again after fixing it.'
    ],
    examples: ['orca tickets draft submit --batch 0f3c… --drafts-file drafts.json']
  },
  {
    path: ['tickets', 'finding'],
    summary: 'Hand over a finding outside the ticket being implemented; an agent checks it first',
    usage:
      'orca tickets finding --of <ticket> --title <text> (--body <text> | --body-file <path|->) [--blocked-by <id>...] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'of', 'title', 'body', 'body-file', 'blocked-by', 'worktree'],
    repeatableFlags: ['blocked-by'],
    notes: [
      'Nothing is filed yet: Corka starts an agent in the parent workspace that checks the default branch and the open tickets, files the finding only if it is new, and links its blockers.',
      '--of must name a ticket Corka launched in this project.'
    ],
    examples: [
      'orca tickets finding --of "#12" --title "Login form drops focus" --body-file finding.md'
    ]
  },
  {
    path: ['tickets', 'link'],
    summary: 'Mark one existing ticket as blocked by another in the tracker',
    usage: 'orca tickets link --ticket <id> --blocked-by <id> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ticket', 'blocked-by', 'worktree'],
    examples: ['orca tickets link --ticket "#14" --blocked-by "#20"']
  },
  {
    path: ['tickets', 'create'],
    summary: 'Publish a ticket at once, such as a finding an agent checked is new',
    usage:
      'orca tickets create --title <text> (--body <text> | --body-file <path|->) [--finding-of <ticket>] [--blocked-by <#n>...] [--label <name>...] [--worktree <selector>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'title',
      'body',
      'body-file',
      'finding-of',
      'blocked-by',
      'label',
      'worktree'
    ],
    repeatableFlags: ['blocked-by', 'label'],
    notes: [
      'With --finding-of, the ticket is marked for triage (a "Status: needs triage" line and a needs-triage label), the body opens with "Found while implementing <ticket>.", and the finding is recorded on that ticket, which must be one Corka launched in this project.',
      'The body gets a Blocked by section from --blocked-by; labels that do not exist in the repo are dropped.'
    ],
    examples: [
      'orca tickets create --finding-of "#12" --title "Login form drops focus" --body-file finding.md',
      'orca tickets create --title "Follow-up" --body "…" --blocked-by "#12"'
    ]
  }
]
