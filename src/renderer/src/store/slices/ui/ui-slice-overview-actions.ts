import type { UISlice, UISliceSet } from './ui-slice-contract'
import { EMPTY_OVERVIEW_PREFS } from '../../../../../shared/overview-prefs'

/** Overview page prefs; every update persists the whole record. */
export function createOverviewPreferenceActions(set: UISliceSet): Partial<UISlice> {
  return {
    overviewPrefs: EMPTY_OVERVIEW_PREFS,
    updateOverviewPrefs: (update) =>
      set((state) => {
        const overviewPrefs = update(state.overviewPrefs)
        window.api.ui.set({ overviewPrefs }).catch(console.error)
        return { overviewPrefs }
      })
  }
}
