import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { writePluginFileAtomically } from '../plugins/installation/plugin-atomic-file-write'

type TicketItemFile = { version: 1; items: TicketItem[] }

const FILE_NAME = 'ticket-pipeline.json'

function isTicketItemFile(value: unknown): value is TicketItemFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'items' in value &&
    Array.isArray(value.items)
  )
}

/** Launched tickets and where each stands, kept per profile; the tracker is the only writer besides launch. */
export class TicketItemStore {
  private items: Map<string, TicketItem> | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  private async load(): Promise<Map<string, TicketItem>> {
    if (this.items) {
      return this.items
    }
    let parsed: unknown = null
    try {
      parsed = JSON.parse(await readFile(this.path, 'utf8'))
    } catch {
      // Missing or unreadable starts empty; the next write replaces it.
    }
    const loaded = new Map<string, TicketItem>()
    for (const item of isTicketItemFile(parsed) ? parsed.items : []) {
      loaded.set(item.id, item)
    }
    this.items ??= loaded
    return this.items
  }

  async list(): Promise<TicketItem[]> {
    return [...(await this.load()).values()]
  }

  async put(item: TicketItem): Promise<void> {
    ;(await this.load()).set(item.id, item)
    await this.flush()
  }

  async update(id: string, patch: Partial<TicketItem>): Promise<TicketItem | null> {
    const items = await this.load()
    const current = items.get(id)
    if (!current) {
      return null
    }
    const next = { ...current, ...patch, id, updatedAt: Date.now() }
    items.set(id, next)
    await this.flush()
    return next
  }

  private flush(): Promise<void> {
    const snapshot: TicketItemFile = { version: 1, items: [...(this.items?.values() ?? [])] }
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => writePluginFileAtomically(this.path, JSON.stringify(snapshot, null, 2)))
    return this.writing
  }
}

let store: TicketItemStore | null = null

export function getTicketItemStore(): TicketItemStore {
  store ??= new TicketItemStore(join(getProfileUserDataPath(), FILE_NAME))
  return store
}
