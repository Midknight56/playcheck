# playcheck

`playcheck` is an app for Kiro Crew. Its agent, `playcheck-tester`, plays a game built with the kit through the kit's tool door and reports what it saw. For each level it reports the level, the seed, the actions it sent, the final status and the state hash. It can also check the kit's own proof replays, one for each level, and report whether the final hash of each replay matches the proof.

The app has one agent, one skill, three tool servers and one nightly job that ships switched off. Two of the servers are the kit's tool door, one for the garden puzzle and one for the runner. The third is `tools/commit-watch.mjs`, a small server in this repository. The app has no account, no login and no backend. The agent runs on your own Kiro credits.

## At a glance

**Value/usefulness.** A small game changes every day and nobody replays every level after each change. With this app a Crew agent plays the game for you through the same tool door a person's game uses, and reports the level, seed, actions, final status and state hash. It plays two games, the garden puzzle and the runner. The nightly job asks first whether the kit has a commit that was not checked yet, and when it has none, the report is `no new commit` with the hash. When there is a new commit, the agent replays the kit's proof of every level and compares the final hashes, then plays one level of each game by hand. A run on Kiro Crew 0.12.2 (app version 0.1.0) won level g01 of the garden puzzle and gave the hash `d836baac0f60ae09`; the kit's tool door replayed it and got the same hash. On 2026-11-20 a script, not an agent, ran the steps of the nightly job against kit commit `847e6e1`: all 18 proof replays (12 garden levels, 6 runner levels) gave the final hash and phase of the proof. The job is off after install, so the app never spends your credits until you switch it on with `kirocrew cron resume <job id>`.

**Technical innovation/idea.** The agent does not guess from screenshots. It talks to the game through an MCP server built from the game's own rules, so every move it reports can be replayed and checked to the exact state. A proof in the kit is a seed, a list of actions and a final hash. The new server `tools/commit-watch.mjs` hands those proofs to the agent, the agent runs each one on the replay tool of the game, and the check of a whole kit becomes a comparison of hashes, not an opinion. `commit-watch.mjs` is plain Node with no package. It speaks the Model Context Protocol over standard input and output, runs no command but `git`, writes one state file, and refuses a game or level name that holds anything but letters, digits and hyphens. It has its own test file, which runs the server on a throwaway git repository. The agent has no file tool and no shell tool, only the tools of the three servers. The app adds no game code: it is one manifest, one agent, one skill, three tool server entries and one small server on top of the Skeleton kit repository (https://github.com/Midknight56/skeleton-kit).

## What you need

- Kiro Crew, running (`kirocrew gateway`). Version 0.1.0 of the app was tried on Kiro Crew 0.12.2 on Windows. Version 0.2.0, with the runner entry and the commit tool server, has not been installed in Crew.
- Node 20 or newer. The manifest lists `node` under `dependencies.commands`, so Crew blocks the install without it.
- `git` on the path. `commit-watch.mjs` runs it on the kit folder. The manifest does not list it.
- The kit repository, https://github.com/Midknight56/skeleton-kit, cloned to a folder called `<KIT_REPO>` below.

## Files

| File | What it is |
| --- | --- |
| `app.json` | The Crew manifest: three tool servers and the job `nightly-play`, switched off. |
| `agents/playtester.json` | The agent `playcheck-tester`. Its tools are those of the three servers. |
| `skills/playcheck/SKILL.md` | The play rules: the five game tools, tick games and the runner, checking a new commit, the report. |
| `tools/commit-watch.mjs` | The server `playcheck-commits`. Tools `kit_commit`, `kit_proof` and `mark_checked`. |
| `tools/commit-watch.test.mjs` | Tests of that server, run as a child process on a throwaway git repository. |
| `tools/check-manifest.mjs` | Checks the app files against the manifest fields of the Crew pages. |
| `tools/check-manifest.test.mjs` | Tests of the checker. |
| `docs/kiro-log.md` | One row for each finished task. |
| `.kiro/` | Steering and specs (`playcheck-crew-app`, `playcheck-depth`). |
| `package.json`, `LICENSE`, `.gitignore`, `.gitattributes`, `.editorconfig` | Repository files. `package.json` has scripts only and no dependency. |

## Build the tool door

In `<KIT_REPO>`:

```
npm run build:kit
npm run build:apps
```

The first builds `kit/mcp/dist/server.js`. The second builds the games, `apps/garden/dist/def.js` and `apps/runner/dist/def.js`. A tool door does not start without its game.

## Set the path

`app.json` holds two placeholders. `<KIT_REPO>` is the kit repository. `<APP_DIR>` is the folder of this app, because the manifest page says `mcpServers` entries are not app relative paths, so the path to `tools/commit-watch.mjs` is written in full:

```json
"playcheck-garden":  { "command": "node", "args": ["<KIT_REPO>/kit/mcp/dist/server.js", "--game", "<KIT_REPO>/apps/garden"] },
"playcheck-runner":  { "command": "node", "args": ["<KIT_REPO>/kit/mcp/dist/server.js", "--game", "<KIT_REPO>/apps/runner"] },
"playcheck-commits": { "command": "node", "args": ["<APP_DIR>/tools/commit-watch.mjs", "<KIT_REPO>"] }
```

Make a copy of this folder, or edit it in place, and replace both placeholders with absolute paths. On Windows use forward slashes, for example `C:/work/kit`. Keep the folder named by `<APP_DIR>` where it is, because the server is started from that file. The Crew pages do not say that Crew fills in variables, so the paths are written by hand. Then check it:

```
node tools/check-manifest.mjs --strict <the folder>
```

It prints `ok` when both placeholders are gone and the files pass the checks.

To choose the folder of the state file, add `"--state", "<folder>"` to the `args` of `playcheck-commits`.

## Install and enable

The Crew pages give these two requests:

```
curl.exe -X POST http://localhost:5476/api/apps/install -H "Content-Type: application/json" -d '{\"source\": \"C:/path/to/playcheck\"}'
curl.exe -X POST http://localhost:5476/api/apps/playcheck/enable
```

What was seen on Kiro Crew 0.12.2 (2026-11-16), with app version 0.1.0, which had the garden entry only:

- A plain request to the API without the dashboard token was refused with 403. The install and the enable were sent with a session opened from the URL that `kirocrew token` prints.
- The enable of a local app was refused until the app was trusted: `blocked by execution policy: third-party app execution is disabled; trust this app alone from the dashboard's App Store, whose install, update and enable prompts ask for it (agent.apps_trusted) ...`. Trust `playcheck` alone in the dashboard's prompt. The test run did it with `agent.apps_trusted` set to `["playcheck"]`.
- The install was accepted on Windows. The manifest has no `platform` block.

The dashboard route on the Crew pages is Apps, then Install from local path. It was not tried. The CLI also has `kirocrew app install <folder>` and `kirocrew app enable playcheck`; these were not tried either.

Version 0.2.0 was not installed. For 0.1.0, after the enable, Crew registered the agent `playcheck-tester`, the skill `playcheck`, the tool door `playcheck:playcheck-garden` and the job `playcheck/nightly-play`.

## Play

Ask the agent, for example:

> Call new_game with no level. Then start the first level it lists and play it to a won status. Report the level, seed, actions, final status and hash.

For the runner, ask for a level such as `r01`. The runner is a tick game, so the agent sends short runs of `none` and calls `observe` between them. The skill says how.

To check the kit's proofs by hand, ask:

> Call kit_commit. Then, for every level of garden and runner, call kit_proof, run the replay with the replay tool of that game, and report match or mismatch with both hashes.

Each game tool call needs your approval unless you allow it. `kirocrew chat -m` cannot ask for approval, so its tool calls are denied. Use the dashboard chat or `kirocrew chat` in a terminal. The test run of version 0.1.0 used `kirocrew spawn run --agent playcheck-tester "<request>"`, which waits for the owner to approve the spawn.

The agent can write two kinds of file:

- A saved replay, only for a result that does not match the rules, with `replay` and `save` true. That file goes into the game folder, under `<KIT_REPO>/apps/garden/tests/replays/` or `<KIT_REPO>/apps/runner/tests/replays/`.
- The state file `playcheck-commit-state.json`, written by `mark_checked`, outside any game. It holds the hash of the last checked commit, the result text and a time.

## The state file

`commit-watch.mjs` keeps the state file in one folder: the one after `--state`, else the folder in the environment variable `KIROCREW_APP_DATA` when it is set, else the temp folder of the operating system. The Crew pages name an app data folder, `<data home>/apps/<name>/data/`, and do not say that Crew sets `KIROCREW_APP_DATA`, so whether it is set was not seen. If it is not set, the file is in the temp folder, and clearing that folder makes the next night check the same commit again.

`kit_commit` reads the commit the kit folder has checked out. It does not fetch. Pull the kit repository before the night when you want a new commit checked.

## The nightly job

`nightly-play` runs at 03:00. It ships with `"enabled": false`, so it is paused after install. When it runs, it uses your own Kiro credits. Its message tells the agent to:

1. Call `kit_commit`. If `changed` is false, report `no new commit` with the hash and stop.
2. If `changed` is true, call `kit_proof` for every level of the garden puzzle and the runner, run each returned replay with the `replay` tool of the same game, and report the final hash against the `finalHash` of the proof.
3. Play garden level g01 and runner level r01 by hand with `new_game` and `act`, and report the level, seed, actions, final status and hash.
4. Call `mark_checked` with the hash and a one line result.

This version of the job has not run. The steps were run once by a script against the kit, not by an agent (see "At a glance").

On Kiro Crew 0.12.2 the dashboard Schedule page listed the job of version 0.1.0 with Status `Paused`, a disabled `Run` button, `Delete`, and an `Actions` menu. The dashboard words for the switch were not checked, because the `Actions` menu was not opened.

To switch the job on, run `kirocrew cron list` to read the job id. Then run `kirocrew cron resume <job id>`. The list then shows a check mark instead of the pause sign. To switch it off again, run `kirocrew cron pause <job id>`. This was tried on Kiro Crew 0.12.2 with the job of version 0.1.0.

## When a tool server does not start

The kit's tool door writes one line on standard error that starts with `kit-mcp: ` and exits with code 1.

| Message after `kit-mcp: ` | Fix |
| --- | --- |
| `the --game argument is missing. Use: node server.js --game <game folder>` | Put the game folder after `--game` in `args`. |
| `cannot load <folder>/dist/def.js: <first line of the Node error>` | Run `npm run build:apps` in `<KIT_REPO>`, and check the path. |
| `<folder>/dist/def.js has no default export` | Rebuild the game. |
| `<folder>/dist/def.js is not a valid game definition: <problems>` | Fix the game in the kit repository. |
| `unexpected failure: <text>` | Read the text. |

If `kit/mcp/dist/server.js` itself is missing, `node` prints its own `Cannot find module` error with no `kit-mcp: ` prefix. Run `npm run build:kit` in `<KIT_REPO>`, and check the path.

On Windows the folder in the second message is printed with backslashes, and the Node error part names the full path of `def.js` and of `server.js`. Whether Crew shows this line anywhere was not seen.

`commit-watch.mjs` writes one line that starts with `commit-watch: ` and exits with code 1 in these cases:

| Message after `commit-watch: ` | Fix |
| --- | --- |
| `the kit folder is missing. Use: ...` | Put the kit folder after the script in `args`. |
| `the kit folder <path> does not exist` or `<path> is not a folder` | Check the path of `<KIT_REPO>`. |
| `--state needs a folder. Use: ...` | Give a folder after `--state`, or remove it. |
| `unknown option <option>` or `unexpected argument <text>` | Use only the kit folder and `--state <folder>`. |

If the kit folder is not a git repository, the server starts and `kit_commit` answers with an error that holds the first line of the message of `git`.

## A real run

2026-11-16, Kiro Crew 0.12.2, app version 0.1.0, model `auto`, the garden puzzle, level g01. The calls and answers are as the agent pasted them in its result, copied from "Tool door transcripts" in `docs/kiro-log.md`, which also has the full answers of `new_game` and `act`.

1. `new_game` with no input gave `{"game":"garden","kind":"turn","levels":[{"id":"g01","title":"First light"}, ...]}`, with levels g01 to g12.
2. `new_game` `{"level":"g01"}` gave session `s1`, seed 1, summary `Turn 0 of 6. No lantern is lit. 0 of 1 moths home.` and `"legal":["light:1","light:2"]`.
3. `act` `{"actions":["light:1"],"session":"s1"}` gave `"applied":1`, `"stoppedBy":null`, phase `playing`, `"legal":["light:2","wait"]`, `"hash":"7b437c3acb3b41aa"`.
4. `act` `{"actions":["wait"],"session":"s1"}` gave `"applied":1`, `"stoppedBy":null`, `"status":{"phase":"won","score":2}`, summary `Turn 2 of 6. Lantern 1 is lit. 1 of 1 moths home.`, `"hash":"d836baac0f60ae09"`.
5. `replay` `{"session":"s1"}` gave:

   ```
   {"replay":{"format":1,"game":"garden","rulesVersion":"1","level":"g01","seed":1,"actions":["light:1","wait"],"finalHash":"d836baac0f60ae09","finalPhase":"won"}}
   ```

The agent reported: level g01, seed 1, actions `light:1`, `wait`, final status won, hash `d836baac0f60ae09`.

That replay object, sent by hand to a fresh tool door with no `save`, gave `{"ok":true,"finalHash":"d836baac0f60ae09","finalPhase":"won"}`.

No agent run of the runner entry, of `playcheck-commits` or of the new nightly job has been made. The runner and the proofs were checked by a script that talks to the same servers (2026-11-20, see `docs/kiro-log.md`).

## Limits

- The garden puzzle and the runner have a tool door entry. Each needs its game built in the kit repository (`npm run build:apps`).
- Both games have tools with the same names (`new_game`, `act`, `observe`, `render`, `replay`). The kit's own log of 2026-11-16 saw one Kiro engine show the tools of only one of two such servers. Whether Crew keeps them apart was not seen. The agent prompt tells the agent to use the set of the game that the level belongs to, and that `unknown_level` means it used the other set.
- A matching hash says that the game still plays the proof the way the kit recorded it. It does not say that the rules are right.
- `kit_commit` reads the checked out commit of the kit folder. It does not fetch.
- A saved replay is written into the game folder in the kit repository.
- The kit path and the app path are written into `app.json` by hand.
- The agent has no file or shell tool, so it cannot read a game's rule files. It checks against the rules you give it, and against the proofs.
- The tool door keeps at most 8 sessions. The session used least recently is dropped first.
- `mark_checked` is called at the end of a check even when some levels did not match. The result text says how many did not, and the next night with the same commit reports `no new commit`.

## Check the files

```
npm run verify
```

This runs the tests of the checker and of `commit-watch.mjs`, and then the checker on this folder. It needs no dependency.

## Licence

MIT. See `LICENSE`.
