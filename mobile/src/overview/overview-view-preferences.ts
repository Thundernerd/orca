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

const NEEDS_YOU_FOLDED_KEY = 'orca:overviewNeedsYouFolded'

export async function loadNeedsYouFolded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NEEDS_YOU_FOLDED_KEY)) === '1'
  } catch {
    return false
  }
}

export async function saveNeedsYouFolded(folded: boolean): Promise<void> {
  await AsyncStorage.setItem(NEEDS_YOU_FOLDED_KEY, folded ? '1' : '0')
}

/** Pinned and hidden projects live on the phone; the desktop keeps its own. */
export type OverviewProjectList = 'pinned' | 'hidden'

const projectListKey = (list: OverviewProjectList): string =>
  list === 'pinned' ? 'orca:overviewPinned' : 'orca:overviewHidden'

export async function loadOverviewProjectList(list: OverviewProjectList): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(projectListKey(list))) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export async function saveOverviewProjectList(
  list: OverviewProjectList,
  ids: readonly string[]
): Promise<void> {
  await AsyncStorage.setItem(projectListKey(list), JSON.stringify(ids))
}
