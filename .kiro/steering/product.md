---
inclusion: always
---
# Product

## What this repository is
One app for Kiro Crew. A Crew agent plays a game built with the kit through the kit's tool door and reports what it saw. The app has one agent, one skill, one tool door entry and one scheduled job that ships switched off.

## Who it is for
Solo developers and small studios with nobody to test a build.

## Where the app format comes from
Only these pages define it:
- https://kiro.dev/docs/crew/apps
- https://kiro.dev/docs/crew/apps/manifest
- https://kiro.dev/docs/crew/apps/build-first-app

Read them again before each task. Do not use a field that is not on them.

## What the kit gives the app
- A tool door: five MCP tools (`new_game`, `act`, `observe`, `render`, `replay`) started with `node kit/mcp/dist/server.js --game <game folder>`.
- A game folder that holds `dist/def.js`. The tool door fails to start without it.
- A replay: seed plus actions. The `replay` tool with `save` true writes one file in the game folder under `tests/replays/`.

## Words
- Say "the kit", "the garden puzzle" and "the runner" in documents. The app's own name is `playcheck`.
- Write plain short sentences. No sales words.

## Limits that always hold
- The app has no account, no login and no personal data.
- The agent runs on the user's own Kiro credits. The README says so.
- The scheduled job ships with `"enabled": false`. Kiro never switches it on.
- The app never edits a game. The only file a run may write is a saved replay.
- Every file in the repository is original work made for it.
- The version stays below 1.0.
