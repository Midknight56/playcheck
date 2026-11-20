# Implementation Plan

Rules for every task: write the tests first and see them fail for the right reason. End with one row in `docs/kiro-log.md`, dated the same day, Credits empty. No package is added. No git write command is run. Crew is not started and nothing is installed.

- [x] 1. Runner entry
  - Tests first: two checker cases for rule `agent-tools` (a tool names a server that is not declared; a declared server is not in the tools). Change the fixture agent to `@playcheck:playcheck-garden`.
  - Then: the rule in `tools/check-manifest.mjs`; the `playcheck-runner` entry in `app.json`; `@playcheck:playcheck-runner` in the agent tools; the tick section of the skill, from the kit's proofs and log.
  - Verify: `node --test tools/check-manifest.test.mjs`, and `node tools/check-manifest.mjs`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Commit watch server
  - Tests first: `tools/commit-watch.test.mjs` (throwaway git repository in a temp folder, two commits, proofs folder). Cover `initialize`, a notification, `tools/list`, each tool answer, `changed` before and after `mark_checked` and after a new commit, a refused name, a missing folder, an unknown tool, the state file content and that it is the only file written. See them fail because `tools/commit-watch.mjs` does not exist.
  - Then: `tools/commit-watch.mjs`, and `package.json` `test` runs both test files.
  - Verify: `node --test tools/commit-watch.test.mjs`.
  - _Requirements: 2.1 to 2.8, 4.1, 4.2_

- [x] 3. Wire the job, agent and skill
  - Tests first: a checker case that strict names `<APP_DIR>`, and the fixture manifest gets the third entry.
  - Then: the `playcheck-commits` entry, the `nightly-play` message, the agent prompt and tools, the skill, the strict rule, version `0.2.0`.
  - Verify: `npm test`, `npm run check`, and `node tools/check-manifest.mjs --strict` exits 1 naming both placeholders.
  - _Requirements: 3.1 to 3.5_

- [x] 4. README and final check
  - Update "At a glance", the file list, the set the path part, the nightly job and the Limits line about the runner. State nothing about an install route that was not tried, and nothing about the new job having run.
  - Verify: `npm run verify` exits 0. Search the files for the owner's folder names and key patterns.
  - _Requirements: 5.1_
