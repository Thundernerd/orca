import type {
  OverviewAgentState,
  OverviewAttentionKind,
  OverviewChecks,
  OverviewPr
} from './overview-model-types'
import { translate } from '@/i18n/i18n'

/** Status chip and card-border classes per attention kind, from the documented status tokens. */
export const ATTENTION_TONE: Record<OverviewAttentionKind, { chip: string; border: string }> = {
  'agent-waiting': {
    chip: 'border-destructive/30 bg-destructive/10 text-destructive',
    border: 'border-destructive/40'
  },
  'ci-failing': {
    chip: 'border-destructive/30 bg-destructive/10 text-destructive',
    border: 'border-destructive/40'
  },
  'pr-ready': {
    chip: 'border-status-success-border bg-status-success-background text-status-success',
    border: 'border-status-success-border'
  },
  flagged: {
    chip: 'border-status-warning-border bg-status-warning-background text-status-warning-text',
    border: 'border-status-warning-border'
  }
}

export function attentionKindLabel(kind: OverviewAttentionKind): string {
  switch (kind) {
    case 'agent-waiting':
      return translate('auto.components.overview.kind.agentWaiting', 'Agent waiting')
    case 'ci-failing':
      return translate('auto.components.overview.kind.ciFailing', 'CI failing')
    case 'pr-ready':
      return translate('auto.components.overview.kind.prReady', 'Ready to merge')
    case 'flagged':
      return translate('auto.components.overview.kind.flagged', 'Flagged')
  }
}

export function agentStateLabel(state: OverviewAgentState | null): string {
  switch (state) {
    case 'blocked':
      return translate('auto.components.overview.agent.blocked', 'Blocked')
    case 'waiting':
      return translate('auto.components.overview.agent.waiting', 'Waiting')
    case 'working':
      return translate('auto.components.overview.agent.working', 'Working')
    case 'done':
      return translate('auto.components.overview.agent.done', 'Done')
    case null:
      return '–'
  }
}

export const AGENT_STATE_CLASS: Record<OverviewAgentState, string> = {
  blocked: 'text-destructive',
  waiting: 'text-destructive',
  working: 'text-foreground',
  done: 'text-muted-foreground'
}

const CHECKS_CLASS: Record<OverviewChecks, string> = {
  failure: 'text-destructive',
  pending: 'text-status-warning-text',
  success: 'text-status-success',
  none: 'text-muted-foreground'
}

export function prChecksClass(pr: OverviewPr): string {
  return pr.state === 'open' ? CHECKS_CLASS[pr.checks] : 'text-muted-foreground'
}

export function prSummary(pr: OverviewPr): string {
  if (pr.state !== 'open') {
    return `#${pr.number} ${pr.state}`
  }
  switch (pr.checks) {
    case 'failure':
      return translate('auto.components.overview.pr.failing', '#{{number}} failing', {
        number: pr.number
      })
    case 'pending':
      return translate('auto.components.overview.pr.pending', '#{{number}} pending', {
        number: pr.number
      })
    case 'success':
      return translate('auto.components.overview.pr.green', '#{{number}} green', {
        number: pr.number
      })
    case 'none':
      return `#${pr.number}`
  }
}
