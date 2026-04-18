# Release and Signing

RigScope desktop packages are built with `electron-builder`. The GitHub Actions release workflow builds installer-style and portable packages for the supported desktop architectures:

- Windows x64, x86/ia32, and ARM64: portable `.exe` and NSIS installer
- Linux x64 and ARM64: AppImage, `.deb`, and `.tar.gz`
- macOS universal: DMG and ZIP for Intel and Apple Silicon

The simplest Windows install path is the NSIS setup executable: `RigScope-Setup-<version>-<arch>.exe`. The no-install path is `RigScope-Portable-<version>-<arch>.exe`.

32-bit desktop support is Windows-only. Modern macOS has no 32-bit app support, and Electron desktop Linux builds are treated as x64/ARM64 only.

The workflow always uploads build artifacts. When a tag matching `v*` is pushed, it also attaches the generated files to a GitHub Release.

## Local release build

Install dependencies:

```powershell
npm ci
```

Build for the current platform:

```powershell
npm run dist
```

Or build one platform-specific target:

```powershell
npm run dist:win
npm run dist:win:x64
npm run dist:win:ia32
npm run dist:win:arm64
npm run dist:linux
npm run dist:linux:x64
npm run dist:linux:arm64
npm run dist:mac
npm run dist:mac:universal
```

Build output is written to `release/`.

## GitHub Actions release

Manual build:

1. Open the `Release Builds` workflow in GitHub Actions.
2. Run it with `workflow_dispatch`.
3. Download the uploaded `rigscope-*` artifacts.

Tagged release:

```bash
git tag v0.3.6
git push origin v0.3.6
```

The tag build uploads artifacts and publishes them as GitHub Release assets.

## Secrets

Do not commit certificates, private keys, app-specific passwords, or notarization credentials. Configure them as repository or organization secrets in GitHub.

### Windows code signing

The workflow supports either of these patterns:

- `WINDOWS_CERTIFICATE_BASE64`: base64-encoded `.pfx` certificate
- `WINDOWS_CERTIFICATE_PASSWORD`: password for that `.pfx`

The workflow decodes the certificate into the runner temp directory and exposes it to `electron-builder` as `CSC_LINK` and `CSC_KEY_PASSWORD` for the Windows build. It also sets the Windows-specific `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` variables for compatibility.

If the certificate is already stored somewhere accessible by `electron-builder`, configure these Windows-only secrets directly instead:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Windows builds still run without these secrets, but the generated installer and portable executable are unsigned.

### macOS signing and notarization

For signing, configure:

- `CSC_LINK`: Developer ID Application certificate, usually a base64 certificate or secure URL supported by `electron-builder`
- `CSC_KEY_PASSWORD`: certificate password

For notarization, configure placeholders expected by `electron-builder` tooling:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

The project currently defines macOS DMG and ZIP targets in `package.json`. Signing and notarization are active only when the certificate and Apple credentials are present in GitHub Secrets.

### Linux packages

Linux AppImage, `.deb`, and `.tar.gz` packages are built unsigned by default. Add package signing later only if the distribution channel requires it.

## Release checklist

1. Update `version` in `package.json`.
2. Run a local smoke test with `npm start` or `npm run desktop`.
3. Run the GitHub Actions workflow manually once before tagging when signing secrets change.
4. Push a `v*` tag for the release.
5. Download and install the artifacts on Windows, Linux, and macOS before announcing the release.
