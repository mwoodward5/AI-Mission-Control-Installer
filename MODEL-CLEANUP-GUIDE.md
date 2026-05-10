# Model Cleanup Guide

Use this guide with `scripts\check-models.ps1`.

## Labels

- `KEEP`
  - Keep and use in routing
- `OPTIONAL KEEP`
  - Useful but can be removed later
- `ARCHIVE`
  - Move out of always-loaded local set
- `DELETE CANDIDATE`
  - Weak duplicates or small helpers to verify removal first
- `REPLACE WITH BETTER MODEL`
  - Keep better variant only after manual review

## Safe process

1. Run `check-models.ps1`.
2. Read `outputs\MODEL-CLEANUP-PLAN.md`.
3. Review any `DELETE CANDIDATE` or `ARCHIVE` with human approval.
4. Never delete from script.
5. Remove or archive models manually after approval.
