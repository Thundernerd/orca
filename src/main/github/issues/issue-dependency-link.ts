import type { IssueSourcePreference } from '../../../shared/repo-types'
import { ghExecFileAsync } from '../../git/command-runner/hosted-cli/gh-exec-file'
import { acquire, release } from '../execution/github-operation-slots'
import {
  resolveGitHubRepoExecution,
  resolveIssueGitHubApiRepositorySource
} from '../repositories/github-api-repository'

/**
 * Records "issue is blocked by blocker" as a native GitHub issue dependency. Best effort: hosts
 * without dependencies refuse it, and the body's "Blocked by" section still carries the edge.
 */
export async function linkIssueBlockedBy(
  repoPath: string,
  issueNumber: number,
  blockerNumber: number,
  preference?: IssueSourcePreference
): Promise<boolean> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(
    repoPath,
    async () => (await resolveIssueGitHubApiRepositorySource(repoPath, preference)).source
  )
  if (!ownerRepo) {
    return false
  }
  const base = `repos/${ownerRepo.owner}/${ownerRepo.repo}/issues`
  await acquire()
  try {
    // The endpoint takes the blocker's database id, not its number.
    const { stdout } = await ghExecFileAsync(
      ['api', `${base}/${blockerNumber}`, '--jq', '.id'],
      ghOptions
    )
    await ghExecFileAsync(
      [
        'api',
        '-X',
        'POST',
        `${base}/${issueNumber}/dependencies/blocked_by`,
        '-F',
        `issue_id=${stdout.trim()}`
      ],
      ghOptions
    )
    return true
  } catch {
    return false
  } finally {
    release()
  }
}
