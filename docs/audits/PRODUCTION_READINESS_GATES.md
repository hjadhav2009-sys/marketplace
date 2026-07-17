# Production Readiness Gates

1. GitHub review of Phase 7.3.4 and passing PR CI.
2. Complete local validation, migration smoke tests, one production build and npm advisory audit.
3. Browser QA at 360, 390, 430, 768, 1024 and 1440 pixels with synthetic data.
4. Sanitized two-worker QA for every route, problems, assignment, retries and duplicate clicks.
5. Copied-database migration rehearsal and before/after verification.
6. Medium-or-larger performance verification on production-class hardware.
7. Backend/API contract freeze before fully native Expo work.

Unrun gates must never be reported as passed. PostgreSQL schema validation is not PostgreSQL runtime validation.

The Codex Security deep-scan capability must be reported as unavailable if it is not installed; local source-policy, secret/path, dependency and authorization scans are evidence but must not be mislabeled as that product scan.
