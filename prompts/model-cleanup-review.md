# Model Cleanup Review Prompt

Use this after running the model scan and benchmark scripts.

```text
Review my local AI model inventory and benchmark outputs.

Inputs:
- C:\AICommandCenter\outputs\MODEL-CLEANUP-PLAN.md
- C:\AICommandCenter\outputs\MODEL-BENCHMARKS.md
- C:\AICommandCenter\models\model-registry.json

Rules:
- Do not delete anything automatically.
- Do not assume Gemma is bad; judge by benchmark usefulness.
- Prefer a small clean model set over hoarding duplicate models.
- Keep at least one coding model, one fast helper, one general model, and one writing/instruct model if available.

Output categories:
1. KEEP
2. OPTIONAL KEEP
3. ARCHIVE
4. DELETE CANDIDATE
5. REPLACE WITH BETTER MODEL

Final output:
- A simple keep/delete recommendation table
- Exact safe manual commands only if I approve deletion later
- No destructive action by default
```
