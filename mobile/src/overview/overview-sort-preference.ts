import AsyncStorage from '@react-native-async-storage/async-storage'
import type { OverviewSort } from '../../../src/shared/overview/overview-model-types'

const OVERVIEW_SORT_KEY = 'orca:overviewSort'

export async function loadOverviewSort(): Promise<OverviewSort> {
  try {
    const raw = await AsyncStorage.getItem(OVERVIEW_SORT_KEY)
    return raw === 'name' ? 'name' : 'attention'
  } catch {
    return 'attention'
  }
}

export async function saveOverviewSort(sort: OverviewSort): Promise<void> {
  await AsyncStorage.setItem(OVERVIEW_SORT_KEY, sort)
}
