# Phase 7.3.5 recovery correctness audit

This branch repairs the state-rewind, fail-open projection, account lifecycle, explicit mobile permission, import lease, archive-budget, catalog provenance, idempotency, reimport, throttle, worker-route, lazy-image and retention findings confirmed after Phase 7.3.4.

The committed JSONL manifest records a deterministic path/size/range/SHA-256 integrity inventory without source content. Its own receipt uses an explicit self-reference marker because a file cannot contain its own final cryptographic hash. It proves inventory and byte-hash coverage for the tree from which it was generated, not completed semantic review coverage; semantic audit evidence is recorded separately and current hashes must be regenerated after tracked-file changes.

Production remains gated on independent GitHub review, real browser checks at all six widths, sanitized two-worker warehouse QA, copied-database migration rehearsal, production-computer performance testing, and backend/API contract freeze. No Expo, Android, deployment, real-database reset, or real-data mutation is part of this phase.
