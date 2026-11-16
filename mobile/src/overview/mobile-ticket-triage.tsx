import { useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { translate } from '../i18n/mobile-i18n'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { MobileTicketActions, MobileTicketResult } from './mobile-ticket-actions'
import type { MobileTicketSurvey } from './overview-ticket-operations'
import { overviewStyles as styles } from './mobile-overview-styles'
import { ActionButton, SelectAllToggle, Toggle } from './mobile-ticket-sheet-rows'

type Row = MobileTicketSurvey['rows'][number]

/** Tickets marked for triage: an agent per chosen ticket runs the triage skill, or the user decides. */
export function MobileTriageSection({
  rows,
  triageSkill,
  actions,
  finish
}: {
  rows: readonly Row[]
  triageSkill: string | null
  actions: MobileTicketActions
  finish: (run: () => Promise<MobileTicketResult>) => void
}) {
  const t = useMobileTranslation()
  const ids = rows.map((row) => row.ticket.id)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(ids))
  if (rows.length === 0) {
    return null
  }
  const chosen = ids.filter((id) => selected.has(id))
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) {
        next.add(id)
      }
      return next
    })
  const go = () => {
    if (triageSkill) {
      finish(() => actions.triage(chosen))
      return
    }
    // Launching skips triage, so it asks before it goes.
    Alert.alert(
      translate('overview.mobile.tickets.triageTitleMany', '{{count}} need triage', {
        count: chosen.length
      }),
      translate(
        'overview.mobile.tickets.triageQuestionMany',
        'No triage skill is installed. Launch them as they are, or leave them for later?'
      ),
      [
        { text: translate('overview.mobile.tickets.triageLeave', 'Leave it'), style: 'cancel' },
        {
          text: translate('overview.mobile.tickets.triageLaunch', 'Launch anyway'),
          onPress: () => finish(() => actions.launch(chosen, { skipTriage: true }))
        }
      ]
    )
  }
  return (
    <View>
      <Text style={styles.meta}>
        {triageSkill
          ? t('overview.mobile.tickets.triageSkillNote', 'Needs triage: /{{skill}} decides first', {
              skill: triageSkill
            })
          : t(
              'overview.mobile.tickets.triageAskNote',
              'Needs triage: not launched until you decide'
            )}
      </Text>
      <SelectAllToggle ids={ids} selected={selected} onChange={setSelected} />
      {rows.map((row) => (
        <Toggle
          key={row.ticket.id}
          checked={selected.has(row.ticket.id)}
          label={`${row.ticket.id} ${row.ticket.title}`}
          onPress={() => toggle(row.ticket.id)}
        />
      ))}
      <ActionButton
        label={
          triageSkill
            ? t('overview.mobile.tickets.triageMany', 'Triage {{count}}', { count: chosen.length })
            : t('overview.mobile.tickets.triageLaunchMany', 'Launch {{count}} anyway…', {
                count: chosen.length
              })
        }
        disabled={chosen.length === 0}
        onPress={go}
      />
    </View>
  )
}
