# Requirements Document

## Introduction

This spec is for a second, small repository. It holds one app for Kiro Crew. The app lets a Crew agent play a game built with the kit through the kit's tool door and report what changed. It has one agent, one skill, two MCP server entries and one scheduled job that ships switched off. It has no dashboard page in its first version. The app uses the kit as it is. It adds no game code.

The Crew app format in this spec was read on kiro.dev/docs/crew/apps, kiro.dev/docs/crew/apps/manifest and kiro.dev/docs/crew/apps/build-first-app on 16 November 2026. Read those pages again before each task. Do not use a field that is not on those pages.

## Requirements

### Requirement 1: Manifest
**User Story:** As a Crew user, I want to install the app from its folder, so that I can try it in a minute.

#### Acceptance Criteria
1. THE SYSTEM SHALL have an `app.json` at the repository root with `name`, `version` below 1.0.0, `displayName`, `description`, `author`, `license`, `minKiroCrewVersion`, `tags`, `agents`, `skills`, `mcpServers` and `crons`.
2. THE SYSTEM SHALL use a `name` in kebab case that is not used by an app in the Crew app registry on the day of the check.
3. WHEN the app is installed with the local install command from the Crew apps page THEN Crew SHALL list it in the app library with no error.

### Requirement 2: Agent
**User Story:** As a game maker, I want an agent that plays my game and tells me what it saw, so that I get a second player for every build.

#### Acceptance Criteria
1. THE SYSTEM SHALL define one agent file with the fields shown on the build first app page: `name`, `model`, `description`, `prompt` and `tools`.
2. THE SYSTEM SHALL set `model` to `auto`.
3. THE SYSTEM SHALL tell the agent in its prompt to use only the five game tools, to change no file, to report the level, seed, actions, final status and state hash for each level, and to save a replay for anything that does not match the rules.

### Requirement 3: Tools
**User Story:** As a game maker, I want the agent to reach my game, so that it plays the real rules.

#### Acceptance Criteria
1. THE SYSTEM SHALL declare the kit's tool door under `mcpServers` in the same format as `mcp.json`, with the game folder read from an environment variable that the README names.
2. IF the game folder is not set or has no built game THEN the tool door SHALL fail to start with the one line message from the kit, and the README SHALL show that message and its fix.

### Requirement 4: Scheduled job
**User Story:** As a game maker, I want a nightly play check that I switch on myself, so that the app never spends my credits without my choice.

#### Acceptance Criteria
1. THE SYSTEM SHALL declare one entry in `crons` with a `cron_expr` for 03:00 each day, a `message` that asks for the prove check and a play of three levels, and `"enabled": false`.
2. THE SYSTEM SHALL state in the README that the job is off after install, that it uses the user's own Kiro credits when it runs, and how to switch it on.

### Requirement 5: Skill
**User Story:** As the agent, I want the play rules in one place, so that I play the same way each time.

#### Acceptance Criteria
1. THE SYSTEM SHALL include one skill folder with a `SKILL.md` that explains the five tools, the `text*n` form, how to time a jump with `observe`, and how to report.

### Requirement 6: Repository
**User Story:** As a judge, I want a clean public repository, so that I can read the app in two minutes.

#### Acceptance Criteria
1. THE SYSTEM SHALL have a `README.md` with what the app does, the install steps, one real transcript of the agent playing a level, and the limits.
2. THE SYSTEM SHALL have an MIT `LICENSE` file and a `.kiro` folder with this spec.
3. THE SYSTEM SHALL contain no secret, no token and no personal data.
