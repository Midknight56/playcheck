# Requirements Document

## Introduction

This spec is for a second, small repository. It holds one app for Kiro Crew. The app lets a Crew agent play a game built with the kit through the kit's tool door and report what changed. It has one agent, one skill, one tool door entry for the garden puzzle and one scheduled job that ships switched off. It has no dashboard page in its first version. The app uses the kit as it is. It adds no game code.

The Crew app format in this spec comes from kiro.dev/docs/crew/apps, kiro.dev/docs/crew/apps/manifest and kiro.dev/docs/crew/apps/build-first-app. Read those pages again before each task. Do not use a field that is not on those pages. The pages show only part of what Crew does with an app. Where a page is silent, this spec marks the point as open and a task records what was seen.

The tool door facts come from `kit/mcp/src/server.ts`, `kit/mcp/src/tools.ts` and `docs/tool-door.md` in the kit repository, which is read only.

Open points, each settled by one task:
- How an agent file names the tools of an app's `mcpServers` entry. The pages show only `"@kirocrew-core"`. Task 5.
- Whether Crew replaces `${...}` or environment names inside `args`. The pages do not say. This spec assumes it does not.
- The `platform.os` value for Windows. The pages show only `"macos"` and `"linux"`, and say the default is those two. Tasks 1 and 6.
- Whether the five tool calls need entries in `permissions.mcpTools`. Task 5.
- How a paused job is switched on in the dashboard. Task 7.

## Requirements

### Requirement 1: Manifest
**User Story:** As a Crew user, I want to install the app from its folder, so that I can try it in a minute.

#### Acceptance Criteria
1. THE SYSTEM SHALL have an `app.json` at the repository root with exactly these top level fields: `name`, `version`, `displayName`, `description`, `author`, `license`, `minKiroCrewVersion`, `tags`, `agents`, `skills`, `mcpServers`, `crons` and `dependencies`. `version` SHALL be below 1.0.0.
2. THE SYSTEM SHALL use the `name` `playcheck`. It SHALL match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. Task 1 SHALL look for the name in Apps, Discover in the Crew dashboard and write the result in the log. If the name is taken, the task SHALL stop and say so.
3. THE SYSTEM SHALL set `dependencies.commands` to `["node"]`, so that Crew blocks the install on a machine without Node.
4. WHEN the app is installed from its folder, with `POST /api/apps/install` and the body `{"source": "<folder>"}` or with Install from local path in the dashboard, THEN Crew SHALL list it in Apps, Library with no error.
5. WHEN the app is then enabled, with `POST /api/apps/playcheck/enable` or the Enable button, THEN Crew SHALL register the agent, the skill, the tool door entry and the job.
6. IF Crew refuses the install on Windows because of `platform.os`, THEN the task SHALL write the exact error in the log and stop. The task SHALL NOT guess a value for `platform.os`.

### Requirement 2: Agent
**User Story:** As a game maker, I want an agent that plays my game and tells me what it saw, so that I get a second player for every build.

#### Acceptance Criteria
1. THE SYSTEM SHALL define one agent file, `agents/playtester.json`, with exactly the fields shown on the build first app page: `name`, `model`, `description`, `prompt` and `tools`.
2. THE SYSTEM SHALL set `name` to `playcheck-tester` and `model` to `auto`.
3. THE SYSTEM SHALL set `tools` to the value that task 5 records as the one that makes the agent see the five game tools. Until task 5 the value is `["@playcheck-garden"]`, a guess that follows the kit's own agent file, and it is marked open.
4. THE SYSTEM SHALL tell the agent in its prompt to use only the five game tools, to edit no game file, to report for each level the level id, the seed, the actions sent, the final status and the state hash, and to call `replay` with `save` true only for a result that does not match the rules, and then to name the file from the answer.
5. THE SYSTEM SHALL tell the agent in its prompt that the only file a run can write is that saved replay, and that it lands in the game folder under `tests/replays/`.

### Requirement 3: Tool door
**User Story:** As a game maker, I want the agent to reach my game, so that it plays the real rules.

#### Acceptance Criteria
1. THE SYSTEM SHALL declare one entry, `playcheck-garden`, under `mcpServers` with the fields `command` and `args` only: `command` is `node` and `args` is `["<KIT_REPO>/kit/mcp/dist/server.js", "--game", "<KIT_REPO>/apps/garden"]`. The text `<KIT_REPO>` is a placeholder for the absolute path of the kit repository. The kit's server has no environment variable for the game folder, and the pages do not say that Crew fills in variables, so the user replaces the placeholder before install.
2. THE SYSTEM SHALL have a check, `node tools/check-manifest.mjs --strict`, that fails while `<KIT_REPO>` is still in `app.json`. The README SHALL tell the user to run it before install.
3. THE SYSTEM SHALL NOT declare a runner entry in the first version. The kit repository has no built runner (`apps/runner/dist/def.js` does not exist), and the tool door would stop on start.
4. THE SYSTEM SHALL state in the README the two build commands the user runs in the kit repository first: `npm run build:kit` and `npm run build:apps`. Both outputs are in `.gitignore` of the kit.
5. IF the tool door cannot start THEN it SHALL write one line on standard error that starts with `kit-mcp: ` and exit with code 1. The README SHALL list these messages from `kit/mcp/src/server.ts` and the fix for each:
   - `the --game argument is missing. Use: node server.js --game <game folder>`
   - `cannot load <folder>/dist/def.js: <first line of the Node error>`
   - `<folder>/dist/def.js has no default export`
   - `<folder>/dist/def.js is not a valid game definition: <problems>`
   - `unexpected failure: <text>`
6. THE SYSTEM SHALL NOT set `disabled` or `autoApprove` in the `mcpServers` entry. Those are in the kit's own `mcp.json`, and the Crew pages list only `command`, `args`, `url` and `env`.

### Requirement 4: Scheduled job
**User Story:** As a game maker, I want a nightly play check that I switch on myself, so that the app never spends my credits without my choice.

#### Acceptance Criteria
1. THE SYSTEM SHALL declare one entry in `crons` with `name` `nightly-play`, `cron_expr` `0 3 * * *`, `agent` `playcheck-tester`, `enabled` `false` as a JSON boolean, and a `message` that asks the agent to list the levels with `new_game`, play the first three to a won status and report as in requirement 2.4. The entry SHALL NOT have `every`.
2. THE SYSTEM SHALL NOT ask the job for the prove check. The agent has no shell tool, and the prover is the kit's command `npm run prove`.
3. THE SYSTEM SHALL state in the README that the job is off after install, that it uses the user's own Kiro credits when it runs, and how to switch it on as task 7 recorded it.
4. WHEN the app is enabled THEN Crew SHALL show the job as paused. The README SHALL quote what Crew showed only after task 7 saw it.

### Requirement 5: Skill
**User Story:** As the agent, I want the play rules in one place, so that I play the same way each time.

#### Acceptance Criteria
1. THE SYSTEM SHALL include one skill folder, `skills/playcheck`, with a `SKILL.md` that starts with the front matter fields shown on the build first app page: `name` (`playcheck`, the folder name), `description`, `triggers` and `always` (`false`).
2. THE SYSTEM SHALL explain in the body the five tools and their inputs, the `text*n` form (n from 2 to 3600, at most 600 items and 3600 actions in one `act` call), `stoppedBy`, the rule that legal action texts are copied from `legal` and never made up, how to watch a tick game with short `none*n` runs and `observe` between them, and the report format.
3. THE SYSTEM SHALL NOT name an action text of any one game in the skill.

### Requirement 6: Checker
**User Story:** As a maintainer, I want one command that checks the app files, so that a wrong field is found before Crew finds it.

#### Acceptance Criteria
1. THE SYSTEM SHALL have `tools/check-manifest.mjs`, plain Node with no dependency, that reads the repository and lists every problem with the file and the rule. It SHALL exit 0 when there is none and 1 otherwise.
2. THE SYSTEM SHALL check: valid JSON; the install rules of the manifest page (kebab-case `name`, `X.Y.Z` `version` below 1.0.0, required fields non-empty strings, relative paths that stay in the repository and exist, each cron has `every` or `cron_expr` and not both); that every key in `app.json`, in the agent file, in each `crons` entry and in each `mcpServers` entry is on the allowed list of the design; that the front matter of `SKILL.md` has the four fields; that each shipped cron has `enabled` equal to `false`; and that no file holds a byte order mark, a carriage return, or text that looks like a key or token.
3. THE SYSTEM SHALL have `tools/check-manifest.test.mjs` with one case for each rule. Each case SHALL be seen failing before `check-manifest.mjs` exists.

### Requirement 7: Repository
**User Story:** As a judge, I want a clean public repository, so that I can read the app in two minutes.

#### Acceptance Criteria
1. THE SYSTEM SHALL have a `README.md` with what the app does, the build and install steps, the start messages of requirement 3.5, one real transcript of the agent playing a level, and the limits.
2. THE SYSTEM SHALL take the transcript from the section "Tool door transcripts" of `docs/kiro-log.md`, with its date and level. WHERE no run was made, the README SHALL say that no run was made and SHALL NOT show a transcript.
3. THE SYSTEM SHALL have an MIT `LICENSE` file and a `.kiro` folder with this spec and the steering files.
4. THE SYSTEM SHALL contain no secret, no token and no personal data. The README shows paths as `<KIT_REPO>`, not as the owner's folder names.

### Requirement 8: Log
**User Story:** As the owner, I want every task logged the same day, so that I can fill in the credits and trust the record.

#### Acceptance Criteria
1. WHEN a task ends THEN the same day a row SHALL be added to `docs/kiro-log.md` with the Credits cell empty.
2. THE SYSTEM SHALL name a check as run only if it ran. A check that did not run SHALL be written as not run, with the reason.
