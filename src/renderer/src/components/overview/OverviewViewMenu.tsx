import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import type { OverviewSort } from '../../../../shared/overview/overview-model-types'
import type { OverviewGroupBy } from './overview-project-sections'

/** Sort and grouping for the projects, shared by both layouts. */
export function OverviewViewMenu({
  sort,
  groupBy,
  onSortChange,
  onGroupByChange
}: {
  sort: OverviewSort
  groupBy: OverviewGroupBy
  onSortChange: (sort: OverviewSort) => void
  onGroupByChange: (groupBy: OverviewGroupBy) => void
}): React.JSX.Element {
  const t = useTranslate()
  const label = t('auto.components.overview.view.label', 'Sort and group')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} title={label}>
          <ArrowUpDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t('auto.components.overview.view.sort', 'Sort projects')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => {
            if (value === 'attention' || value === 'name') {
              onSortChange(value)
            }
          }}
        >
          <DropdownMenuRadioItem value="attention">
            {t('auto.components.overview.view.sortAttention', 'Needs you first')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="name">
            {t('auto.components.overview.view.sortName', 'Name')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {t('auto.components.overview.view.group', 'Group projects')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={groupBy}
          onValueChange={(value) => {
            if (value === 'none' || value === 'group') {
              onGroupByChange(value)
            }
          }}
        >
          <DropdownMenuRadioItem value="none">
            {t('auto.components.overview.view.groupNone', 'No grouping')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="group">
            {t('auto.components.overview.view.groupProjectGroup', 'By project group')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
