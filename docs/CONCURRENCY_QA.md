# Concurrency QA

The workflow uses guarded expected state, assignment checks, request fingerprints, unique action-log keys, and transactional writes.

Phase 7 found that high duplicate SQLite contention could surface socket timeouts. The shared task service now:

- checks idempotent replays without opening an unnecessary read transaction;
- retries transient lock, socket-timeout, transaction-conflict, and unique-replay races with bounded backoff;
- returns a safe `Work is busy; retry the action.` message after exhaustion.

Automated duplicate request levels 2, 5, 10, and 20 mutate quantity once and create one action log. Existing suites separately cover competing claims, customer shipment packing, assembly claim/complete/problem replay, activation replay, payload mismatch, cross-worker request IDs, and removed-account rejection.
