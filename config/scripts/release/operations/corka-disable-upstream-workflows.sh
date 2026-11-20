#!/usr/bin/env bash
# Disable the upstream workflows that Corka doesn't need, so their schedules stop failing on this fork.
# Disabling is repo-wide and reversible: pass --enable to turn the same list back on.
# Usage: bash config/scripts/release/operations/corka-disable-upstream-workflows.sh [--dry-run] [--enable]
set -euo pipefail

REPO="${CORKA_REPO:-Thundernerd/orca}"
ACTION="disable"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --enable) ACTION="enable" ;;
    *)
      echo "error: unknown argument $arg" >&2
      exit 1
      ;;
  esac
done

# Kept on purpose: corka-desktop-release, corka-android-release, pr, unit-tests, mobile,
# release-javascript, pr-test-loc, ci-closed-pr-caches, ci-branch-cache-sweep.
WORKFLOWS=(
  # Scheduled and failing on main.
  node-next-compat.yml
  performance-contracts.yml
  computer-macos-native.yml
  ci-cache-warmup.yml
  ci-cache-warmup-platforms.yml
  ci-xterm-cache.yml
  node-server-tests.yml
  ci-runner-demand.yml
  # Upstream release, distribution and bots.
  release-cut.yml
  release-mac-build.yml
  release-mirror-r2.yml
  mobile-android-release.yml
  hourly-mac-build.yml
  daily-mac-build.yml
  adhoc-mac-build.yml
  dev-channel-win-build.yml
  readme-downloads-badge.yml
  issue-os-labeler.yaml
  docs.yml
  # Platforms and suites Corka doesn't ship: cloud, headless server, Windows, upstream benchmarks.
  cloud-verify.yml
  orca-server-artifact.yml
  macos-updater-tests.yml
  computer-e2e.yml
  computer-task-benchmark.yml
  git-command-termination-runtime.yml
  layout-owner-e2e.yml
  packaged-browser-e2e.yml
  preflight-cli-platforms.yml
  ssh-hostile-hosts.yml
  ssh-windows-hosts.yml
  win-orcad-serve-switch-e2e.yml
  windows-browser-focus-e2e.yml
  wsl-orcad-e2e-frozen-runner-retry.yml
  wsl-orcad-e2e.yml
  zcode-transcript-contract.yml
  main-blocking-work.yml
  # Last: PR Checks also calls these two with `uses:`. If its runs then fail, re-enable them.
  e2e.yml
  terminal-ime-e2e.yml
)

if [[ "$DRY_RUN" == 0 ]]; then
  command -v gh >/dev/null 2>&1 || { echo "error: gh CLI not found. See https://cli.github.com" >&2; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "error: not logged in. Run: gh auth login" >&2; exit 1; }
fi

failed=0
for workflow in "${WORKFLOWS[@]}"; do
  if [[ "$DRY_RUN" == 1 ]]; then
    echo "would $ACTION $workflow"
  elif gh api -X PUT "repos/$REPO/actions/workflows/$workflow/$ACTION" >/dev/null; then
    echo "${ACTION}d $workflow"
  else
    echo "failed to $ACTION $workflow" >&2
    failed=1
  fi
done

exit "$failed"
