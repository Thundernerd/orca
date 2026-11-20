import { useMemo } from 'react'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import { selectEphemeralVmHostLifecycles } from '@/store/slices/ephemeral-vm/ephemeral-vm-lifecycle'
import { translateHostDisplayLabel } from '@/components/sidebar/execution-host-label'
import { buildExecutionHostRegistry } from '../../../../shared/execution-host/execution-host-registry'
import { getHostDisplayLabelOverrides } from '../../../../shared/execution-host/host-setting-overrides'
import type { OverviewHostLabels } from './overview-store-inputs'

/**
 * Each host's display name, for the hosts the Overview's projects live on. It builds the host
 * registry without the Active Server: that setting only adds a server no project lives on, which
 * the Overview never names, so the labels route by each project's own host.
 */
export function useOverviewHostLabels(): OverviewHostLabels {
  const t = useTranslate()
  const repos = useAppStore((s) => s.repos)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const settings = useAppStore((s) => s.settings)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const ephemeralVmHosts = useAppStore(selectEphemeralVmHostLifecycles)

  return useMemo(() => {
    const hosts = buildExecutionHostRegistry({
      repos,
      settings: null,
      sshTargetLabels,
      sshConnectionStates,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides: getHostDisplayLabelOverrides(settings),
      ephemeralVmHosts
    })
    return new Map(hosts.map((host) => [host.id, translateHostDisplayLabel(host, t)]))
  }, [
    t,
    repos,
    sshTargetLabels,
    sshConnectionStates,
    settings,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId,
    ephemeralVmHosts
  ])
}
