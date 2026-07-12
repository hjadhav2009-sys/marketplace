# Phase 7 Performance And QA Plan

Phase 7 validates the website/backend before native Expo work. It does not modify `mobile-app`, add WebView, inventory, ERP, EngravingBrain, or a Worker Agent.

## Test Method

- Machine: Intel Core i3-7020U 2.30 GHz, 4 logical CPUs, about 11.9 GiB RAM, Windows 10 build 19045, Node 25.8.1.
- Generated data is fake and written only below ignored `.codex-tmp/`.
- Presets: small (2 accounts, 5,000 listings, 1,000 tasks), medium (10/100,000/5,000), large (20/800,000/10,000), full (20/800,000/12,000).
- The resolver benchmark includes account authorization, order and identifier lookup, snapshot lookup, task loading, assignment priority, candidate construction, and sorting.
- SQLite plans are checked with `EXPLAIN QUERY PLAN`. An exact-match table scan fails the test.
- Concurrency uses fake temporary databases and duplicate request levels 2, 5, 10, and 20.

## Readiness Criteria

- Warm common scans below 250 ms and warm p95 below 500 ms on the owner PC.
- Cold exact scans below 1,000 ms.
- No unindexed exact lookup in the reviewed query set.
- No raw database error reaches workers during tested retries.
- Imports remain bounded by file, archive, worksheet, row, column, cell, and aggregate reparse limits.
- Permissions are checked in navigation, pages/actions, account scope, and mutations.
- All automated suites, one production build, and startup smoke test exit successfully.

Browser and real warehouse interaction remain explicit manual gates in `QA_PHASE_7_BROWSER.md` and `WAREHOUSE_WORKER_QA.md`.
