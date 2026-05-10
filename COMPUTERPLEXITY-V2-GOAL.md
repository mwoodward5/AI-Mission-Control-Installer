# ComputerPlexity V2 Goal

Paste this into local Codex. This replaces the wrong dashboard shape with the correct one-panel command agent.

```text
/goal

Rebuild the existing Windows AI Mission Control project into the correct ComputerPlexity-style interface and workflow.

Local root:
C:\AICommandCenter

Repo:
https://github.com/mwoodward5/AI-Mission-Control-Installer

Do NOT rebuild from scratch.
Do NOT make a dashboard full of boxes.
Do NOT add separate panels for every tool.
Do NOT restore the old admin dashboard.

The current UI is still wrong because it has too many visible controls. The correct product shape is:

ONE main window:
- top: small status strip
- middle: chat transcript / execution stream
- bottom: one big chat input
- one microphone button
- one Go/Send button
- optional tiny gear icon for advanced settings

Hide everything else behind the agent. No visible System Check boxes. No Model Scan boxes. No Benchmark boxes. No Local Repo panel. No big activity card wall. The user should not have to think about providers.

Core behavior:
1. User types or dictates one mission.
2. User clicks Go.
3. The router decides silently:
   - local Ollama/LM Studio first for cheap repo scan, summaries, logs, simple planning
   - Perplexity browser for fresh web research/citations/comparisons
   - ChatGPT browser for coding/design/architecture/debugging/media strategy
   - Claude browser for cautious writing/refactors/docs if available
   - Gemini browser for long context/multimodal if available
4. The system shows simple stream messages like:
   - Thinking...
   - Checking local model...
   - Opening Perplexity...
   - Running prompt...
   - Reading answer...
   - Preparing local action...
   - Done.
5. The answer comes back into the same chat transcript.
6. If local code action is needed, create exact Codex/local terminal steps.

Important browser automation rules:
- Use only the user's normal logged-in browser session.
- Do not steal cookies.
- Do not save passwords.
- Do not bypass logins.
- Do not bypass captchas.
- Do not bypass platform limits.
- Do not hide what is happening.
- It may open a visible controlled browser window/tab.
- If login/captcha/approval is needed, pause and ask user to complete it.
- Capture only visible allowed output from the page.

Implementation target:
Add a local browser agent bridge using Playwright or Chrome DevTools Protocol.
Prefer Playwright if easiest.
Add dependencies only if needed.

Expected files to create/improve:
- app/src/ComputerPlexityApp.tsx
- app/src/main.tsx
- app/vite.config.ts
- scripts/browser-agent.ps1 or scripts/browser-agent.mjs
- scripts/launch-dashboard.ps1
- scripts/check-system.ps1
- scripts/open-browser-provider.ps1
- README.md
- SMOKE-TEST.md

UI requirements:
- Replace SimpleApp render with ComputerPlexityApp render.
- Remove visual clutter.
- Hide advanced tools behind a small gear or collapsed debug drawer.
- Default screen must look like a premium AI chat/terminal hybrid:
  - dark background
  - clean centered transcript
  - single composer at bottom
  - mic button
  - send button
  - status dot
  - provider/router label only when active

Browser provider flow:
When route is Perplexity or ChatGPT:
1. Save prompt to C:\AICommandCenter\outputs\provider-prompts\*.txt
2. Open provider in a visible browser tab using existing logged-in session.
3. Paste prompt into input.
4. Do not auto-submit if the provider page appears to require login, captcha, or user approval.
5. If safe and input is ready, submit the prompt.
6. Wait for answer to finish.
7. Read visible answer text.
8. Save response to C:\AICommandCenter\outputs\provider-responses\*.txt
9. Return response into the UI chat transcript.

If full browser automation is not possible in one pass:
- still create the one-panel UI
- still create the bridge endpoint contract
- still save prompt files
- still open provider tabs
- still add a Paste Answer button hidden in debug drawer as fallback
- clearly mark browser automation status as Partial instead of pretending it works

Bridge endpoints to add or improve:
- POST /api/mission-control/agent-run
  input: { message: string, mode?: 'auto'|'local'|'perplexity'|'chatgpt' }
  output: { ok, route, messages, response, artifacts }
- GET /api/mission-control/health
- POST /api/mission-control/browser-run
- POST /api/mission-control/save-chat

Local action safety:
- Never delete repos.
- Never delete models.
- Never overwrite .env.
- Never force push.
- Never expose API keys.
- For dangerous local commands, return a proposed command and ask before execution.

Validation:
1. npm install
2. npm run build
3. Start localhost on 5173
4. Confirm only one main chat interface is visible
5. Test microphone inserts text into the single composer
6. Test local route with: Scan C:\AICommandCenter locally and summarize the app structure.
7. Test Perplexity route with: Research the latest best local coding models for Ollama with citations.
8. Test ChatGPT route with: Review this Vite React app and recommend the smallest UI simplification patch.
9. Confirm prompts are saved under outputs/provider-prompts
10. Confirm responses, if captured, are saved under outputs/provider-responses
11. Confirm chat transcript persists locally

Final response must say:
- one-panel UI active: yes/no
- browser automation: full/partial/manual fallback
- ChatGPT route: pass/fail
- Perplexity route: pass/fail
- microphone: pass/fail
- npm build: pass/fail
- files changed
- exact command to start tomorrow

Do not stop after adding more buttons. The goal is to remove buttons and make it feel like Perplexity Computer / Codex chat.
```
