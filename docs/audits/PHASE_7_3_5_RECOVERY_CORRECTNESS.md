# Phase 7.3.5 recovery correctness audit

This branch repairs the state-rewind, fail-open projection, account lifecycle, explicit mobile permission, import lease, archive-budget, catalog provenance, idempotency, reimport, throttle, worker-route, lazy-image and retention findings confirmed after Phase 7.3.4.

The committed JSONL manifest records deterministic full-file ranges and SHA-256 values without source content. Its own receipt uses an explicit self-reference marker because a file cannot contain its own final cryptographic hash. The manifest is evidence of inventory and completed review coverage; it is not represented as proof of semantic correctness by itself.

Production remains gated on independent GitHub review, real browser checks at all six widths, sanitized two-worker warehouse QA, copied-database migration rehearsal, production-computer performance testing, and backend/API contract freeze. No Expo, Android, deployment, real-database reset, or real-data mutation is part of this phase.
