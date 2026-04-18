# RigScope Security Best-Practices Review

Date: 2026-04-18
Scope: local Node server, Electron shell, renderer UI, native stress runner bridge, community score sync.

## Result

RigScope is acceptable for a public 1.0 unsigned desktop release after this pass, with two deployment requirements outside the codebase:

- Configure production code signing for Windows and macOS before advertising the builds as fully trusted production installers.
- Make GitHub Releases or a replacement update feed publicly reachable before relying on in-app updates for public users.

## Fixed In This Pass

- Local server now sends defensive browser headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, and frame denial.
- Static file serving now resolves paths under `public/` and rejects traversal attempts before reading from disk.
- Electron now enforces a single app instance and focuses the existing window on second launch.
- The server now exposes `/api/health` and treats `EADDRINUSE` as a reusable existing RigScope instance instead of crashing.
- Renderer values are normalized before HTML rendering so malformed payloads do not display `[object Object]`, `undefined`, or `null`.
- Community sync stores and publishes only a reduced public score card, not raw machine inventory.
- GitHub write support is backend-only and opt-in through environment variables; no GitHub token is accepted or stored in the browser.
- Native stress runners still require explicit acknowledgement and only execute allowlisted detected tools/profiles.

## Remaining Risks

- Release artifacts are unsigned unless CI secrets/certificates are configured. Windows SmartScreen and macOS Gatekeeper may warn users.
- In-app updates require public release metadata. Private GitHub repositories return `404` for normal users.
- Native tools such as OCCT, FurMark, Prime95, and y-cruncher are intentionally high-load external programs. RigScope limits duration and profiles, but cannot guarantee thermal safety on badly cooled hardware.
- The community leaderboard model is suitable for an MVP, not anti-cheat. Scores can be forged unless a future backend signs submissions or performs server-side validation.
- CSP currently allows inline styles because the UI uses dynamic width/style attributes for meters. This is acceptable for the local app, but a hosted web version should remove inline styles and tighten CSP.

## Release Guidance

- Keep the server bound to `127.0.0.1`.
- Do not expose `/api/native-runners/start` on a LAN or public interface.
- Use GitHub sync only with a low-scope token owned by a bot account or move publishing to a hosted backend.
- Configure signed releases before advertising RigScope as a fully trusted production installer.
- Keep update metadata public and immutable for each tagged release.
