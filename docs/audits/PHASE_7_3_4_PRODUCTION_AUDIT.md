# Phase 7.3.4 Production Audit

Phase 7.3.4 is release-candidate hardening based on `83fdf1a90b64d1d596e78775af21d4911ae80784`. It does not approve production rollout or native Expo work.

The branch removes generic Consignment Pack progress, centralizes stage-aware Order problems, retires SKU-group mutations, completes manual Order Assembly plans, makes grouped reads projection-read-only, bounds group member loading, adds catalog field authority, database runner leases, safe Order reimport conflicts, explicit permission flags, durable public-endpoint throttles, and dry-run operational repair tools.

Temporary audit receipts live under `.codex-tmp/production-audit/` and are untracked. The complete local automated matrix, additive migration smoke tests, one 76-page production build and `npm audit --omit=dev` (zero vulnerabilities) passed on 2026-07-18. Production remains blocked on GitHub review/CI, six-width browser QA, sanitized two-worker warehouse QA, copied-database migration rehearsal and production-computer performance verification.

No Expo, Android, APK/AAB, deployment, real-database reset or real-data import belongs to this phase.

The permission policy is frozen as: role is a compatibility/display category; explicit capability flags authorize worker actions; OWNER is the only full bypass. Existing PICKER and PACKER behavior is preserved by an additive data migration that sets their formerly implied flag.

Projection rebuilds are administrative operations. Worker queue, summary, scanner and Details reads only inspect projection state. Normal mutations refresh affected cohorts; explicit rebuild is bounded to active tasks plus at most 10,000 recent completed support records.

Meesho Daily Orders and Amazon Daily Orders are disabled capabilities. Their compatibility/review tools must not create production work that is invisible to Work Hub.

## Synthetic load evidence

The temporary SQLite benchmark used 30,000 active tasks, 500 active groups and 100,000 completed historical tasks. Queue reads returned 25 cards, Details returned 50 members, active counts remained exactly 30,000, and normal reads performed no rebuild. Across 20 measured queue reads on the review computer, p50 was 188.8 ms, p95 was 219.5 ms and maximum-memory evidence was 207.9 MiB heap. The grouped queue used the projection pagination index; durable receipts used their unique replay index. These timings are local evidence, not production-computer proof.

## Explicitly unpassed or unavailable gates

- The in-app browser runtime was unavailable in this session, so 360/390/430/768/1024/1440 browser QA remains unpassed.
- No disposable PostgreSQL server or `psql` runtime was installed. PostgreSQL schema validation and SQL migration parity passed; PostgreSQL runtime migration did not run.
- No installed Codex Security deep-scan capability was exposed. Full-content inventory scanning, secret/path/conflict-marker scanning, mutation-policy tests, authorization suites and the npm advisory audit ran, but are not represented as that product scan.
- Sanitized two-worker warehouse QA and copied real-database migration rehearsal remain manual gates.
