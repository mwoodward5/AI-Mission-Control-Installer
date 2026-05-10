# AI Mission Control Smoke Test

Use this after every pull or big change.

## 1. Pull and install

```powershell
cd C:\AICommandCenter
git pull --ff-only
powershell -NoProfile -File .\install-local.ps1
```

## 2. Start dashboard

```powershell
powershell -NoProfile -File C:\AICommandCenter\scripts\launch-dashboard.ps1
```

Open:

```text
http://localhost:5173
```

## 3. Confirm the simple UI

You should see one main mission box, not the older multi-panel admin dashboard.

Expected main buttons:

- Run smart route
- Dictate mission
- Force local first
- Force Perplexity
- Force ChatGPT
- System check
- Model scan
- Benchmark

## 4. Run local checks

Click:

1. System check
2. Model scan
3. Benchmark

Expected result:

- Output appears in Execution trail
- Files appear under `C:\AICommandCenter\outputs` and `C:\AICommandCenter\logs`

## 5. Test browser provider flow

Type:

```text
Research the best current local coding model for Ollama and give me a short recommendation with citations.
```

Click:

```text
Run smart route
```

Expected:

- It routes to Perplexity
- It opens a normal Perplexity browser tab
- Prompt is copied to clipboard
- No cookies/passwords/tokens are touched

## 6. Test ChatGPT route

Type:

```text
Fix the Vite React TypeScript dashboard build and give me exact Codex steps.
```

Click:

```text
Run smart route
```

Expected:

- It routes to ChatGPT
- It opens a normal ChatGPT browser tab
- Prompt is copied to clipboard

## 7. Test local route

Type:

```text
Scan my repo locally and summarize the package.json and likely build command.
```

Click:

```text
Force local first
```

Expected:

- It saves a ticket
- It copies a local-first prompt
- It does not open paid browser AI

## 8. Final validation

Run:

```powershell
cd C:\AICommandCenter\app
npm run build
```

Pass condition:

```text
Build completes without TypeScript errors.
```
