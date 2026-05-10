# AI Mission Control Install Guide

This is the simple Windows install path for AI Mission Control.

## What this does

AI Mission Control runs locally on your Windows PC at:

```text
C:\AICommandCenter
```

It uses localhost for speed and machine access. Browser AI providers are opened only as normal logged-in browser tabs.

## Requirements

Install these first:

1. Node.js
2. npm
3. Git
4. PowerShell 7 recommended
5. Optional: Ollama
6. Optional: LM Studio

## Install or update

Open PowerShell and run:

```powershell
cd C:\AICommandCenter
git pull --ff-only
powershell -NoProfile -File C:\AICommandCenter\install-local.ps1
```

If the folder does not exist yet:

```powershell
git clone https://github.com/mwoodward5/AI-Mission-Control-Installer.git C:\AICommandCenter
cd C:\AICommandCenter
powershell -NoProfile -File .\install-local.ps1
```

## Start the dashboard

```powershell
powershell -NoProfile -File C:\AICommandCenter\scripts\launch-dashboard.ps1
```

Then open:

```text
http://localhost:5173
```

## How to use it

1. Type or dictate one mission into the main box.
2. Click **Run smart route**.
3. The app chooses local, Perplexity, ChatGPT, Claude, or Gemini.
4. If browser AI is needed, it opens a normal logged-in browser tab and copies the prompt.
5. Paste/run the prompt yourself.
6. Bring the answer back to local Codex or the dashboard for local action.

## Safety rules

The app must not:

- Save cookies
- Save passwords
- Expose API keys
- Delete models automatically
- Delete repos automatically
- Force push
- Overwrite `.env`

Runtime files stay local and are ignored by Git:

- tickets
- outputs
- logs
- models
- backups
