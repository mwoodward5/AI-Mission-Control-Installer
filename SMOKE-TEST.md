# AI Mission Control V2 Smoke Test

## 1. Build and start

```powershell
cd C:\AICommandCenter\app
npm install
npm run build
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\AICommandCenter\scripts\launch-dashboard.ps1
```

Open:

```text
http://localhost:5173
```

## 2. Validate UI shape

- Confirm one main window: status bar + chat transcript + one large composer.
- Confirm no multi-panels are visible by default.
- Confirm debug drawer is hidden behind the ⚙ button.

## 3. Validate microphone

- Click 🎤 and speak one short phrase.
- Confirm text appears in composer.

## 4. Validate local route

Type:

```text
Scan C:\AICommandCenter locally and summarize what this app does.
```

- Click **Go**.
- Confirm it routes to local.
- Confirm a ticket is written to `C:\AICommandCenter\tickets`.
- Confirm chat transcript is saved under `C:\AICommandCenter\outputs\chats`.

## 5. Validate Perplexity route

Type:

```text
Research the latest best local coding models for Ollama with citations.
```

- Click **Go** (or set provider override to `perplexity` in debug).
- Confirm Perplexity tab opens.
- Confirm prompt copied.
- Confirm prompt file is created under `C:\AICommandCenter\outputs\provider-prompts`.

## 6. Validate ChatGPT route

Type:

```text
Review this Vite React app and give the smallest patch plan to simplify the UI.
```

- In debug set provider override to `chatgpt` and click **Go**.
- Confirm ChatGPT tab opens.
- Confirm prompt copied.

## 7. Validate provider response capture

- Paste a fake response in the inline answer area.
- Click **Save provider answer**.
- Confirm file writes to `C:\AICommandCenter\outputs\provider-responses`.

## 8. Validate system / model actions from debug

In debug drawer:

- Run **System check**.
- Run **Model scan**.
- Run **Benchmark**.

Confirm command output shows in raw terminal output area and artifacts are written to outputs.

## 9. Final pass

```powershell
cd C:\AICommandCenter\app
npm run build
```

Build should pass.