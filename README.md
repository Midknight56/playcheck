# playcheck

`playcheck` is an app for Kiro Crew. Its agent, `playcheck-tester`, plays a game built with the kit through the kit's tool door and reports what it saw. For each level it reports the level, the seed, the actions it sent, the final status and the state hash.

The app has one agent, one skill, one tool door entry for the garden puzzle, and one nightly job that ships switched off. It has no account, no login and no backend. The agent runs on your own Kiro credits.

## At a glance

**Value/usefulness.** A small game changes every day and nobody replays every level after each change. With this app a Crew agent plays the game for you through the same tool door a person's game uses, and reports the level, seed, actions, final status and state hash. A run on Kiro Crew 0.12.2 won level g01 and gave the hash `d836baac0f60ae09`; the kit's tool door replayed it and got the same hash. The nightly play check is off after install, so the app never spends your credits until you switch it on with `kirocrew cron resume <job id>`.

**Technical innovation/idea.** The agent does not guess from screenshots. It talks to the game through an MCP server built from the game's own rules, so every move it reports can be replayed and checked to the exact state. The app adds no game code: it is one manifest, one agent, one skill and one tool door entry on top of the Skeleton kit repository (https://github.com/Midknight56/skeleton-kit).

## What you need

- Kiro Crew, running (`kirocrew gateway`). The app was tried on Kiro Crew 0.12.2 on Windows.
- Node 20 or newer. The manifest lists `node` under `dependencies.commands`, so Crew blocks the install without it.
- The kit repository, https://github.com/Midknight56/skeleton-kit, cloned to a folder called `<KIT_REPO>` below.

## Build the tool door

In `<KIT_REPO>`:

```
npm run build:kit
npm run build:apps
```

The first builds `kit/mcp/dist/server.js`. The second builds `apps/garden/dist/def.js`. The tool door does not start without both.

## Set the path

`app.json` holds the placeholder `<KIT_REPO>` in the tool door entry:

```json
"args": ["<KIT_REPO>/kit/mcp/dist/server.js", "--game", "<KIT_REPO>/apps/garden"]
```

Make a copy of this folder, or edit it in place, and replace `<KIT_REPO>` with the absolute path of the kit repository. On Windows use forward slashes, for example `C:/work/kit`. The Crew pages do not say that Crew fills in variables, so the path is written by hand. Then check it:

```
node tools/check-manifest.mjs --strict <the folder>
```

It prints `ok` when the placeholder is gone and the files pass the checks.

## Install and enable

The Crew pages give these two requests:

```
curl.exe -X POST http://localhost:5476/api/apps/install -H "Content-Type: application/json" -d '{\"source\": \"C:/path/to/playcheck\"}'
curl.exe -X POST http://localhost:5476/api/apps/playcheck/enable
```

What was seen on Kiro Crew 0.12.2 (2026-11-16):

- A plain request to the API without the dashboard token was refused with 403. The install and the enable were sent with a session opened from the URL that `kirocrew token` prints.
- The enable of a local app was refused until the app was trusted: `blocked by execution policy: third-party app execution is disabled; trust this app alone from the dashboard's App Store, whose install, update and enable prompts ask for it (agent.apps_trusted) ...`. Trust `playcheck` alone in the dashboard's prompt. The test run did it with `agent.apps_trusted` set to `["playcheck"]`.
- The install was accepted on Windows. The manifest has no `platform` block.

The dashboard route on the Crew pages is Apps, then Install from local path. It was not tried. The CLI also has `kirocrew app install <folder>` and `kirocrew app enable playcheck`; these were not tried either.

After the enable, Crew registers the agent `playcheck-tester`, the skill `playcheck`, the tool door `playcheck:playcheck-garden` and the job `playcheck/nightly-play`.

## Play

Ask the agent, for example:

> Call new_game with no level. Then start the first level it lists and play it to a won status. Report the level, seed, actions, final status and hash.

Each game tool call needs your approval unless you allow it. `kirocrew chat -m` cannot ask for approval, so its tool calls are denied. Use the dashboard chat or `kirocrew chat` in a terminal. The test run used `kirocrew spawn run --agent playcheck-tester "<request>"`, which waits for the owner to approve the spawn.

The agent writes no file, except a saved replay. It saves one only for a result that does not match the rules, with `replay` and `save` true. That file goes into the game folder, under `<KIT_REPO>/apps/garden/tests/replays/`.

## The nightly job

`nightly-play` runs at 03:00 and asks the agent to play the first three levels. It ships with `"enabled": false`, so it is paused after install. When it runs, it uses your own Kiro credits.

On Kiro Crew 0.12.2 the dashboard Schedule page lists it with Status `Paused`, a disabled `Run` button, `Delete`, and an `Actions` menu. The dashboard words for the switch were not checked, because the `Actions` menu was not opened.

To switch the job on, run `kirocrew cron list` to read the job id. Then run `kirocrew cron resume <job id>`. The list then shows a check mark instead of the pause sign. To switch it off again, run `kirocrew cron pause <job id>`. This was tried on Kiro Crew 0.12.2.

## When the tool door does not start

The tool door writes one line on standard error that starts with `kit-mcp: ` and exits with code 1.

| Message after `kit-mcp: ` | Fix |
| --- | --- |
| `the --game argument is missing. Use: node server.js --game <game folder>` | Put the game folder after `--game` in `args`. |
| `cannot load <folder>/dist/def.js: <first line of the Node error>` | Run `npm run build:apps` in `<KIT_REPO>`, and check the path. |
| `<folder>/dist/def.js has no default export` | Rebuild the game. |
| `<folder>/dist/def.js is not a valid game definition: <problems>` | Fix the game in the kit repository. |
| `unexpected failure: <text>` | Read the text. |

If `kit/mcp/dist/server.js` itself is missing, `node` prints its own `Cannot find module` error with no `kit-mcp: ` prefix. Run `npm run build:kit` in `<KIT_REPO>`, and check the path.

On Windows the folder in the second message is printed with backslashes, and the Node error part names the full path of `def.js` and of `server.js`. Whether Crew shows this line anywhere was not seen.

## A real run

2026-11-16, Kiro Crew 0.12.2, model `auto`, the garden puzzle, level g01. The calls and answers are as the agent pasted them in its result, copied from "Tool door transcripts" in `docs/kiro-log.md`, which also has the full answers of `new_game` and `act`.

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

## Limits

- Only the garden puzzle has a tool door entry. The runner entry is not shipped, because the kit had no built runner when the app was made.
- A saved replay is written into the game folder in the kit repository.
- The kit path is written into `app.json` by hand.
- The agent has no file or shell tool, so it cannot read a game's rule files. It checks against the rules you give it.
- The tool door keeps at most 8 sessions. The session used least recently is dropped first.

## Check the files

```
npm run verify
```

This runs the checker's tests and then the checker on this folder. It needs no dependency.

## Licence

MIT. See `LICENSE`.
