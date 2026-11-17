import { z } from 'zod'
import type { GitHubRepositoryIdentity as GitHubOwnerRepo } from '../../../shared/github/repositories/repository-identity'
import { ghExecFileAsync } from '../../git/command-runner/hosted-cli/gh-exec-file'
import { acquire, release } from '../execution/github-operation-slots'
import { resolveGitHubRepoExecution } from '../repositories/github-api-repository'
import { getPRMergeBlocker } from '../client/merge/merge-pr'

/** `https://github.com/<owner>/<repo>/pull/<n>`: the PR's own repository, which a fork's PR may not share with origin. */
export function prRepoFromUrl(url: string): GitHubOwnerRepo | null {
  const match = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(url)
  if (!match) {
    return null
  }
  const [, host, owner, repo] = match
  return host === 'github.com' ? { owner, repo } : { owner, repo, host }
}

async function ghApi(repoPath: string, prRepo: GitHubOwnerRepo, args: string[]): Promise<string> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(repoPath, prRepo)
  if (!ownerRepo) {
    throw new Error('Could not resolve the GitHub repository for this PR.')
  }
  await acquire()
  try {
    return (await ghExecFileAsync(['api', ...args], ghOptions)).stdout
  } finally {
    release()
  }
}

/** Whether the base branch has commits the PR head lacks, judged by GitHub so no local fetch is needed. */
export async function isPRBehindBase(
  repoPath: string,
  prRepo: GitHubOwnerRepo,
  baseRef: string,
  headSha: string
): Promise<boolean> {
  const stdout = await ghApi(repoPath, prRepo, [
    `repos/${prRepo.owner}/${prRepo.repo}/compare/${encodeURIComponent(baseRef)}...${headSha}`,
    '--jq',
    '.behind_by'
  ])
  return Number(stdout.trim()) > 0
}

/** Merges the base into the PR branch on GitHub; refused if the head moved since it was read. */
export async function updatePRBranch(
  repoPath: string,
  prRepo: GitHubOwnerRepo,
  prNumber: number,
  expectedHeadSha: string
): Promise<void> {
  await ghApi(repoPath, prRepo, [
    '-X',
    'PUT',
    `repos/${prRepo.owner}/${prRepo.repo}/pulls/${prNumber}/update-branch`,
    '-f',
    `expected_head_sha=${expectedHeadSha}`
  ])
}

/** The PR body and every commit message, for the attribution check. */
export async function getPRTexts(
  repoPath: string,
  prRepo: GitHubOwnerRepo,
  prNumber: number
): Promise<string[]> {
  const base = `repos/${prRepo.owner}/${prRepo.repo}/pulls/${prNumber}`
  const [body, commits] = await Promise.all([
    ghApi(repoPath, prRepo, [base, '--jq', '.body // ""']),
    ghApi(repoPath, prRepo, [`${base}/commits?per_page=100`, '--jq', '.[].commit.message'])
  ])
  return [body, commits]
}

/** What GitHub still requires before a merge (a review, say), via the merge button's own check. */
export async function getPRBlocker(
  repoPath: string,
  prRepo: GitHubOwnerRepo,
  prNumber: number,
  viaMergeQueue: boolean
): Promise<string | null> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(repoPath, prRepo)
  return getPRMergeBlocker(
    repoPath,
    prNumber,
    ownerRepo,
    ghOptions,
    undefined,
    {},
    {
      viaMergeQueue
    }
  )
}

const PRMergeQueueReply = z
  .object({
    headRefOid: z.string().nullish(),
    isMergeQueueEnabled: z.boolean().nullish(),
    isInMergeQueue: z.boolean().nullish(),
    timelineItems: z
      .object({
        nodes: z
          .array(
            z.object({ createdAt: z.string().nullish(), reason: z.string().nullish() }).nullable()
          )
          .nullish()
      })
      .nullish(),
    mergeQueue: z
      .object({
        entries: z
          .object({
            nodes: z.array(z.object({ enqueuedAt: z.string().nullish() }).nullable()).nullish()
          })
          .nullish()
      })
      .nullish()
  })
  .nullable()

export type PRMergeQueueState = {
  /** The base branch merges through GitHub's merge queue. */
  enabled: boolean
  inQueue: boolean
  headSha: string | null
  /** When GitHub last took the PR out of its queue, and why; null if it never did. */
  removed: { at: number; reason: string | null } | null
  /** When each PR now in the base branch's merge queue was added. */
  entriesEnqueuedAt: number[]
}

/** Where the PR stands with GitHub's merge queue, in one GraphQL call. */
export async function getPRMergeQueueState(
  repoPath: string,
  prRepo: GitHubOwnerRepo,
  prNumber: number
): Promise<PRMergeQueueState> {
  const query = `query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        headRefOid
        isMergeQueueEnabled
        isInMergeQueue
        timelineItems(last: 1, itemTypes: [REMOVED_FROM_MERGE_QUEUE_EVENT]) {
          nodes { ... on RemovedFromMergeQueueEvent { createdAt reason } }
        }
        mergeQueue { entries(first: 100) { nodes { enqueuedAt } } }
      }
    }
  }`
  const stdout = await ghApi(repoPath, prRepo, [
    'graphql',
    '-f',
    `query=${query}`,
    '-f',
    `owner=${prRepo.owner}`,
    '-f',
    `repo=${prRepo.repo}`,
    '-F',
    `number=${prNumber}`,
    '--jq',
    '.data.repository.pullRequest'
  ])
  const pr = PRMergeQueueReply.parse(JSON.parse(stdout || 'null'))
  const event = pr?.timelineItems?.nodes?.at(-1)
  const removedAt = event?.createdAt ? Date.parse(event.createdAt) : Number.NaN
  return {
    enabled: pr?.isMergeQueueEnabled === true,
    inQueue: pr?.isInMergeQueue === true,
    headSha: pr?.headRefOid ?? null,
    removed: Number.isNaN(removedAt) ? null : { at: removedAt, reason: event?.reason || null },
    entriesEnqueuedAt: (pr?.mergeQueue?.entries?.nodes ?? [])
      .map((entry) => Date.parse(entry?.enqueuedAt ?? ''))
      .filter((at) => !Number.isNaN(at))
  }
}
