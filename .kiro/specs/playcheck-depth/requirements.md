# Requirements Document

## Introduction

This spec adds three things to the playcheck app: a tool door entry for the runner, a small tool server that tells the agent when the kit has a new commit and gives it the kit's proof replays, and the README text for both. It builds on `.kiro/specs/playcheck-crew-app/`.

Sources read for this spec, on 2026-11-20:
- The Crew pages `https://kiro.dev/docs/crew/apps/manifest.md` and `https://kiro.dev/docs/crew/apps/build-first-app.md` (fetched, nothing saved), and the saved `crew_apps.md`.
- In the kit repository (read only, branch `kiro-breadth`): `proofs/runner/index.json`, `proofs/runner/r01.json` to `r06.json`, `proofs/garden/g01.json`, `docs/tool-door.md`, `docs/kiro-log.md`.
- `https://modelcontextprotocol.io/specification/latest/basic/transports`: stdio is newline delimited JSON-RPC. That page describes the newest protocol, which has no `initialize` call. The kit's own server answers `initialize`, so this server answers it too, and does not require it before `tools/list` or `tools/call`.

### Manifest fields used

Only these fields of `app.json` are used, all on the manifest page: `name`, `version`, `displayName`, `description`, `author`, `license`, `minKiroCrewVersion`, `tags`, `agents`, `skills`, `mcpServers` (`command`, `args`), `crons` (`name`, `cron_expr`, `agent`, `enabled`, `message`), `dependencies.commands`, `permissions.cron`. Agent file fields: `name`, `model`, `description`, `prompt`, `tools`. Skill front matter: `name`, `description`, `triggers`, `always`. No field is added by this spec.

Two things are not on the pages and stay open until the owner runs Crew: whether Crew sets the environment variable `KIROCREW_APP_DATA` for a tool server (the manifest page names the data folder `<data home>/apps/<name>/data/` and no variable), and whether the agent `tools` form `@playcheck:<server>` works for a second and third server. The first is read by the server only when set, with a temp folder fallback. The second form is the one task 5 of the first spec recorded as working for `playcheck-garden`.

### Differences from the steering files

The steering files describe the first version. This spec changes three of their lines, by the owner's request. The files are not edited by this spec, and the owner decides whether to amend them.
- `product.md` and `kit-boundary.md` say the only file a run may write is a saved replay. Now a run may also write one state file outside the game folder, through `mark_checked`.
- `kit-boundary.md` says the app calls only the five game tools and starts only the kit's built server. Now the app also runs its own `tools/commit-watch.mjs`, which runs `git` on the kit folder and reads `proofs/` there. It writes nothing in the kit.
- The old requirement 5.3 says the skill names no action text of one game. The runner section now names `none` and `jump` and the first actions of each course, because the owner asked for them from the kit's files.

## Requirements

### Requirement 1: Runner entry
**User Story:** As a game maker, I want the agent to play the runner as well as the garden puzzle.

#### Acceptance Criteria
1. `app.json` SHALL have a second `mcpServers` entry `playcheck-runner` with `command` `node` and `args` `["<KIT_REPO>/kit/mcp/dist/server.js", "--game", "<KIT_REPO>/apps/runner"]`.
2. The agent `tools` SHALL hold `@playcheck:playcheck-runner`.
3. The skill SHALL say how a tick game differs, with the runner's level ids and the first actions of each course, taken from the kit's files and not guessed.
4. The checker SHALL fail when an agent tool of the form `@playcheck:<server>` names a server that `mcpServers` does not declare, or when a declared server is not in the agent tools.

### Requirement 2: Commit watch server
**User Story:** As a game maker, I want the agent to play the kit's proofs on each new commit.

#### Acceptance Criteria
1. `tools/commit-watch.mjs` SHALL be plain Node with no package. It SHALL speak newline delimited JSON-RPC 2.0 on standard input and output: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, and an error for any other request.
2. It SHALL take the kit folder as its first argument and an optional `--state <folder>`. A missing argument or a folder that does not exist SHALL give one line on standard error that starts with `commit-watch: ` and exit code 1.
3. `kit_commit` SHALL return `hash` (40 characters), `subject`, `stored` (the hash from `mark_checked`, or null) and `changed` (true when `stored` is null or differs). It SHALL use `git -C <folder> rev-parse HEAD` and `git -C <folder> log -1`.
4. `kit_proof` with `game` and `level` SHALL return the `replay` object of `<kit>/proofs/<game>/<level>.json`. With `game` only it SHALL return the level ids found there.
5. `mark_checked` with `hash` and `result` SHALL write the state file and return what it wrote.
6. The state folder SHALL be `--state` when given, else `KIROCREW_APP_DATA` when set and not empty, else the operating system temp folder. The state file is `playcheck-commit-state.json`. The server SHALL write no other file and run no command but `git`.
7. A `game` or `level` that is not made only of letters, digits and hyphens SHALL be refused with an error answer, and no file SHALL be read for it.
8. A failed tool call SHALL return a result with `isError` true and a text that says why. It SHALL NOT end the server.

### Requirement 3: Job, agent and skill
**User Story:** As a game maker, I want the nightly job to skip a night with no new commit.

#### Acceptance Criteria
1. `app.json` SHALL have a third entry `playcheck-commits` with `command` `node` and `args` `["<APP_DIR>/tools/commit-watch.mjs", "<KIT_REPO>"]`. The manifest page says `mcpServers` paths are not app-relative, so the script path is absolute, and `<APP_DIR>` is a placeholder the user replaces like `<KIT_REPO>`. `--strict` SHALL fail while either is present.
2. The agent `tools` SHALL hold the tools of the three servers and no file or shell tool.
3. The `nightly-play` message SHALL follow the owner's steps: `kit_commit` first; `changed` false gives the report `no new commit` with the hash and stops; `changed` true replays every level of both games with `kit_proof` and the game's `replay` tool and reports each final hash against `finalHash`, plays garden `g01` and runner `r01` by hand, reports as before, and ends with `mark_checked`.
4. The job SHALL stay `"enabled": false`.
5. The agent prompt and the skill SHALL describe the three new tools and the new report.

### Requirement 4: Tests
1. `tools/commit-watch.test.mjs` SHALL start the server as a child process on a throwaway git repository in a temp folder (two commits, a `proofs` folder) and check every tool answer, a refused name, a missing folder and the state file.
2. `npm test` SHALL run both test files, and `npm run verify` SHALL exit 0.

### Requirement 5: README
1. The README SHALL describe only what the files prove, say nothing about an install route that was not tried, and not say that the new nightly job ran.

### Requirement 6: State folder (added after the first Crew runs of 2026-11-20)
**User Story:** As a game maker, I want the stored commit to survive from one run to the next.

#### Acceptance Criteria
1. Crew gave each run a new temp folder, and the state file was lost between runs 2 and 3. `app.json` SHALL give `playcheck-commits` the arguments `--state` and `<APP_DIR>/data`. The checker SHALL fail an entry without `--state`, and strict mode SHALL fail a state folder that is not `data` in the app folder.
2. Two server processes started one after the other with the same `--state` folder SHALL share the stored hash. A state folder that does not exist SHALL be created by `mark_checked`.
3. The README SHALL not tell the reader to rely on `KIROCREW_APP_DATA` or the temp folder. The server MAY keep both as the fallback of a bare run. The version SHALL be `0.2.1` and the job SHALL stay `"enabled": false`.

### Requirement 7: README from the runs
1. "Install and enable", "The nightly job" and "A real run" SHALL state only what the runs of 2026-11-20 showed, with the result text of run 2 copied from `docs/crew-runs-2026-11-20.md`. The dashboard route SHALL be said to be not tried. The fix of 0.2.1 SHALL be said to be not yet run on Crew.
