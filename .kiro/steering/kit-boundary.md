---
inclusion: always
---
# Kit boundary

This repository holds one Kiro Crew app. It does not hold the kit. The kit lives in its own repository, which the README calls `<KIT_REPO>`.

## Folders
| Folder or file | Holds |
| --- | --- |
| `app.json` | The Crew manifest. One file at the root |
| `agents/` | The agent file |
| `skills/playcheck/` | The skill folder with `SKILL.md` |
| `tools/` | `check-manifest.mjs` and its test. Plain Node, no dependency |
| `docs/` | `kiro-log.md` |
| `.kiro/` | Steering and specs |
| `README.md`, `LICENSE`, `package.json`, `.gitignore` | Repository files |

## Rules
- The kit repository is read only. Never write there. Read from it only to check a fact.
- The app copies no kit code. It starts the kit's built server `kit/mcp/dist/server.js` and nothing else from the kit.
- The app calls only the five tools of the tool door: `new_game`, `act`, `observe`, `render`, `replay`.
- The app adds no game code and no dashboard page.
- A new dependency needs its licence written in the task's log row. Only MIT, BSD, ISC or Apache 2.0 licences are allowed. The first version has none.
- A task changes only the files it lists.
- Write every text file as UTF-8 with no byte order mark and with LF line endings. On Windows, do not write files with PowerShell `Set-Content` or `Out-File`.
