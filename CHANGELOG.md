# Changelog

## 1.0.4 - 2026-04-19

### Fixed

- Fixed packaged desktop benchmark/stress workers launching as a second RigScope app instead of Node by setting `ELECTRON_RUN_AS_NODE=1`.
- Benchmark worker JSON parsing now reports a controlled API error instead of crashing the Electron main process on empty or invalid output.

## 1.0.3 - 2026-04-19

### Fixed

- Fixed a packaged desktop crash when stopping memory stress after the worker IPC channel had already closed.
- Memory stress shutdown now uses the same safe child-process cleanup path as CPU stress.

## 1.0.2 - 2026-04-18

### Fixed

- Packaged desktop builds now automatically check for updates shortly after startup.
- The update status text now makes the idle manual check state visible instead of silently showing only the current version.

## 1.0.1 - 2026-04-18

### Fixed

- Fixed a packaged desktop crash when stopping CPU stress after a worker IPC channel had already closed.
- CPU stress shutdown is now idempotent and ignores already-exited workers while still cleaning up live ones.

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
