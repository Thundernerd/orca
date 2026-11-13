import * as z from 'zod'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../transport/rpc/rpc-operation-result-reader'
import type { RpcMethodName } from '../../../src/shared/rpc-contract/rpc-params-catalog.generated'

// Only the fields the phone reads are pinned; the host may send more.
const surveySchema = z.looseObject({
  source: z.string(),
  rows: z.array(
    z.looseObject({
      status: z.string(),
      ticket: z.looseObject({ id: z.string(), title: z.string() }),
      waitingOn: z.array(z.string())
    })
  )
})

const launchSchema = z.looseObject({
  outcomes: z.array(
    z.looseObject({ id: z.string(), status: z.string(), reason: z.string().optional() })
  )
})

const cleanSurveySchema = z.looseObject({
  rows: z.array(
    z.looseObject({
      worktreeId: z.string(),
      name: z.string(),
      verdict: z.enum(['remove', 'keep']),
      reason: z.string()
    })
  )
})

const cleanSchema = z.looseObject({
  outcomes: z.array(
    z.looseObject({ worktreeId: z.string(), status: z.string(), reason: z.string().optional() })
  )
})

const queueSchema = z.looseObject({
  pausedReason: z.string().nullable(),
  autoMerge: z.boolean(),
  entries: z.array(
    z.looseObject({
      itemId: z.string(),
      ticketId: z.string(),
      ticketTitle: z.string(),
      reviewNumber: z.number().nullable(),
      queue: z.looseObject({ status: z.string(), detail: z.string() }).nullable()
    })
  )
})

const statusSchema = z.looseObject({
  checkedAt: z.number().nullable(),
  watching: z.boolean(),
  autoMerge: z.boolean(),
  autoClean: z.boolean(),
  queue: z.looseObject({
    head: z
      .looseObject({
        ticketId: z.string(),
        reviewNumber: z.number().nullable(),
        status: z.string().nullable(),
        detail: z.string().nullable(),
        since: z.number().nullable()
      })
      .nullable(),
    waiting: z.number(),
    pausedReason: z.string().nullable()
  }),
  clean: z.looseObject({
    lastRemoved: z.looseObject({ ticketId: z.string(), at: z.number() }).nullable(),
    held: z.array(z.looseObject({ ticketId: z.string(), reason: z.string(), at: z.number() })),
    pending: z.number()
  })
})

// Drafts are sent back to publish exactly as received, so every field survives the round trip.
const draftSchema = z.looseObject({
  key: z.string(),
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()),
  blockedBy: z.array(z.string()),
  covers: z.array(z.string())
})

const batchSchema = z.looseObject({
  id: z.string(),
  status: z.enum(['drafting', 'review', 'published', 'discarded']),
  request: z.string(),
  drafts: z.array(draftSchema),
  decisions: z.array(z.string()),
  published: z.array(z.looseObject({ id: z.string() })),
  error: z.string().optional()
})

const batchListSchema = z.looseObject({ batches: z.array(batchSchema) })

export type MobileTicketSurvey = z.infer<typeof surveySchema>
export type MobileWorkspaceCleanSurvey = z.infer<typeof cleanSurveySchema>
export type MobileTicketQueue = z.infer<typeof queueSchema>
export type MobileTicketDraftBatch = z.infer<typeof batchSchema>
export type MobileTicketPipelineStatus = z.infer<typeof statusSchema>

function ticketOperation<Method extends RpcMethodName, T extends z.ZodType>(
  method: Method,
  schema: T
) {
  return bindDeferredRpcOperation(
    defineRpcOperation({
      name: method,
      method,
      acceptance: 'require-result-or-throw-message',
      barrier: 'after-caller-barrier',
      read: rpcResultVariant(method, schema)
    })
  )
}

export const ticketSurveyRead = ticketOperation('tickets.survey', surveySchema)
export const ticketLaunchRun = ticketOperation('tickets.launch', launchSchema)
export const ticketCleanSurveyRead = ticketOperation('tickets.cleanSurvey', cleanSurveySchema)
export const ticketCleanRun = ticketOperation('tickets.clean', cleanSchema)
export const ticketQueueRead = ticketOperation('tickets.queue', queueSchema)
export const ticketStatusRead = ticketOperation('tickets.status', statusSchema)
export const ticketQueueResumeRun = ticketOperation('tickets.queueResume', queueSchema)
export const ticketMergeRun = ticketOperation('tickets.merge', queueSchema)
export const ticketDraftStartRun = ticketOperation('tickets.draftStart', batchSchema)
export const ticketDraftListRead = ticketOperation('tickets.draftList', batchListSchema)
export const ticketDraftPublishRun = ticketOperation('tickets.draftPublish', batchSchema)
export const ticketDraftDiscardRun = ticketOperation('tickets.draftDiscard', batchSchema)
