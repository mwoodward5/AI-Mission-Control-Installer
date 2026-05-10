# AI Mission Control

Local-first Windows command center for Codex, Ollama, LM Studio, ChatGPT browser, Perplexity browser, Claude browser, and Gemini browser.

This is **not** a toy dashboard and it does **not** promise free unlimited AI.

It is a practical router:

- Local models do cheap scanning, summaries, repo maps, first drafts, log review, and simple patch planning.
- Browser AI is used only when the task actually needs current web research, citations, polished design reasoning, media prompting, or complex architecture.
- Codex/local terminal applies code, runs builds, tests, Git, and deployment prep.

## Current UI direction

The active dashboard is now the simplified **one-box Computer Task style UI**:

```text
Type or dictate one mission
→ Mission Control chooses local / Perplexity / ChatGPT / Claude / Gemini
→ Prompt is saved to a ticket
→ Browser tab opens only when needed
→ Execution trail shows what happened
```

## Folder layout

- `C:\AICommandCenter`
- `C:\AICommandCenter\app` Vite dashboard
- `C:\AICommandCenter\tickets` queued ticket artifacts
- `C:\AICommandCenter\repos` local repos to operate on
- `C:\AICommandCenter\outputs` command outputs and reports
- `C:\AICommandCenter\outputs\media` media captures and generated assets
- `C:\AICommandCenter\outputs\provider-prompts` browser-provider prompt files
- `C:\AICommandCenter\models` model inventory files
- `C:\AICommandCenter\logs` diagnostic snapshots
- `C:\AICommandCenter\scripts` PowerShell scripts
- `C:\AICommandCenter\backups` manual backup copies

## Install/update

```powershell
cd C:\AICommandCenter
git pull --ff-only
powershell -NoProfile -File .\install-local.ps1
```

Fresh clone:

```powershell
git clone https://github.com/mwoodward5/AI-Mission-Control-Installer.git C:\AICommandCenter
cd C:\AICommandCenter
powershell -NoProfile -File .\install-local.ps1
```

## Start

```powershell
powershell -NoProfile -File C:\AICommandCenter\scripts\launch-dashboard.ps1
```

Then open:

```text
http://localhost:5173
```

## Main workflow

1. Type or dictate one mission.
2. Click **Run smart route**.
3. The router chooses local, Perplexity, ChatGPT, Claude, or Gemini.
4. If browser AI is needed, it opens the normal browser tab and copies the prompt.
5. You run/approve the browser AI normally using your own logged-in session.
6. Bring the result back to Codex/local terminal for execution.

## Safety rules

The system must not:

- Save cookies
- Save passwords
- Bypass logins
- Bypass captchas
- Expose API keys
- Overwrite `.env`
- Delete models automatically
- Delete repos automatically
- Force push

## Useful files

- `INSTALL.md` — plain-English install steps
- `SMOKE-TEST.md` — five-minute working check
- `FINAL-CODEX-GOAL.md` — final local Codex activation prompt
- `prompts/` — reusable provider prompt templates
