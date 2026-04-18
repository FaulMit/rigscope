# RigScope Scoreboard Backend

RigScope can use a real scoreboard service instead of the GitHub gist MVP.

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
