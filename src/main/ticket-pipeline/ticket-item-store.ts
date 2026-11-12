import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DEFAULT_TICKET_PIPELINE_SETTINGS,
  type TicketItem,
  type TicketPipelineSettings
} from '../../shared/ticket-pipeline/ticket-types'
import type { TicketDraftBatch } from '../../shared/ticket-pipeline/ticket-draft-types'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { writePluginFileAtomically } from '../plugins/installation/plugin-atomic-file-write'

type TicketItemFile = {
  version: 1
  items: TicketItem[]
  settings?: Record<string, TicketPipelineSettings>
  /** Paused merge queues by parent workspace id, with the reason the user sees. */
  pausedQueues?: Record<string, string>
  draftBatches?: TicketDraftBatch[]
}

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
  private settings = new Map<string, TicketPipelineSettings>()
  private pausedQueues = new Map<string, string>()
  private draftBatches = new Map<string, TicketDraftBatch>()
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
    if (!this.items) {
      this.items = loaded
      const settings = isTicketItemFile(parsed) ? (parsed.settings ?? {}) : {}
      this.settings = new Map(Object.entries(settings))
      const paused = isTicketItemFile(parsed) ? (parsed.pausedQueues ?? {}) : {}
      this.pausedQueues = new Map(Object.entries(paused))
      const batches = isTicketItemFile(parsed) ? (parsed.draftBatches ?? []) : []
      this.draftBatches = new Map(batches.map((batch) => [batch.id, batch]))
    }
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

  async getSettings(repoId: string): Promise<TicketPipelineSettings> {
    await this.load()
    return { ...DEFAULT_TICKET_PIPELINE_SETTINGS, ...this.settings.get(repoId) }
  }

  async updateSettings(
    repoId: string,
    patch: Partial<TicketPipelineSettings>
  ): Promise<TicketPipelineSettings> {
    const next = { ...(await this.getSettings(repoId)), ...patch }
    this.settings.set(repoId, next)
    await this.flush()
    return next
  }

  async getQueuePause(parentWorktreeId: string): Promise<string | null> {
    await this.load()
    return this.pausedQueues.get(parentWorktreeId) ?? null
  }

  async setQueuePause(parentWorktreeId: string, reason: string | null): Promise<void> {
    await this.load()
    if (reason === null) {
      this.pausedQueues.delete(parentWorktreeId)
    } else {
      this.pausedQueues.set(parentWorktreeId, reason)
    }
    await this.flush()
  }

  async listDraftBatches(): Promise<TicketDraftBatch[]> {
    await this.load()
    return [...this.draftBatches.values()]
  }

  async putDraftBatch(batch: TicketDraftBatch): Promise<TicketDraftBatch> {
    await this.load()
    const next = { ...batch, updatedAt: Date.now() }
    this.draftBatches.set(batch.id, next)
    await this.flush()
    return next
  }

  private flush(): Promise<void> {
    const snapshot: TicketItemFile = {
      version: 1,
      items: [...(this.items?.values() ?? [])],
      settings: Object.fromEntries(this.settings),
      pausedQueues: Object.fromEntries(this.pausedQueues),
      draftBatches: [...this.draftBatches.values()]
    }
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
