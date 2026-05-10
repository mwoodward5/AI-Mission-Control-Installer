# Final Local Codex Activation Goal

Paste this into local Codex on the Windows machine.

```text
/goal

Finish and activate the existing AI Mission Control project on this Windows machine.

Repository:
https://github.com/mwoodward5/AI-Mission-Control-Installer

Local root:
C:\AICommandCenter

Do NOT rebuild from scratch.
Do NOT restore the old multi-panel admin dashboard.
The intended UI is the new one-box Computer Task style dashboard:
- one large mission prompt
- one dictate mission button
- smart local/browser router
- execution trail
- small quick checks only

First inspect the current local repo and pull the latest main branch if it is safe to do so.
If the local folder does not exist, clone the repository into C:\AICommandCenter.

Inspect these files:
- README.md
- INSTALL.md
- SMOKE-TEST.md
- install-local.ps1
- scripts/launch-dashboard.ps1
- app/package.json
- app/vite.config.ts
- app/src/main.tsx
- app/src/SimpleApp.tsx
- scripts/open-browser-provider.ps1

Expected state:
1. app/src/main.tsx imports and renders SimpleApp from ./SimpleApp.tsx.
2. app/src/SimpleApp.tsx is the active one-box UI.
3. app/vite.config.ts exposes the local mission-control bridge endpoints.
4. scripts/open-browser-provider.ps1 supports prompt files for large copied prompts.
5. Runtime data is not committed: tickets, outputs, logs, models, backups, or .env files.

Run validation:
- install-local.ps1
- npm run build inside C:\AICommandCenter\app
- launch-dashboard.ps1

If build fails, fix only the smallest TypeScript, React, or Vite issues needed.
Do not redesign.
Do not restore the old UI.

Smoke test in the browser:
1. Confirm the old ticket/admin-grid UI is gone.
2. Confirm one big mission box appears.
3. Run System check.
4. Run Model scan.
5. Run Benchmark.
6. Type: Scan my repo locally and summarize likely build commands.
7. Click Force local first.
8. Confirm a ticket JSON is saved under C:\AICommandCenter\tickets.
9. Type: Research the current best local coding models for Ollama with citations.
10. Click Run smart route.
11. Confirm it routes to Perplexity, opens a normal browser tab, and copies a prompt.
12. Type: Fix this React/Vite app if the build fails and give me exact patch steps.
13. Click Force ChatGPT.
14. Confirm it opens ChatGPT and copies a prompt.

Safety rules:
- Do not save cookies.
- Do not save passwords.
- Do not bypass logins.
- Do not bypass captchas.
- Do not expose API keys.
- Do not overwrite .env.
- Do not delete models.
- Do not delete repos.
- Do not force push.
- Show dangerous commands before running them.

Final response must include:
- latest commit inspected
- build pass/fail
- exact files changed locally, if any
- whether one-box UI is active
- whether bridge health endpoint works
- whether provider prompt copying works
- whether Perplexity/ChatGPT open normal browser tabs
- where tickets are saved
- where outputs are saved
- exact command to start the dashboard tomorrow
```
