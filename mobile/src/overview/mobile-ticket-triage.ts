import { Alert } from 'react-native'
import { translate } from '../i18n/mobile-i18n'
import type { MobileTicketActions, MobileTicketResult } from './mobile-ticket-actions'

/** A ticket marked for triage: the triage skill takes it, or the user is asked what to do. */
export function pressTriageTicket(args: {
  ticketId: string
  triageSkill: string | null
  actions: MobileTicketActions
  finish: (run: () => Promise<MobileTicketResult>) => void
}): void {
  const { ticketId, actions, finish } = args
  if (args.triageSkill) {
    finish(() => actions.triage(ticketId))
    return
  }
  Alert.alert(
    translate('overview.mobile.tickets.triageTitle', '{{ticket}} needs triage', {
      ticket: ticketId
    }),
    translate(
      'overview.mobile.tickets.triageQuestion',
      'No triage skill is installed. Launch it as it is, or leave it for later?'
    ),
    [
      { text: translate('overview.mobile.tickets.triageLeave', 'Leave it'), style: 'cancel' },
      {
        text: translate('overview.mobile.tickets.triageLaunch', 'Launch anyway'),
        onPress: () => finish(() => actions.launch([ticketId], { skipTriage: true }))
      }
    ]
  )
}

/** The row's note: who decides first. */
export function triageRowMeta(triageSkill: string | null): string {
  return triageSkill
    ? translate(
        'overview.mobile.tickets.triageWithSkill',
        'Needs triage: tap to triage with /{{skill}}',
        {
          skill: triageSkill
        }
      )
    : translate('overview.mobile.tickets.triageAsk', 'Needs triage: tap to decide')
}
