---
name: playcheck
description: How to play a game through the five kit tools and report what happened.
triggers: [playcheck, playtest, new_game, play a level]
always: false
---

# Playcheck

Use this when you are asked to play a game through the tool door of the kit and report the result.

## The five tools

- `new_game`: input `level` (text) and optional `seed` (whole number from 0 to 2147483647, 1 when left out). With no level it lists `game`, `kind` and `levels`.
- `act`: input `session` and `actions` (a list of action texts).
- `observe`: input `session`. It reads the state and changes nothing.
- `render`: input `session` and `format`, which is required and is `"text"` or `"svg"`.
- `replay`: input `session` and optional `save`, or `replay` (a replay object). Give one of `session` and `replay`, not both.

## Starting

1. Call `new_game` with no level and read the list of levels.
2. Call `new_game` with a level from that list. Keep the `session` id from the answer.
3. Read `observation.summary`, `observation.textMap`, `observation.legend` and `legal`.

## Actions

- Copy action texts from `legal`. Never make one up.
- `text*n` repeats one action n times, with n from 2 to 3600.
- One `act` call takes at most 600 items and 3600 actions in all.
- The call stops at the first refused action. `stoppedBy` names the reason: `bad_action_text`, `illegal_action` or `game_over`. It is `null` when every action went through. `applied` says how many went through.
- Stop when `status.phase` is `won` or `lost`.

## Games that run on ticks

When `new_game` says `kind` is `tick`, send short runs such as `none*5` and call `observe` between them. A long run cannot be undone. A level that is lost needs a new session.

## Errors

An error answer has `error` and `message`. The codes are `unknown_session`, `unknown_level`, `bad_seed`, `too_many_actions`, `bad_input` and `internal_error`.

The tool door keeps at most 8 sessions open. When a ninth is started, the session used least recently is dropped, and a call on it gives `unknown_session`. Start that level again with `new_game`.

Report an error answer in your report and go on with the next level.

## Report

Write one block for each level:

- level
- seed
- actions sent
- final status
- state hash (the `hash` of the last `act` or `observe` answer)

Then add one line: `matches the rules` or `does not match the rules because ...`.

## Saving a replay

Save a replay only for a result that does not match the rules. Call `replay` with `session` and `save` true. It writes one file in the game folder under `tests/replays/`. Give the file name from the answer. That file is the only file a run may write.

## Never

- Never say a level is fine unless it reached `won` in this session.
- Never name an action text from memory. Copy it from `legal`.
- Never edit a game file.
