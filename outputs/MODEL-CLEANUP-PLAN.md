# AI Mission Center Model Cleanup Plan

Generated: 2026-05-10 03:57:31
Scanned models: 7

## KEEP
- qwen3-vl:8b (Ollama): Recommended local lane model for this stack.
- deepseek-r1:8b (Ollama): Recommended local lane model for this stack.
- qwen3.5:latest (Ollama): Recommended local lane model for this stack.

## OPTIONAL KEEP
- gemma4:31b (Ollama): Useful fallback model for tiny tasks.

## ARCHIVE


## DELETE CANDIDATE
- gpt-oss:20b (Ollama): Model did not match recommended lanes yet. Benchmark before manual prune.
- devstral-small-2:latest (Ollama): Model did not match recommended lanes yet. Benchmark before manual prune.
- nomic-embed-text:latest (Ollama): Model did not match recommended lanes yet. Benchmark before manual prune.

## REPLACE WITH BETTER MODEL


## Duplicate groups


## Safety note
- No models are deleted by this script.
- Run your own judgment pass before deleting anything.
