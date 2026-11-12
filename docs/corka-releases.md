# Corka releases

Corka is this fork's build of Orca. It ships from the `mine` branch. `main` mirrors `upstream/main`.

## Keeping up with upstream

```sh
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout mine && git merge main
```

## Versions

A Corka version is the upstream version with a build counter folded into the patch number:
`patch × 100 + build`. That keeps it valid semver and always above the previous release, across upstream bumps.

| Upstream (`package.json` / `mobile/app.json`) | Corka build | Tag                        |
| --------------------------------------------- | ----------- | -------------------------- |
| desktop `1.4.214`                             | 1           | `v1.4.21401`               |
| desktop `1.4.214`                             | 2           | `v1.4.21402`               |
| desktop `1.4.215`                             | 1           | `v1.4.21501`               |
| phone `0.0.64`                                | 1           | `mobile-android-v0.0.6401` |

Pushing a tag on `mine` starts the build. The workflow refuses a tag that doesn't match the upstream version.

- `v*` runs `.github/workflows/corka-desktop-release.yml`. It builds the macOS arm64 dmg/zip and the Linux x64 AppImage/deb, then publishes the release.
- `mobile-android-v*` runs `.github/workflows/corka-android-release.yml`. It builds the signed APK and publishes a prerelease. Upstream's `mobile-android-release.yml` listens to the same tags, so `mine` limits its build job to `stablyai/orca`. Keep that `if:` when an upstream merge conflicts there.

## Updates

- **Desktop:** reads releases from `APP_RELEASE_REPO` (`src/shared/release-channel.ts`).
  - **macOS:** each build is signed with the same self-signed certificate, so updates install in place. The first install needs right-click → Open, because Gatekeeper doesn't know the certificate.
  - **Linux:** the AppImage updates itself. A `.deb` install is told about new versions only.
- **Phone:** checks `CORKA_RELEASE_REPO` (`mobile/src/app-update/corka-release-repo.ts`) and opens the release page; you install the APK from there.

## Signing keys (back these up)

They live outside the repo in `~/.corka-signing/`. Losing a key means a new key, and every existing install has to be reinstalled by hand.

| Secret / variable                                             | Source                                         |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `CORKA_MAC_CERT_P12`                                          | `base64 -i corka-mac.p12`                      |
| `CORKA_MAC_CERT_PASSWORD`                                     | `corka-mac.p12.password`                       |
| `ORCA_ANDROID_KEYSTORE_BASE64`                                | `base64 -i corka-android.p12`                  |
| `ORCA_ANDROID_KEYSTORE_PASSWORD`, `ORCA_ANDROID_KEY_PASSWORD` | `corka-android.p12.password`                   |
| `ORCA_ANDROID_KEY_ALIAS`                                      | `corka`                                        |
| `ORCA_ANDROID_RELEASE_CERT_SHA256` (variable)                 | `keytool -list -v -keystore corka-android.p12` |
