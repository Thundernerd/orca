import { z } from 'zod'
import type { GitHubRepositoryIdentity } from '../../../shared/github/repositories/repository-identity'
import { resolveGitHubRepoExecution } from '../repositories/github-api-repository'
import { ghApi } from './pr-merge-queue-github'
import {
  readCloudSessionTag,
  withCloudSessionMarker
} from '../../../shared/ticket-pipeline/cloud-session-marker'

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

export type CloudSessionPR = {
  number: number
  url: string
  branch: string
  body: string
  sessionId: string
  /** The Corka host that follows it; null until one claims it. */
  host: string | null
}

/** Open, non-draft PRs of the repo's own branches that a Claude cloud session opened. */
export async function listOpenCloudSessionPRs(
  repoPath: string
): Promise<{ ownerRepo: GitHubRepositoryIdentity; prs: CloudSessionPR[] }> {
  const { ownerRepo } = await resolveGitHubRepoExecution(repoPath, null)
  if (!ownerRepo) {
    throw new Error('Could not resolve the GitHub repository.')
  }
  const stdout = await ghApi(repoPath, ownerRepo, [
    `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls?state=open&per_page=100`,
    '--jq',
    '[.[] | {number, url: .html_url, branch: .head.ref, body: (.body // ""), draft, sameRepo: (.head.repo.full_name == .base.repo.full_name)}]'
  ])
  const prs = OpenPRs.parse(JSON.parse(stdout || '[]')).flatMap((pr) => {
    const tag = readCloudSessionTag(pr.body)
    return tag && !pr.draft && pr.sameRepo
      ? [{ number: pr.number, url: pr.url, branch: pr.branch, body: pr.body, ...tag }]
      : []
  })
  return { ownerRepo, prs }
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
