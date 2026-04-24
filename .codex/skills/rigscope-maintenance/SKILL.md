---
name: rigscope-maintenance
description: Maintain RigScope feature, release, README, and GitHub Pages demo consistency. Use when changing RigScope UI, telemetry, benchmarks, stress tests, community sync, release/version metadata, demo behavior, README content, changelog entries, or GitHub Actions so public docs and the static demo stay synchronized with the desktop app.
---

# RigScope Maintenance

## Workflow

1. Inspect the feature change and identify whether it affects public behavior, screenshots/demo behavior, README claims, changelog notes, release packaging, or scoreboard/community behavior.
2. Update `docs/product-manifest.json` for public highlights, demo hardware fixtures, demo community profiles, native demo profiles, or demo copy. Treat this file as the source of truth for README generated blocks and the GitHub Pages demo fixtures.
3. Run `npm run sync:docs` after manifest edits. This updates `README.md` generated sections and `public/demo-fixtures.js`.
4. Keep generated README sections inside their markers:
   - `RIGSCOPE:CURRENT_HIGHLIGHTS`
   - `RIGSCOPE:DEMO_NOTE`
5. Do not edit `public/demo-fixtures.js` by hand. Edit `docs/product-manifest.json`, then run the sync command.
6. If changing app behavior, update `CHANGELOG.md` manually with user-facing changes.
7. Validate with `npm test`, `npm run check:docs`, and `npm run verify`. For frontend or demo changes, also open the local app/demo in the browser and click the affected sections.

## Release Checks

- Ensure `package.json`, `package-lock.json`, `docs/product-manifest.json`, README release badge, and changelog version all describe the same release when preparing a release.
- Ensure the GitHub Pages demo still loads `public/demo-fixtures.js` before `public/demo-api.js`.
- Ensure GitHub Actions still runs generated-doc checks before Pages deploy and release packaging.

## Common Commands

```powershell
npm run sync:docs
npm run check:docs
npm test
npm run verify
```
