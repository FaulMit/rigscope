# Changelog

## 1.0.0 - 2026-04-18

RigScope 1.0 is the first public-ready desktop release line.

### Added

- Cross-platform release packages for Windows x64/x86/ARM64, Linux x64/ARM64, and macOS universal builds.
- Packaged desktop auto-update flow backed by GitHub Releases metadata.
- MIT license for public distribution and contribution.
- Native runner profiles for allowlisted external tools with explicit acknowledgement, duration caps, process tracking, and stop control.
- Local-first community score workflow with reduced public setup cards and optional scoreboard backend.

### Hardened

- Local server remains bound to `127.0.0.1`.
- Static file serving is constrained to `public/`.
- Renderer values are normalized before display.
- Defensive browser headers are enabled.
- GitHub tokens are accepted only through backend environment variables, never the browser UI.

### Known Limits

- Windows and macOS builds are unsigned unless signing secrets are configured in GitHub Actions.
- Native stress runners depend on installed third-party tools and remain opt-in.
- The GitHub/Gist score sync path is suitable for lightweight sharing, not anti-cheat. Use the scoreboard backend for stronger submission controls.
- Public auto-update requires public GitHub Releases or another publicly reachable update feed.
