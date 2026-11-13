import { useTranslate } from '@/i18n/use-translate'
import type { OverviewProjectSection } from './overview-project-sections'
import type { OverviewProjectTierKey } from '../../../../shared/overview/overview-project-tiers'

export type OverviewSectionedTier = {
  key: OverviewProjectTierKey
  sections: OverviewProjectSection[]
}

/** One block per tier; a lone regular tier stays unlabelled so the default view is unchanged. */
export function OverviewProjectTierList({
  tiers,
  renderTier
}: {
  tiers: readonly OverviewSectionedTier[]
  renderTier: (sections: OverviewProjectSection[]) => React.ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  const labels: Record<OverviewProjectTierKey, string> = {
    pinned: t('auto.components.overview.tiers.pinned', 'Pinned'),
    regular: t('auto.components.overview.tiers.regular', 'Projects'),
    hidden: t('auto.components.overview.tiers.hidden', 'Hidden')
  }
  const labelled = tiers.some((tier) => tier.key !== 'regular')
  return (
    <>
      {tiers.map((tier) => (
        <section key={tier.key} aria-label={labels[tier.key]} className="flex flex-col gap-2">
          {labelled ? <h2 className="text-sm font-semibold">{labels[tier.key]}</h2> : null}
          {renderTier(tier.sections)}
        </section>
      ))}
    </>
  )
}
