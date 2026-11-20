import { z } from 'zod'
import type { GitHubRepositoryIdentity } from '../../../shared/github/repositories/repository-identity'
import { resolveGitHubRepoExecution } from '../repositories/github-api-repository'
import { ghApi } from './pr-merge-queue-github'
import {
  readCloudSessionTag,
  withCloudSessionMarker,
  type CloudSessionTag
} from '../../../shared/ticket-pipeline/cloud-session-marker'
import { findAgentBrief } from '../../../shared/ticket-pipeline/agent-brief'

const OpenPRs = z.array(
  z.object({
    number: z.number(),
    url: z.string(),
    branch: z.string(),
    body: z.string(),
    draft: z.boolean(),
    sameRepo: z.boolean()
  })
)

const Issue = z.object({ title: z.string(), url: z.string(), body: z.string() })

const IssueComment = z.object({ body: z.string(), createdAt: z.string() })

export type OpenRepoPR = {
  number: number
  url: string
  branch: string
  body: string
  /** The cloud session and host its body names now; null when it names neither. */
  tag: CloudSessionTag | null
}

export type CloudSessionPR = Pick<OpenRepoPR, 'number' | 'url' | 'branch' | 'body'> &
  CloudSessionTag

/** Open, non-draft PRs of the repo's own branches, with the cloud session their body names. */
export async function listOpenRepoPRs(
  repoPath: string
): Promise<{ ownerRepo: GitHubRepositoryIdentity; prs: OpenRepoPR[] }> {
  const { ownerRepo } = await resolveGitHubRepoExecution(repoPath, null)
  if (!ownerRepo) {
    throw new Error('Could not resolve the GitHub repository.')
  }
  const stdout = await ghApi(repoPath, ownerRepo, [
    `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls?state=open&per_page=100`,
    '--jq',
    '[.[] | {number, url: .html_url, branch: .head.ref, body: (.body // ""), draft, sameRepo: (.head.repo.full_name == .base.repo.full_name)}]'
  ])
  const prs = OpenPRs.parse(JSON.parse(stdout || '[]')).flatMap((pr) =>
    !pr.draft && pr.sameRepo
      ? [
          {
            number: pr.number,
            url: pr.url,
            branch: pr.branch,
            body: pr.body,
            tag: readCloudSessionTag(pr.body)
          }
        ]
      : []
  )
  return { ownerRepo, prs }
}

const FirstRevision = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        userContentEdits: z.object({
          nodes: z.array(z.object({ diff: z.string().nullish() }).nullable())
        })
      })
    })
  })
})

/** The cloud session a PR's body named when it was opened, from GitHub's edit history: a session
 *  can rewrite its body, footer and all, before any host sees it. Null when it named none. */
export async function readFirstRevisionSessionId(
  repoPath: string,
  ownerRepo: GitHubRepositoryIdentity,
  prNumber: number
): Promise<string | null> {
  // Edits list newest first, so the last one is the body as it was opened.
  const query = `query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) { userContentEdits(last: 1) { nodes { diff } } }
    }
  }`
  const stdout = await ghApi(repoPath, ownerRepo, [
    'graphql',
    '-f',
    `query=${query}`,
    '-f',
    `owner=${ownerRepo.owner}`,
    '-f',
    `repo=${ownerRepo.repo}`,
    '-F',
    `number=${prNumber}`
  ])
  const original = FirstRevision.parse(JSON.parse(stdout)).data.repository.pullRequest
    .userContentEdits.nodes[0]?.diff
  return original ? (readCloudSessionTag(original)?.sessionId ?? null) : null
}

export async function readIssue(
  repoPath: string,
  issueNumber: number,
  knownOwnerRepo?: GitHubRepositoryIdentity
): Promise<{ title: string; url: string; body: string }> {
  const ownerRepo = knownOwnerRepo ?? (await resolveGitHubRepoExecution(repoPath, null)).ownerRepo
  if (!ownerRepo) {
    throw new Error('Could not resolve the GitHub repository.')
  }
  const stdout = await ghApi(repoPath, ownerRepo, [
    `repos/${ownerRepo.owner}/${ownerRepo.repo}/issues/${issueNumber}`,
    '--jq',
    '{title, url: .html_url, body: (.body // "")}'
  ])
  return Issue.parse(JSON.parse(stdout))
}

/** The latest agent brief comment triage wrote on the issue. Null when there is none, or when the
 *  comments cannot be read: the brief then carries the body alone, as it did before. */
export async function readAgentBrief(
  repoPath: string,
  issueNumber: number,
  knownOwnerRepo?: GitHubRepositoryIdentity
): Promise<string | null> {
  try {
    const ownerRepo = knownOwnerRepo ?? (await resolveGitHubRepoExecution(repoPath, null)).ownerRepo
    if (!ownerRepo) {
      return null
    }
    // --paginate with --jq prints one JSON object per comment, a line each, across every page.
    const stdout = await ghApi(repoPath, ownerRepo, [
      `repos/${ownerRepo.owner}/${ownerRepo.repo}/issues/${issueNumber}/comments?per_page=100`,
      '--paginate',
      '--jq',
      '.[] | {body: (.body // ""), createdAt: .created_at}'
    ])
    const comments = stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => IssueComment.parse(JSON.parse(line)))
    return findAgentBrief(comments)
  } catch {
    return null
  }
}

/** A PR's body as it stands now, open or merged. */
export async function readPRBody(
  repoPath: string,
  ownerRepo: GitHubRepositoryIdentity,
  prNumber: number
): Promise<string> {
  const stdout = await ghApi(repoPath, ownerRepo, [
    `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${prNumber}`,
    '--jq',
    '.body // ""'
  ])
  return stdout.replace(/\n$/, '')
}

/** Claims the PR for `host`: its footer, which is Claude attribution, becomes a hidden marker
 *  naming the session and this host. Returns the host the PR names once written, which differs
 *  when another host claimed it at the same time. */
export async function claimCloudSessionPR(
  repoPath: string,
  ownerRepo: GitHubRepositoryIdentity,
  pr: Pick<CloudSessionPR, 'number' | 'body' | 'sessionId'>,
  host: string
): Promise<string | null> {
  await ghApi(repoPath, ownerRepo, [
    '-X',
    'PATCH',
    `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${pr.number}`,
    '-f',
    `body=${withCloudSessionMarker(pr.body, { sessionId: pr.sessionId, host })}`
  ])
  return readCloudSessionTag(await readPRBody(repoPath, ownerRepo, pr.number))?.host ?? null
}
