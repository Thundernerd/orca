import { Pressable, Text, View } from 'react-native'
import { Check, Circle } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { overviewStyles as styles } from './mobile-overview-styles'

/** A checkbox row: a ticket, workspace or PR the sheet can act on. */
export function Toggle({
  checked,
  label,
  meta,
  disabled,
  onPress
}: {
  checked: boolean
  label: string
  meta?: string
  disabled?: boolean
  onPress: () => void
}) {
  const Icon = checked ? Check : Circle
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.workspaceRow, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Icon size={16} color={disabled ? colors.textSecondary : colors.textPrimary} />
        <View style={styles.grow}>
          <Text style={styles.text} numberOfLines={2}>
            {label}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </View>
    </Pressable>
  )
}

/** Selects every row that can go, or none once all are selected. */
export function SelectAllToggle({
  ids,
  selected,
  onChange
}: {
  ids: readonly string[]
  selected: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}) {
  const t = useMobileTranslation()
  if (ids.length < 2) {
    return null
  }
  const all = selected.size === ids.length
  return (
    <Toggle
      checked={all}
      label={
        all
          ? t('overview.mobile.tickets.deselectAll', 'Deselect all')
          : t('overview.mobile.tickets.selectAll', 'Select all')
      }
      meta={t('overview.mobile.tickets.selectedCount', '{{count}} of {{total}} selected', {
        count: selected.size,
        total: ids.length
      })}
      onPress={() => onChange(new Set(all ? [] : ids))}
    />
  )
}

export function ActionButton({
  label,
  disabled,
  onPress
}: {
  label: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}
