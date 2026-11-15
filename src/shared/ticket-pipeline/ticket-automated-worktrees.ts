/** The status fields this reads; the phone parses its own looser copy of the status. */
type AutomatedStatus = { automatedWorktreeIds?: readonly string[] } | null

/**
 * Per project, the workspaces its host's merge queue or auto-clean carries on without the user,
 * as a string: equal sets give equal keys, so a poll that changed nothing rebuilds nothing.
 */
export function ticketAutomatedWorktreesKey(
  statuses: ReadonlyMap<string, AutomatedStatus>
): string {
  return JSON.stringify(
    [...statuses]
      .flatMap(([projectId, status]) =>
        status?.automatedWorktreeIds?.length
          ? [[projectId, [...status.automatedWorktreeIds].sort()] as const]
          : []
      )
      .sort(([a], [b]) => a.localeCompare(b))
  )
}

export function automatedWorktreesFromKey(key: string): ReadonlyMap<string, ReadonlySet<string>> {
  const entries: [string, string[]][] = JSON.parse(key)
  return new Map(entries.map(([projectId, ids]) => [projectId, new Set(ids)]))
}
