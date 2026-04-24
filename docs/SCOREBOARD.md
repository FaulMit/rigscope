# RigScope Scoreboard Backend

RigScope can use a real scoreboard service instead of the GitHub gist MVP.

## Recommended Online Backend: Cloudflare Workers + D1

This keeps the community leaderboard online without a VPS. Cloudflare hosts the HTTP API, and D1 stores public setup cards.

1. Install/login to Wrangler:

```powershell
npx wrangler@latest login
```

2. Create the D1 database:

```powershell
npx wrangler@latest d1 create rigscope-scoreboard
```

3. Copy the config template and paste the `database_id` from the previous command:

```powershell
copy scoreboard\cloudflare\wrangler.toml.example scoreboard\cloudflare\wrangler.toml
notepad scoreboard\cloudflare\wrangler.toml
```

4. Create the database tables:

```powershell
npm run scoreboard:cf:migrate
```

5. Deploy the Worker:

```powershell
npm run scoreboard:cf:deploy
```

6. Point RigScope at the deployed Worker:

```powershell
$env:RIGSCOPE_SCOREBOARD_URL="https://rigscope-scoreboard.faulmit.workers.dev"
npm start
```

The Cloudflare Worker uses the same API as the local scoreboard server, so the app does not need a separate community-sync mode. RigScope defaults to the hosted `https://rigscope-scoreboard.faulmit.workers.dev` service; `RIGSCOPE_SCOREBOARD_URL` is only needed when testing a different scoreboard.

Optional local Worker test after creating `wrangler.toml`:

```powershell
npm run scoreboard:cf:migrate:local
npm run scoreboard:cf:dev
```

## Start Locally

```powershell
npm run scoreboard
```

Default URL:

```text
http://127.0.0.1:8797
```

Point the app server at it:

```powershell
$env:RIGSCOPE_SCOREBOARD_URL="http://127.0.0.1:8797"
npm start
```

## API

- `POST /api/v1/challenge` returns a short-lived nonce.
- `POST /api/v1/submissions` accepts `{ nonce, profile }`, validates the nonce, normalizes the public score card, calculates the server-side public record, and stores it.
- `GET /api/v1/leaderboard?limit=100` returns ranked public profiles.
- `GET /api/v1/setups/:id` returns one public setup profile.
- `GET /api/v1/health` returns service health.

## Current Anti-Abuse Layer

- short-lived challenge nonce
- per-IP rate limit
- server-side normalization and score bounds
- public reduced profile only
- raw IP is not stored; submissions store an IP hash
- bounded JSON body size

This is stronger than GitHub/gist sync, but it is not full anti-cheat. A production leaderboard should add signed benchmark attestations, account identity, moderation, replay detection, and server-side anomaly scoring.

## Data

By default data is stored in:

```text
~/.rigscope-scoreboard/scoreboard.json
```

Override:

```powershell
$env:RIGSCOPE_SCOREBOARD_DATA="D:\rigscope-scoreboard"
```

The Cloudflare backend schema lives in `scoreboard/cloudflare/schema.sql`. The local JSON backend remains useful for offline testing and development.
