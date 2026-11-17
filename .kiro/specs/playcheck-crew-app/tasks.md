# Implementation Plan

Rules for every task: read the three Crew pages again first. Write each test before the code and see it fail. End the task with one row in `docs/kiro-log.md`, dated the same day, with the Credits cell empty. A check that was not run is written as not run.

- [x] 1. Crew, the name and the platform
  - Install Kiro Crew and start it with `kirocrew gateway`, as the build first app page says. The pages name no installer, so write in the log where the install came from and the Crew version. Node 20 or newer is needed for the tool door.
  - Read the three Crew pages. Write in `docs/kiro-log.md` the Crew version, the install command with `POST http://localhost:5476/api/apps/install`, the enable command, and the field names the pages show for the agent file (`name`, `model`, `description`, `prompt`, `tools`) and for the skill front matter (`name`, `description`, `triggers`, `always`).
  - In Apps, Discover, search for `playcheck` and write what was found. If the name is taken, stop.
  - Write the `platform.os` default the manifest page shows (`["macos", "linux"]`) and say that Windows is not in it. The install check of this point happens in task 6.
  - Verify: the Crew dashboard opens and the log row exists.
  - _Requirements: 1.2, 1.6, 8.1_

- [x] 2. Checker tests, written first
  - Create `package.json` (private, version 0.1.0, MIT, `"type": "module"`, scripts `test` = `node --test tools/check-manifest.test.mjs`, `check` = `node tools/check-manifest.mjs`, `verify` = `npm test && npm run check`), `.gitignore` and `tools/check-manifest.test.mjs` with the cases in the design. Write no `check-manifest.mjs`.
  - Verify: `npm test` fails with all cases failing because the module is missing. Write the count in the log.
  - _Requirements: 6.3, 8.1_

- [x] 3. Checker
  - Create `tools/check-manifest.mjs` as in the design, until every case passes. Do not change a case to make it pass. If a case is wrong, say why in the log row and keep the first version of the case in the row.
  - Verify: `npm test` exits 0.
  - _Requirements: 6.1, 6.2, 8.1_

- [x] 4. App files
  - Create `app.json`, `agents/playtester.json`, `skills/playcheck/SKILL.md` and `LICENSE` with the exact content shapes of the design. Use only fields recorded in task 1.
  - Verify: `npm run check` exits 0, and `node tools/check-manifest.mjs --strict` exits 1 and names `<KIT_REPO>` as the reason.
  - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.6, 4.1, 4.2, 5.1, 5.2, 5.3, 7.3, 8.1_

- [x] 5. Tool door entry
  - In the kit repository, which is read only, run `npm run build:kit` and `npm run build:apps` only if `kit/mcp/dist/server.js` or `apps/garden/dist/def.js` is missing. Write in the log which of the two was missing. Do not edit any file in the kit repository.
  - Put the real kit path in a copy of `app.json` outside this repository, not in the repository, and install that copy. Start Crew with the agent. Write in the log the value of `tools` that makes the agent list `new_game`, `act`, `observe`, `render` and `replay`, the exact list, and whether `permissions.mcpTools` was needed. If neither `@playcheck-garden` nor another form seen on the pages works, stop and write the open question.
  - Start the tool door once by hand with a wrong path, read the line it prints, and compare it with the five lines in requirement 3.5. Write any difference in the log.
  - Update `agents/playtester.json` `tools` and, only if the run needed it, add `permissions.mcpTools` with the five names to `app.json` and to the allowed keys of the checker, with a test first. Write the change in the log.
  - Verify: `npm run verify` exits 0.
  - _Requirements: 2.3, 3.1, 3.4, 3.5_

- [x] 6. Install, enable and play
  - Install and enable the copy from task 5 with the commands recorded in task 1. If the install is refused because of `platform.os`, write the exact error in the log and stop (requirement 1.6).
  - Ask `playcheck-tester` to start `new_game` with no level, then play the first level that it lists to a won status. Do not use `replay` with `save` unless the result does not match the rules.
  - Paste the tool calls and answers into "Tool door transcripts" of the log, with the date and the level.
  - Verify: the app shows in Apps, Library; the agent reports the level, seed, actions, final status and hash; the `replay` tool, given the replay object from the agent's own call and no `save`, returns `ok` true with the same hash and phase `won`. Write each result, or write that it did not run and why.
  - _Requirements: 1.4, 1.5, 2.4, 7.2, 8.1_

- [x] 7. Scheduled job, switched off
  - Check that the `crons` entry in `app.json` has `"enabled": false`. Reinstall the copy and enable the app. Do not switch the job on.
  - Look in the dashboard for how a paused job is switched on, and write the words the dashboard shows for a paused job and for the switch. Write what Crew showed, or write that it showed nothing.
  - Verify: Crew lists the job as paused, written as seen.
  - _Requirements: 4.1, 4.3, 4.4, 8.1_

- [x] 8. README and final check
  - Write `README.md` as in the design. The transcript is the one from task 6, or the README says that no run was made.
  - Search every file of the repository, except `.git`, for key and token patterns and for the owner's folder names. Confirm `version` is below 1.0.0, `enabled` is `false`, and `<KIT_REPO>` is still in `app.json`.
  - Verify: `npm run verify` exits 0 and the search finds nothing.
  - _Requirements: 3.4, 3.5, 4.3, 7.1, 7.2, 7.4, 8.1_
