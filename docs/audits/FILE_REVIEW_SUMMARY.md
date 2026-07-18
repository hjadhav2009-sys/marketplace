# File Review Summary

The committed audit manifest is a path/byte/range/SHA-256 integrity inventory. Its current-tree test recomputes each tracked non-self hash and validates the manifest generator; this establishes byte-level coverage, not semantic correctness or completed human review.

Semantic findings and supporting write-path, route, API and test maps are maintained separately under ignored `.codex-tmp` audit storage while work is in progress. They are not implied by the committed integrity inventory. The final report must distinguish file-integrity coverage from semantic review evidence and must not claim either against stale hashes.

Binary assets are classified separately. Generated history is format, secret, absolute-path and duplication scanned and its generator validated.
