import type { GitHubOwnerRepo } from '../../shared/github/pull-request-types'
import { acquire, ghExecFileAsync, release } from './gh-utils'
import { resolveGitHubRepoExecution } from './github-api-repository'
import { getPRMergeBlocker } from './client/merge/merge-pr'

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

/** What GitHub still requires before a merge (a review, the merge queue), via the merge button's own check. */
export async function getPRBlocker(
  repoPath: string,
  prRepo: GitHubOwnerRepo,
  prNumber: number
): Promise<string | null> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(repoPath, prRepo)
  return getPRMergeBlocker(repoPath, prNumber, ownerRepo, ghOptions)
}
