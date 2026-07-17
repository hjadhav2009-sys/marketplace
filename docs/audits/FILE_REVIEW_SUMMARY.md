# File Review Summary

The per-file evidence is generated into `.codex-tmp/production-audit/file-inventory.jsonl`. It records path, type, size or lines, subsystem, generated/asset classification, review passes, sensitivity, findings, deterministic large-file ranges and final status.

Supporting maps cover findings, write paths, routes, APIs and tests. They are regenerated after the final tracked-file set is known. The final report compares `git ls-files` with completed receipts; any difference means the audit is incomplete.

Binary assets are classified separately. Generated history is format, secret, absolute-path and duplication scanned and its generator validated.
