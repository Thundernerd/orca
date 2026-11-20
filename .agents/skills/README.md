# Agent skills

Skills that agents working on Corka tickets use, in the repo so local and cloud sessions (Claude Code on the web) get the same versions. `.claude/skills/` links to them for Claude Code.

| Skill | Used by |
| --- | --- |
| `tdd` | Implementation: test-first loop at agreed seams |
| `codebase-design` | `tdd`'s deep-module vocabulary |
| `code-review` | Implementation: two-axis review before the PR |
| `pr` | Implementation: the PR body |
| `triage` | Triage: readies issues for an agent |

Installed from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, see `LICENSE`). Add a skill here only when ticket agents use it: every skill's description loads in every session.
