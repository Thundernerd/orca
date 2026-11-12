import { useLocalSearchParams } from 'expo-router'
import { MobileWebShellScreen } from '../../../src/mobile-web-shell/MobileWebShellScreen'
import {
  shellScreenRoute,
  shellScreenRouteKey
} from '../../../src/mobile-web-shell/shell-screen-route'
import { PageRouteUnavailableScreen } from '../../../src/mobile-web-shell/PageRouteUnavailableScreen'
import { firstParam } from '../../../src/navigation/route-param-reader'

export default function MobileOverviewRoute() {
  const params = useLocalSearchParams<{ hostId?: string | string[] }>()
  const hostId = firstParam(params.hostId)
  const route = hostId
    ? shellScreenRoute({ pathname: `/h/${encodeURIComponent(hostId)}/overview` })
    : null
  if (!route) {
    return <PageRouteUnavailableScreen hostId={hostId} />
  }
  return <MobileWebShellScreen key={shellScreenRouteKey(route)} hostId={hostId} route={route} />
}
