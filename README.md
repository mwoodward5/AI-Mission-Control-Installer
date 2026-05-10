# AI Mission Center

Local-first Windows dashboard for Codex, Ollama, LM Studio, and browser AIs.

This command center is intentionally practical:
- Uses local JSON storage in browser state first.
- Uses local models first for routine coding and analysis.
- Uses browser providers only for tasks that need web search, polished architectural reasoning, media prompting, or high-context review.
- No unlimited free AI claims. Usage remains bounded by your local and provider accounts.

## Folder layout

- `C:\AICommandCenter`
- `C:\AICommandCenter\app` Vite dashboard
- `C:\AICommandCenter\tickets` queued ticket artifacts
- `C:\AICommandCenter\repos` repository references
- `C:\AICommandCenter\outputs` command outputs and reports
- `C:\AICommandCenter\outputs\media` media captures and generated assets
- `C:\AICommandCenter\models` model inventory files
- `C:\AICommandCenter\logs` diagnostic snapshots
- `C:\AICommandCenter\scripts` all PowerShell scripts
- `C:\AICommandCenter\backups` manual backup copies

## How to start

```powershell
powershell -ExecutionPolicy Bypass -File C:\AICommandCenter\scripts\start.ps1
```

Then open `http://localhost:5173`.

## Required workflows

- Use local tasks first in the ticket queue.
- For local patches, choose local provider badges and open terminal scripts.
- For Perplexity or ChatGPT prompts, copy the prepared prompt then open browser tab.
- Paste browser answers back into ticket notes or local action notes as needed.
