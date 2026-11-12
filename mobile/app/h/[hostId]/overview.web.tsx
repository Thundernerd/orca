import { MobileOverviewScreen } from '../../../src/overview/MobileOverviewScreen'

// Render screen directly: native sibling imports a shell module that throws in browsers, and manifest imports every route.
export default function MobileOverviewRoute() {
  return <MobileOverviewScreen />
}
