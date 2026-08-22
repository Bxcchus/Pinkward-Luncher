# Pinkward Desktop Companion

Electron + React + TypeScript companion for the Pinkward matchmaking lifecycle.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Set `VITE_DEMO_MODE=true` or enable **Simulation mode** on the login screen to exercise the complete flow without a backend:

`Play → Searching → Ready Check → Creating Match → Joining Lobby → Validation → Champion Select → In Game → Post Game → Play Again`

`Play Again` keeps Primary/Secondary roles and immediately rejoins the queue.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8080` | REST API base URL |
| `VITE_WS_URL` | `ws://localhost:8080/ws` | Typed lifecycle WebSocket |
| `VITE_DEMO_MODE` | `false` | Start with local simulation enabled |
| `VITE_HEARTBEAT_INTERVAL_MS` | `5000` | Companion heartbeat interval |
| `VITE_READY_CHECK_SECONDS` | `20` | Ready check UI countdown |
| `W3C_LEAGUE_PATH` | common Windows path | Optional explicit `LeagueClient.exe` path |

## League adapter safety

The Electron main process owns the only `LeagueClientAdapter` implementation. It currently:

- safely checks the running process, Riot's local installation manifest, and
  known/configured `LeagueClient.exe` locations;
- reads the running client's lockfile in memory without exposing its password
  to the renderer or logs;
- authenticates only to the loopback LCU HTTPS service and checks the live
  `/help` capabilities before issuing a command;
- creates private 5v5 Summoner's Rift lobbies using the queue configuration
  observed from the current client;
- joins by exact lobby name and password, with ambiguity and idempotency guards;
- starts champion select only for a validated custom lobby with ten humans and
  observed 5/5 teams;
- opens the detected executable for manual fallback;
- returns `UNKNOWN`/`UNSUPPORTED` and requests manual fallback whenever the
  current client contract or state cannot be proven safe.

Real lobby creation, a controlled bot-lobby start, and exact match-history
retrieval have been verified against an observed client. The active game ID is
captured during gameflow; after the game, only that exact custom match can emit
an idempotent `GAME_ENDED` report. Ambiguous/no-winner results remain `UNKNOWN`.
Multi-account join and ten-human start validation are still required before
leaving the experimental phase.
The UI always exposes lobby name/password copy actions and **Open League** when
automation is unavailable. There are no host, kick, team move, role change, or
discretionary start controls. Simulation mode is isolated and never calls LCU.

## Quality checks

```powershell
npm run check
```

This runs ESLint, Vitest, renderer/Electron typechecks, and the production build.

Create Windows installer and portable executables with:

```powershell
npm run package:win
```

Artifacts are written to `release-artifacts/` as a Windows installer and a portable executable.
Tagged releases are signed and published by GitHub Actions; see
[`docs/RELEASE.md`](../docs/RELEASE.md). Only the installed NSIS edition uses
automatic updates.

## Backend contract boundary

REST paths are isolated in `src/services/apiClient.ts`; WebSocket DTOs and event mapping are isolated in `src/services/webSocketClient.ts`. This keeps the companion adaptable while the authoritative backend contract evolves.

Every League command is correlated by `commandId` and acknowledged idempotently. `CREATE_LOBBY`, `JOIN_LOBBY`, and `START_GAME` report their exact `SUCCESS`, `FAILED`, `UNSUPPORTED`, or `UNKNOWN` outcome. Only a verified `SUCCESS` emits a success acknowledgement; all other results explicitly request manual fallback and carry a non-secret diagnostic code.
