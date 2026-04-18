# RigScope

RigScope is a local cross-platform hardware inventory, diagnostics, benchmark, and stress-test dashboard. It runs a small server on `127.0.0.1`, opens a modern UI in the browser or an Electron desktop shell, and keeps telemetry local-first.

It is designed as one place for the jobs people usually split across AIDA64, CPU-Z, GPU-Z, hardware monitors, benchmark utilities, and stress-test launchers: motherboard, BIOS, CPU, memory slots, GPU, physical disks, volumes, network adapters, OS state, device inventory, recent system signals, integration status, reports, and quick local tests.

## Quick Start

```powershell
npm install
npm start
```

Then open:

```text
http://127.0.0.1:8787
```

For a more app-like window:

```powershell
npm run app
```

Or double-click:

```text
start-app-mode.cmd
```

For the packaged desktop shell:

```powershell
npm run desktop
```

## Requirements

- Windows 10/11, Linux, or macOS
- Node.js 20+
- PowerShell is used only for the rich Windows inventory path.
- Linux and macOS use portable Node.js, `df`, `ps`, `ping`, and platform tools such as `system_profiler`, `lspci`, and `nvidia-smi` when present.
- NVIDIA GPU support is optional. If `nvidia-smi` is available, RigScope shows live NVIDIA telemetry on supported platforms.
- Optional external tools can be detected as integrations: y-cruncher, MemTest86, FurMark, OCCT, HWiNFO, LibreHardwareMonitor, CrystalDiskInfo, and Prime95.

## Privacy

RigScope is local-first. It does not send telemetry anywhere. The server binds to `127.0.0.1` only.

Some identifiers such as MAC addresses are partially masked in the UI. Exported reports are intended for local use; review them before sharing publicly.

## Current Sections

- Overview
- Suite
- CPU
- Motherboard / BIOS
- Memory
- GPU
- Storage
- Network
- Devices
- Lab
- Windows
- Reliability
- Processes

## Current Lab Scope

- Safe CPU quick benchmark through the local Node runtime.
- Safe memory throughput benchmark through the local Node runtime.
- Safe browser GPU render benchmark in the Lab UI.
- Quick sensor sweep for CPU load, memory pressure, and NVIDIA telemetry when available.
- Unified explicit-start stress runner API with server-side CPU worker processes, bounded RAM allocation pressure, WebGL GPU render loop, sensor polling, live progress, stop control, and a stability score.
- Opt-in native stress runner profiles for OCCT, FurMark, Prime95/mprime, and y-cruncher with detection, visible process tracking, duration caps, stop control, and explicit launch acknowledgement.
- RigScore combines completed CPU, RAM, GPU, and sensor checks into a comparable local score.
- Community prototype for setup profiles, local profile export, leaderboard cards, and head-to-head comparison.
- Advanced CPU telemetry with per-logical-thread load, effective performance, and frequency.
- Integration discovery for future CPU, memory, GPU, storage, and sensor bridges.
- JSON report export through `/api/export`.
- Native bridge discovery through `/api/bridges` for AIDA64, OCCT, FurMark, MemTest86, HWiNFO, LibreHardwareMonitor, lm-sensors, smartctl, powermetrics, y-cruncher, Prime95/mprime, CPU-Z, GPU-Z, and NVIDIA SMI.

Stress tests are not auto-started. RigScope only runs them after explicit user action and keeps a visible stop control active during the run.

## Desktop Builds

Install dependencies once:

```powershell
npm install
```

Create an unpacked portable development build:

```powershell
npm run pack
```

Create Windows portable EXE and installer:

```powershell
npm run dist:win
```

Create Linux AppImage, `.deb`, and `.tar.gz` packages:

```bash
npm run dist:linux
```

Create macOS DMG and ZIP packages:

```bash
npm run dist:mac
```

Build output is written to:

```text
release/
```

Cross-building has platform limits. Windows installers are best built on Windows, Linux packages on Linux, and macOS DMG/ZIP on macOS. The app code is shared; the native package formats are OS-specific.

Release automation, signing secrets, and notarization placeholders are documented in [docs/RELEASE.md](docs/RELEASE.md).

## Platform Coverage

Windows currently has the richest inventory through PowerShell/CIM/WMI. Linux and macOS use a portable compatibility layer so the dashboard, stress tests, reports, and core inventory open cleanly across desktop platforms. Native sensors can be deepened per OS by adding bridges for tools like HWiNFO, LibreHardwareMonitor, lm-sensors, smartmontools, `powermetrics`, OCCT, FurMark, y-cruncher, and MemTest86.

## Useful Scripts

```powershell
npm start       # local server only
npm run open    # server + default browser
npm run app     # server + browser app window when supported
```
