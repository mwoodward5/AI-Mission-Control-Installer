# AI Mission Center / V2

Local-first Windows command center for Codex, Ollama, LM Studio, ChatGPT, Perplexity, Claude, and Gemini.

This is now **V2: one-window ComputerPlexity control** (single command transcript interface).

- One large composer + chat window.
- Auto route: local-first, then Perplexity/ChatGPT/Claude/Gemini as needed.
- Browser workflow is safe and visible: opens normal tabs, copies prompts, and stores artifacts.
- No unlimited AI promises.
- Ticket, system, model, and browser artifacts are saved locally.

## Folder layout

- `C:\AICommandCenter`
- `C:\AICommandCenter\app` Vite React app
- `C:\AICommandCenter\tickets` ticket JSON artifacts
- `C:\AICommandCenter\repos` repos the router can act on
- `C:\AICommandCenter\outputs` responses, logs, and prompt artifacts
- `C:\AICommandCenter\outputs\chats` chat transcripts
- `C:\AICommandCenter\outputs\provider-prompts` browser handoff prompts
- `C:\AICommandCenter\outputs\provider-responses` pasted provider answers
- `C:\AICommandCenter\outputs\media` media captures
- `C:\AICommandCenter\scripts` PowerShell + browser agent scripts

## Run local app

```powershell
cd C:\AICommandCenter
npm install
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-dashboard.ps1
```

Then open:

```text
http://localhost:5173
```

## Workflow

1. Type or dictate one mission in the single composer.
2. Router selects local, Perplexity, ChatGPT, Claude, or Gemini.
3. Ticket saves automatically under `C:\AICommandCenter\tickets`.
4. Browser providers open in normal tabs with prompts copied to your clipboard.
5. Paste provider answers directly into the inline `Paste provider answer` area.
6. All outputs are persisted in the configured `outputs` folders.

## Files updated for V2

- `app/src/main.tsx` -> renders `ComputerPlexityApp`.
- `app/src/ComputerPlexityApp.tsx` -> new single-window interface.
- `app/vite.config.ts` -> adds:
  - `POST /api/mission-control/agent-run`
  - `POST /api/mission-control/save-chat`
  - `POST /api/mission-control/save-provider-response`
  - `POST /api/mission-control/browser-run`
- `scripts/browser-agent.mjs` -> safe browser handoff helper.
- `scripts/open-browser-provider.ps1` -> improved prompt/prompt-file open path and large prompt handling.

## Safety rules

- Never save/export cookies.
- Never save passwords.
- Never bypass logins/captchas.
- Never delete models or repos automatically.
- Dangerous commands are shown as planned/asked-first by existing safe scripts.