# Cost Savings Workflow

Goal: use local models first and only use paid browser routes when needed.

## Routing rule

- Repo scan, file summaries, dependency maps, first-pass plans, log review, cheap edits: `Local Ollama/LM Studio`
- Live web research, citations, vendor comparisons: `Perplexity`
- High quality UI/product architecture or coding design: `ChatGPT`
- Careful rewrite/refactor or cleanup: `Claude/Sonnet`
- Long context pass or huge docs: `Gemini`

## Ticket behavior

- Every ticket has a provider badge and routing state.
- `🧠 choosing provider` shows first routing action.
- `💸 avoiding cloud tokens` appears when a local route is selected.

## Review

- Dashboard keeps an estimated savings counter.
- This is directional only and does not claim real invoice totals.
