---
inclusion: always
---
# Claims policy

- Never invent evidence, test output, measurements, transcripts or user feedback. If a check did not run, say that it did not run.
- Say that Kiro did a piece of work only when Kiro did it in this repository.
- A statement about speed, privacy or accessibility needs a recorded check with a named tool. Without that record it is a target.
- A transcript in the README or the log is pasted from a real run, with its date and level. A run that was not made gets no transcript.
- Never weaken a test to make it pass. Keep the failing case and report it.
- Use no field in `app.json`, in an agent file or in a skill file that is not shown on the Kiro Crew pages named in `product.md`. If a field is needed and not shown, write it down in the log as an open question and stop.
- Add one row to `docs/kiro-log.md` for each finished task, on the same day. Leave the Credits cell empty. Kiro cannot read its own credit use. The owner fills that cell from the usage page.
- Name a hook in a demo or a write up only after it was seen to fire and the log records when.
