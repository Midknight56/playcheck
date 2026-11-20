---
name: playcheck
description: How to play a game through the five kit tools and report what happened.
triggers: [playcheck, playtest, new_game, play a level, kit_commit, new commit]
always: false
---

# Playcheck

Use this when you are asked to play a game through the tool door of the kit and report the result, or to check a new commit of the kit.

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

### The runner

The runner is the tick game of the kit, on the server `playcheck-runner`. The garden puzzle is a turn game, on the server `playcheck-garden`. Both servers have the tools `new_game`, `act`, `observe`, `render` and `replay`. Use the tools of the server that belongs to the level. A level id from the other game gives `unknown_level`.

- Levels: `r01`, `r02`, `r03`, `r04`, `r05`, `r06` (the kit's `proofs/runner/index.json`). The garden levels are `g01` to `g12`.
- `legal` is `none` and `jump`. One action is one tick. A course takes hundreds of ticks (the proofs use 687 ticks for `r01` and 1851 for `r06`), so use `none*n`, at most 3600 actions in one `act` call.
- A gap makes the player fall (the legend says "gap, the player falls"). The observation names the next obstacle and how many ticks away it is, in `facts.next`. Run `none*n` up to a little before it, call `observe`, and then jump.
- The smallest jump window of each course is 10 ticks for `r01` and `r02`, 6 for `r03` and `r04`, and 4 for `r05` and `r06` (the kit's log of 2026-11-16). A late run of `none` misses it, so use short runs near an obstacle.
- The first actions of each course in the kit's own proof, seed 1 (`proofs/runner/r01.json` to `r06.json`):

| Level | First actions of the proof |
| --- | --- |
| `r01` | `none*135`, `jump`, `none*139`, `jump` |
| `r02` | `none*135`, `jump`, `none*116`, `jump` |
| `r03` | `none*128`, `jump`, `none*111`, `jump` |
| `r04` | `none*128`, `jump`, `none*100`, `jump` |
| `r05` | `none*127`, `jump`, `none*101`, `jump` |
| `r06` | `none*128`, `jump`, `none*79`, `jump` |

- A hand play of `r01` in the kit's log won at tick 687 with `none*125`, `jump`, `none*32`, `none*113`, `jump`, `none*32`, `none*124`, `jump`, `none*32`, `none*226`. It took fewer candles than the proof, so its hash differs from the proof's. Treat these numbers as a start. Check `legal` and `observe` as you go.

## Checking a new commit

Three more tools come from the server `playcheck-commits`. They are not game tools.

- `kit_commit`: no input. It gives `hash` (the full commit hash of the kit), `subject`, `stored` (the hash that `mark_checked` stored last, or `null`) and `changed`.
- `kit_proof`: input `game` and optional `level`. With a level it gives `replay`, the proof replay of the kit for that level. With no level it lists the levels of the game that have a proof. Names hold only letters, digits and hyphens. Any other name is refused.
- `mark_checked`: input `hash` and `result`, a one line text. It stores the hash. After that `kit_commit` gives `changed` false for it.

The steps:

1. Call `kit_commit`. If `changed` is false, report `no new commit` with the `hash`, and stop. Do not call another tool.
2. If `changed` is true, call `kit_proof` with `game` `garden` and again with `game` `runner`, with no level, to get the levels.
3. For each level of both games, call `kit_proof` with the game and the level. Call `replay` with that `replay` object and no `save`, on the `replay` tool of the same game. The garden tool takes the garden replays. The runner tool takes the runner replays. The answer is `ok`, `finalHash` and `finalPhase`.
4. Compare `finalHash` and `finalPhase` of the answer with those of the proof. Write one line for each level: the game, the level, `match` or `mismatch`, and both hashes. An error answer is reported as an error and counts as a mismatch.
5. Play garden `g01` and runner `r01` by hand through `new_game` and `act`, and report them as in "Report".
6. Call `mark_checked` with the `hash` from step 1 and a one line result, for example how many levels matched and how many did not. Do this once, last.

A replay that does not match is a result that does not match the rules. The proof is the kit's own record, made by its prover. You cannot say from here which side is wrong, so report both hashes.
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

Save a replay only for a result that does not match the rules. Call `replay` with `session` and `save` true. It writes one file in the game folder under `tests/replays/`. Give the file name from the answer. That file and the state file of `mark_checked` are the only files a run may write.

## Never

- Never say a level is fine unless it reached `won` in this session.
- Never name an action text from memory. Copy it from `legal`.
- Never edit a game file.
