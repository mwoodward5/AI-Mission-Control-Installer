# Provider Routing Rules

## Local-first local engines

- `Local Ollama/LM Studio` for:
  - Repo scan
  - file summaries
  - dependency maps
  - first-pass plans
  - log review
  - simple code edits
  - cheap draft work

## Browser engines

- Perplexity Max
  - current web research
  - citations
  - comparisons
  - vendor/model analysis
  - orchestration with latest links
- ChatGPT Pro/Max
  - coding/design reasoning
  - media/image/video prompts
  - deep debugging
  - system architecture
- Claude/Sonnet
  - careful editing
  - repo cleanup
  - long refactor reasoning
- Gemini
  - huge context
  - long files
  - multimodal review
- OpenClaw
  - long-form browser-oriented copy tasks and lightweight landing-page ideation when available

## Workflow

1. Route ticket in local-first queue.
2. Generate provider prompt.
3. Open provider in browser (existing logged-in session).
4. Paste/copy prompt.
5. Wait and paste answers back to local ticket context.
