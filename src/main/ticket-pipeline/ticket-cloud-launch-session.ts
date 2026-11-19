import { isCloudTicket } from '../../shared/ticket-pipeline/ticket-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { TicketItemStore } from './ticket-item-store'

const LAUNCH_TITLE = /^#(\d+) in the cloud$/
// `claude --cloud` prints the session it created: "View: https://claude.ai/code/session_…".
const SESSION_LINK = /claude\.ai\/code\/(session_[A-Za-z0-9]+)/
const WATCH_INTERVAL_MS = 2_000
// Long enough for the user to answer whatever the CLI asks before it creates the session.
const WATCH_LIMIT_MS = 10 * 60_000

/** The session a launch terminal printed; undefined when it has not printed one yet. */
async function readLaunchedSession(
  runtime: OrcaRuntimeService,
  handle: string
): Promise<string | undefined> {
  const read = await runtime.readTerminal(handle, { limit: 200 })
  return read.tail.map((line) => SESSION_LINK.exec(line)?.[1]).find(Boolean)
}

/** Records the session and closes the terminal that launched it: once the session exists, the
 *  terminal holds nothing more. */
async function recordAndClose(
  runtime: OrcaRuntimeService,
  store: TicketItemStore,
  launch: { repoId: string; issueNumber: number; handle: string },
  sessionId: string
): Promise<void> {
  await store.recordCloudLaunch(launch.repoId, launch.issueNumber, sessionId)
  await runtime.closeTerminal(launch.handle).catch((error: unknown) => {
    console.warn(`[tickets] could not close the launch terminal of #${launch.issueNumber}`, error)
  })
}

/** Records the session a just-launched terminal creates as soon as it prints it, then closes the
 *  terminal. Stops once the terminal is gone. */
export async function watchCloudLaunch(
  runtime: OrcaRuntimeService,
  store: TicketItemStore,
  launch: { repoId: string; issueNumber: number; handle: string }
): Promise<void> {
  const deadline = Date.now() + WATCH_LIMIT_MS
  while (Date.now() < deadline) {
    const sessionId = await readLaunchedSession(runtime, launch.handle).catch(() => null)
    if (sessionId === null) {
      return
    }
    if (sessionId) {
      await recordAndClose(runtime, store, launch, sessionId)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS))
  }
}

/** The title of the terminal a ticket's cloud session is launched from. */
export function cloudLaunchTerminalTitle(ticketId: string): string {
  return `${ticketId} in the cloud`
}

/** Remembers the session each open launch terminal in the parent workspace created, by issue,
 *  until its PR is adopted: a cloud session's PR no longer names its session. Catches launches
 *  no watcher saw, such as ones from before a restart. */
export async function recordLaunchedCloudSessions(
  runtime: OrcaRuntimeService,
  store: TicketItemStore,
  repoId: string,
  parentSelector: string
): Promise<void> {
  const adopted = new Set(
    (await store.list())
      .filter((i) => i.repoId === repoId && isCloudTicket(i))
      .map((i) => i.issueNumber)
  )
  const listed = await runtime.listTerminals(parentSelector, undefined, {
    includeVisualLayouts: false
  })
  for (const terminal of listed.terminals) {
    const issueNumber = Number(LAUNCH_TITLE.exec(terminal.title ?? '')?.[1] ?? Number.NaN)
    if (
      Number.isNaN(issueNumber) ||
      adopted.has(issueNumber) ||
      (await store.cloudLaunchSession(repoId, issueNumber))
    ) {
      continue
    }
    const sessionId = await readLaunchedSession(runtime, terminal.handle).catch(() => undefined)
    if (sessionId) {
      await recordAndClose(
        runtime,
        store,
        { repoId, issueNumber, handle: terminal.handle },
        sessionId
      )
    }
  }
}
