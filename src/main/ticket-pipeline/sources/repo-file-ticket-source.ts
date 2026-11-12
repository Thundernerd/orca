import {
  isOwnedByUser,
  parseTicketFileDeps,
  parseTicketFileTitle,
  TICKET_FILE_NAME
} from '../../../shared/ticket-pipeline/ticket-body-markers'
import type { Ticket } from '../../../shared/ticket-pipeline/ticket-types'
import { gitExecFileAsync } from '../../git/runner'
import { acquire, ghExecFileAsync, release } from '../../github/gh-utils'

export const TICKET_FILES_DIR = 'docs/tickets/'

/** `docs/tickets/<ID>-<slug>.md` paths on the given ref. */
export async function listTicketFilePaths(repoPath: string, ref: string): Promise<string[]> {
  try {
    const { stdout } = await gitExecFileAsync(['ls-tree', '--name-only', ref, TICKET_FILES_DIR], {
      cwd: repoPath
    })
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((path) => TICKET_FILE_NAME.test(path.slice(TICKET_FILES_DIR.length)))
  } catch {
    return []
  }
}

/** Ticket ids whose `<ID>:` PR merged: that merge is what finishes a ticket file. */
async function listMergedTicketIds(repoPath: string): Promise<Set<string>> {
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      ['pr', 'list', '--state', 'merged', '--limit', '1000', '--json', 'title', '-q', '.[].title'],
      { cwd: repoPath }
    )
    const ids = stdout
      .split('\n')
      .map((title) => /^([A-Z]+\d+)\b/.exec(title.trim())?.[1])
      .filter((id): id is string => Boolean(id))
    return new Set(ids)
  } finally {
    release()
  }
}

/** Ticket files on the default branch that have no merged PR yet. */
export async function surveyRepoFileTickets(
  repoPath: string,
  ref: string,
  paths: readonly string[]
): Promise<{ tickets: Ticket[]; doneIds: Set<string> }> {
  const doneIds = await listMergedTicketIds(repoPath)
  const tickets: Ticket[] = []
  for (const path of paths) {
    const id = TICKET_FILE_NAME.exec(path.slice(TICKET_FILES_DIR.length))?.[1]
    if (!id || doneIds.has(id)) {
      continue
    }
    const { stdout: body } = await gitExecFileAsync(['show', `${ref}:${path}`], { cwd: repoPath })
    tickets.push({
      id,
      slugId: id.toLowerCase(),
      title: parseTicketFileTitle(body),
      url: null,
      ref: path,
      issueNumber: null,
      assignees: [],
      ownedByUser: isOwnedByUser(body),
      blockerIds: parseTicketFileDeps(body),
      labels: []
    })
  }
  return { tickets, doneIds }
}
