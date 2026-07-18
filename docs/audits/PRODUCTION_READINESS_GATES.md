# Production Readiness Gates

1. GitHub review of the Phase 7.3.6 Release Candidate and a passing RC workflow on the final pushed commit.
2. Complete local RC validation, disposable migration smoke tests, one production build and npm production-dependency advisory audit.
3. Browser QA at 360, 390, 430, 768, 1024 and 1440 pixels with synthetic data.
4. Sanitized two-worker QA for every route, problems, assignment, retries and duplicate clicks.
5. Copied-database migration rehearsal and before/after verification, plus a reviewed process-stopped, sidecar-aware SQLite database and matching private-storage backup/restore rehearsal.
6. Medium-or-larger performance verification on production-class hardware.
7. Backend/API contract freeze before fully native Expo work.

Unrun gates must never be reported as passed. PostgreSQL schema validation is not PostgreSQL runtime validation.

The current repository database backup/copy checks do not by themselves provide an approved production restore for SQLite sidecars and matching private storage. Staging/rollout remains blocked until that procedure is implemented, independently reviewed, and rehearsed on disposable data. Raw copying of only the main SQLite file is not an approved rollback.

The historical workflow filename `.github/workflows/phase-7-3-4-audit.yml` is retained so GitHub keeps one workflow history, but its active workflow and job names must identify the Phase 7.3.6 Release Candidate.

`rolling-order-import:test` and `import-privacy:test` currently execute the same underlying test file. Release validation executes that underlying suite once and records both coverages. PostgreSQL schema validation and SQL-parity inspection are not PostgreSQL runtime validation.

`recovery-correctness:test` already executes `security-throttle.test.ts`. CI executes the remaining `phase7-security.test.ts` suite directly instead of repeating the throttle suite; the local release matrix records both aliases and this overlap explicitly.

The Codex Security deep-scan capability must be reported as unavailable if it is not installed; local source-policy, secret/path, dependency and authorization scans are evidence but must not be mislabeled as that product scan.
