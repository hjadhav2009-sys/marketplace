# Test, validation, and QA history

Parser and validation suites cover Meesho, Flipkart, Amazon, import progress, marking, consignments, workflows, scanning, assembly, and source-policy constraints. Migration smoke tests apply migrations to fresh and existing-style disposable SQLite databases. Integration tests cover claims, problems, resolution, assignment, duplicates, stage unlocking, completion, and cross-account rules.

Phase 7 adds a permission matrix, security checks, contention tests, real resolver benchmark, and query plans. Test reporting must distinguish generator capacity from executed scale, representative queries from exhaustive plans, and increment contention from other action coverage.

Phase 7.1 adds real-database safety source tests and copied migration verification. The fresh-start checkpoint adds migration-complete synthetic reset tests and real-command refusal tests. Manual browser, warehouse, login, empty-state, restore, and stronger-hardware performance checks remain mandatory.
# Phase 7.3.4 amendment

Synthetic regression coverage now includes Pack bypass rejection, stage-aware Order problems, 30,000 active tasks, a paginated 4,000-member group, independent history pagination, import crash recovery, account lifecycle, throttling and retention dry-run safety. Manual browser and two-worker QA remain separate gates.
