import { themedStyleSheet } from '../theme/themed-styles'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const overviewStyles = themedStyleSheet(() => ({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm
  },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  tier: { gap: spacing.md },
  tierTitle: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.surface,
    backgroundColor: colors.bgPanel,
    padding: spacing.md,
    gap: spacing.sm
  },
  cardHidden: { opacity: 0.6 },
  cardUrgent: { borderColor: colors.statusRed },
  cardReady: { borderColor: colors.statusGreen },
  cardFlagged: { borderColor: colors.statusAmber },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  text: { color: colors.textPrimary, fontSize: typography.bodySize, lineHeight: 20 },
  meta: { color: colors.textSecondary, fontSize: typography.metaSize, lineHeight: 17 },
  metaLabel: { color: colors.textPrimary },
  danger: { color: colors.statusRed },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  chipText: { fontSize: typography.metaSize, fontWeight: '500' },
  chipUrgent: { borderColor: colors.statusRed },
  chipUrgentText: { color: colors.statusRed },
  chipReady: { borderColor: colors.statusGreen },
  chipReadyText: { color: colors.statusGreen },
  chipFlagged: { borderColor: colors.statusAmber },
  chipFlaggedText: { color: colors.statusAmber },
  chipNeutral: { borderColor: colors.borderSubtle },
  chipNeutralText: { color: colors.textSecondary },
  button: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  buttonText: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '500' },
  iconButton: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  linkButton: { minHeight: 36, justifyContent: 'center' },
  linkText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '500' },
  notice: {
    borderRadius: radii.surface,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  noticeOk: { borderColor: colors.statusGreen },
  noticeError: { borderColor: colors.statusRed },
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle
  },
  pressed: { opacity: 0.6 },
  empty: { color: colors.textSecondary, fontSize: typography.bodySize, paddingVertical: spacing.sm }
}))
