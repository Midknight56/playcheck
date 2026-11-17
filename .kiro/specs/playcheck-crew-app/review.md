# Spec review before code

Scope: `requirements.md` and `tasks.md` as they were before this review, the three Crew pages, the kit repository (read only), and the steering files.

Method and limits. The pages were fetched again in this session. The kit files were read with the file reader. The shell tool was refused, so no command ran, no directory was listed, and line numbers were counted by hand from the file text. They can be off by one. The date in the log is copied from the kit's rows because the session could not read the clock.

## Fields and commands the Crew pages show

Manifest (`app.json`), from the manifest page:
- Required: `name`, `version`, `displayName`, `description`.
- Optional identity: `author`, `license`, `minKiroCrewVersion`, `tags`, `jobFamilies`.
- Resources: `agents`, `skills`, `sops`, `mcpServers` (entries use `command`, `args`, `url`, `env`).
- Store listing: `repo`, `iconPath`, `screenshots`, `highlights`, `heroImage`, `heroImageDark`, `heroImageDetail`, `heroImageDetailDark`.
- `crons[]`: `name`, `every`, `cron_expr`, `message`, `agent`, `enabled`.
- `ui`: `entry`, `pages[].route`, `label`, `icon`, `iconUrl`, `entryPoint`, `mountFunction`, `sidebar.section`, `sidebar.order`.
- `backend`: `entryPoint`, `port`, `healthCheck`, `routes`, `type`, and `hooks.routes`, `hooks.on_startup`, `hooks.on_shutdown`.
- `permissions`: `api`, `events`, `mcpTools`, `storage`, `cron`, `memory`, `network`, `jobs`.
- `contributes`: `commands[]` (`id`, `title`, `subtitle`, `icon`, `keywords`, `prompt`, `autoSend`, `argument` with `kind`, `placeholder`, `hint`, `hosts`, `patternError`), `sessionControls[]` (`id`, `entryPoint`, `label`, `icon`, `statusPath`), `panelTabs[]` (`id`, `title`, `menuLabel`, `menuDescription`, `icon`, `entry`), `fileMenuItems[]` (`id`, `label`, `icon`, `endpoint`, `surfaces`, `when.extensions`, `when.kinds`).
- `setup`: `onInstall`, `onUninstall`, `onUpdate`, `onEnable`, `onDisable`, `onEnableTimeout`, `onDisableTimeout`, `configSchema`.
- `dependencies`: `managedBy`, `capabilities.mcp`, `capabilities.skills`, `capabilities.agents`, `commands`, `optionalCommands`.
- `lifecycle` and `resources` (`gateway`, `app`, `locked`), `platform` (`os`, `arch`, `installMode`, `clientInstall.shell`, `clientInstall.postInstall`), `openCommand`.
- Install rules: kebab-case `name`, `X.Y.Z` `version`, relative paths inside the app root, each cron has `every` or `cron_expr`, each UI page has `route` and `label`. Unknown fields are kept, not rejected.

Agent file, from the build first app page: `name`, `model`, `description`, `prompt`, `tools` (the value shown is `"@kirocrew-core"`).
Skill front matter: `name`, `description`, `triggers`, `always`.

Commands and routes:
- `POST http://localhost:5476/api/apps/install` with `{"source": "<path>"}`; `POST http://localhost:5476/api/apps/{name}/enable`; the dashboard route Install from local path.
- `kirocrew gateway`, `kirocrew app dev <name>`, `kirocrew app import <path> [--install]`.
- `POST /api/apps/register`, `POST /api/apps/{name}/open`, the proxy `/apps/{name}/api/*`.
- `npm install && npm run build` in `ui/` for an app with a UI.

## Problems found

Requirements, `requirements.md` before the review:

| Line | Problem | Fix |
| --- | --- | --- |
| 5 | Says two `mcpServers` entries. The kit has `apps/garden/dist/def.js` but no `apps/runner/dist/def.js`, so the runner entry would stop on start | One entry, `playcheck-garden` (3.3) |
| 7 | Says the pages were read on one date, but the pages carry their own dates, and the manifest page has none. The spec also leaves open points unnamed | The date claim is removed and the open points are listed in the introduction |
| 15 | Lists fields that are all on the manifest page, but not `dependencies`, and says nothing about `platform.os`. The manifest page says the default is `macos` and `linux`, and the spec targets Windows | `dependencies.commands` (1.3), and the Windows risk with a stop rule (1.6) |
| 16 | "not used by an app in the Crew app registry" has no way to check. The pages give Apps, Discover | 1.2 names Apps, Discover and puts the check in task 1 |
| 17 | Says "the local install command" and stops at the library. The apps page says resources are registered on Enable | 1.4 and 1.5 split install and enable, with both routes |
| 23 to 25 | Agent `tools` is not defined by the pages (only `"@kirocrew-core"`). Nothing says how an agent names an app's `mcpServers` entry | Open point, `tools` is a marked guess until task 5 (2.3) |
| 25 | "change no file" contradicts "save a replay". The `replay` handler with `save` true writes a file (`kit/mcp/src/tools.ts`, the last block of `replay`) | 2.4 and 2.5 say the saved replay is the one file |
| 31 | An environment variable for the game folder. `kit/mcp/src/server.ts` reads only `--game` (`gameFolderFromArguments`, lines 16 to 23), and the pages do not say Crew fills variables in `args` | Absolute paths with a placeholder, and a `--strict` check (3.1, 3.2) |
| 32 | "the one line message from the kit". The kit has several: `server.ts` lines 20, 32, 34 and 37, and the final `catch` at the end of the file. All start with `kit-mcp: ` and exit 1 | 3.5 lists them |
| 38 | The job message asks for "the prove check". The agent has no shell tool, and `prove` is a kit command that writes in the kit | Removed (4.2) |
| 39 | "how to switch it on" is not on the pages. They say only that `enabled: false` registers the job paused and resumable | Open point, task 7 records it |
| 45 | The skill asks for "how to time a jump". That is one game's word and the runner does not build. The skill front matter fields are not required | 5.1 to 5.3 give front matter and a game-free body |
| 51 | "one real transcript" has no source | 7.2 takes it from the log section or says that no run was made |
| none | No requirement for the checker `tools/check-manifest.mjs`, though tasks 2 and 6 run it | Requirement 6 |
| none | No requirement for the log, though `claims-policy` demands a row for each task | Requirement 8 |

Tasks, `tasks.md` before the review:

| Line | Problem | Fix |
| --- | --- | --- |
| 4 | "signed installer for Windows from the Kiro downloads page" is not on the Crew pages. The pages say only that Crew is installed and running with `kirocrew gateway` | The install source is written in the log as seen |
| 5 | Asks to read the publishing page. It was not among the pages named for this review | Dropped. Out of scope in the design |
| 10 and 12 | The checker is run in task 2 and no task writes it. No test is written first | Tasks 2 and 3 |
| 11 | "Search the Crew app registry" has no method | Task 1, Apps, Discover |
| 16 | An environment variable, and two entries | One entry, absolute path (see line 31 above) |
| 17 | "the Crew agent lists the tools" has no way to be seen | Task 5 says how it is seen and what is recorded |
| 21 | Plays level `g01`. The level ids come from `new_game`, and no built garden was checked | Task 6 lists the levels and plays the first one |
| 23 | The saved replay is written into the kit repository's `apps/garden/tests/replays/`. A task that is meant to leave the kit read only would write there | The check uses the replay object, with no `save` |
| 27 and 28 | "Reinstall" with no enable step. A paused job shows only after Enable | Task 7 reinstalls and enables |
| 33 | "Add the log rows with the credits used". `claims-policy` says the Credits cell stays empty | Removed. Every task adds its own row |
| 3 to 35 | Only tasks 1 and 6 mention the log. `claims-policy` asks for one row for each task | A rule at the top of the plan |

Steering, `.kiro/steering/`, copied from the kit repository:

| File | Fits? | Problem | Fix |
| --- | --- | --- | --- |
| `kit-boundary.md` | No | Its folder table (`kit/core` to `site/`) does not exist here. The rule "no `lantern` or `gate` in `kit/`" has no `kit/`. "A game's `src/rules`" has no meaning here. The public surface section is about `index.ts` of kit packages | Rewritten for this repository: folder table, kit read only, five tools only, no kit code copied |
| `product.md` | No | Describes the kit and the two games. "A shipped game calls no AI model" is false for an app whose job is to run an agent. "Product names live only in `apps/*/game.config.ts`" has no file here | Rewritten: what the app is, the three pages, limits that hold |
| `claims-policy.md` | Mostly | The proof file lines (`proofs/`, `npm run prove`) have no target here | Proof lines removed. Added: pasted transcripts only, no field that is not on the pages |

The three files also stay as `inclusion: always`.

## Kit repository, not changed (read only)

- `docs/tool-door.md`, about line 36: the fragment `ull when every action was applied.` follows the sentence about `stoppedBy`. It looks like a lost start of a line.
- `docs/kiro-log.md`, in the `kit-core` task 14 row: `\n` appears to have turned into a line break, which leaves `ode:fs` and `ode:path` where `node:fs` and `node:path` were meant.
- `.kiro/agents/playtester.json` uses fields that are not on the Crew pages (`includeMcpJson`, `allowedTools`, `permissions`, `kiroUpgrade`, and `read` in `tools`). It is a Kiro agent file for the kit, not a Crew file. This app does not copy it.
- `.kiro/settings/mcp.json` sets `disabled` and `autoApprove`. They are not among the fields the manifest page lists for `mcpServers` entries.
- The root `package.json` script `build:apps` builds only `@app/garden`. The runner is not built.
- `kit/mcp/src/index.ts` is `export {};`. The package exports nothing, and the app does not import it. The app uses only `dist/server.js`.

## Not checked

- No Crew was run, so nothing about install, enable, agent tool names, standard error display, the job state or `platform.os` on Windows was seen.
- The kit's tests and build were not run.
- The registry was not searched for `playcheck`.
- `kit/mcp/src/store.ts` was not read, so the limit of 8 sessions is from the kit's spec, not from code.
- The levels of the garden puzzle were not listed.
