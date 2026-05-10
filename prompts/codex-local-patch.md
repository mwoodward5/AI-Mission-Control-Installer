# Codex Local Patch Prompt

Use this when Mission Control routes a task back to local Codex/terminal for actual file edits, builds, tests, Git, and deployment prep.

```text
/goal

Continue the existing project at:
C:\AICommandCenter

Do NOT rebuild from scratch.
Do NOT change unrelated visual design.
Do NOT delete repos, models, tickets, outputs, logs, or .env files.

Task:
{{TASK}}

First inspect:
- package.json
- app/src
- scripts
- vite.config.ts
- current Git status

Then perform the smallest safe patch.

Safety rules:
- Show dangerous commands before running.
- Never force push.
- Never overwrite .env.
- Never save cookies/passwords/tokens.
- Backup before broad file edits.

Validation:
- npm install only if needed
- npm run build
- run relevant PowerShell script check if changed
- git status

Final response:
- files changed
- what passed
- what failed
- how to run it
- exact next command for user
```
