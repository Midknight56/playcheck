# Implementation Plan

- [ ] 1. Install Kiro Crew and read the app pages
  - Install Kiro Crew for Windows with the signed installer from the Kiro downloads page. Start it and finish sign in.
  - Read the Crew apps page, the manifest reference, the build first app page and the publishing page. Write in `docs/kiro-log.md` the Crew version, the local install command, and the exact agent file fields those pages show.
  - Verify: the Crew dashboard opens and the log row exists.
  - _Requirements: 1.3_

- [ ] 2. Manifest and files
  - Create `app.json`, `agents/playtester.json`, `skills/playcheck/SKILL.md`, `README.md` and `LICENSE` as in the requirements. Use only fields recorded in task 1.
  - Search the Crew app registry for the chosen `name` and write the result in the log.
  - Verify: `app.json` parses as JSON, and a script `node tools/check-manifest.mjs` confirms every path in `agents` and `skills` exists.
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 5.1, 6.2_

- [ ] 3. Tool door entry
  - Add the two `mcpServers` entries that run the kit's `kit/mcp/dist/server.js` with `--game` for the garden puzzle and the runner. Read the game repository path from the environment variable named in the README.
  - Verify: with the variable set to a built copy of the game repository, the Crew agent lists the tools `new_game`, `act`, `observe`, `render` and `replay`. Write the list in the log.
  - _Requirements: 3.1, 3.2_

- [ ] 4. Install and play
  - Install the app in Crew from its folder. Ask the `playtester` agent to play garden level `g01` to a won status.
  - Copy the transcript into the README.
  - Verify: the app shows in the Crew library, and the saved replay passes the kit's `replay` tool.
  - _Requirements: 1.3, 2.3, 6.1_

- [ ] 5. Scheduled job, switched off
  - Add the `crons` entry with `"enabled": false`. Reinstall the app.
  - Verify: Crew shows the job as paused. Write what Crew shows in the log. Do not switch it on.
  - _Requirements: 4.1, 4.2_

- [ ] 6. Final check
  - Search the repository for tokens, keys and personal data. Confirm the version is below 1.0.0.
  - Add the log rows with the credits used.
  - Verify: `node tools/check-manifest.mjs` passes and the search finds nothing.
  - _Requirements: 6.1, 6.3_
