# Phase 7.4 implementation sequence

## Working agreement

Implementation is deliberately split into small, reversible chunks. A normal chunk changes 3–8 runtime files and stays below roughly 1,000–1,500 net application lines. If the proof cannot fit, split it before coding. Each chunk gets one intentional commit and must pass its test/browser gate. Do not mix cleanup from neighboring routes.

Business behavior is frozen: no database model/migration, route/action contract, permission, account isolation, workflow transition, import/report semantics, retention/deletion behavior, mobile-app behavior, or synthetic/real-data boundary changes. Any discovered need outside that list stops the chunk for owner direction.

## Phase B — foundation and owner orientation

### B1: tokens and primitives

Scope: CSS/Tailwind token normalization and the smallest shared primitives supported by duplicate usage: button/link-button, fields, feedback banner, surface, metric, normalized status badge, empty state. No route redesign.

Gate: typecheck, lint, primitive tests where practical, detector, keyboard/focus states, contrast review, 390/768/1440 component harness or representative consumers. One commit.

### B2: shell

Scope: `AppShell`, `AppNav`, mobile drawer/account menu/overlay support and at most the directly required primitive files. Group navigation, fix exact current-route ownership, complete keyboard/focus/background semantics, and make header density responsive.

Gate: one `aria-current` for nested owner/worker routes; expanded/collapsed/drawer/account menu at 390/768/1440; Tab/Shift+Tab/Escape/arrows; no overflow; role/capability visibility unchanged. One commit.

### B3: dashboard

Scope: dashboard page plus its data adapter/loading/error presentation and directly used metrics/actions. Recompose as owner command center, correct marketplace/purpose labels, fix 360/390 overflow, and align loading/empty/error states. Do not invent new business metrics.

Gate: populated/empty/error/import-risk states, owner account variants, 360/390/768/1440 measurements, exact action destinations, no document overflow, no console/page/request errors. One commit.

**Owner review gate:** approve foundation, shell, and dashboard before worker routes.

## Phase C — worker operations

### C1: shared work card

Scope: common work-card anatomy and the smallest adapters for `GroupedWorkCard`/`WorkTaskCard`; no stage behavior change.

Gate: source/account/stage/status/quantity/assignment/instructions/actions preserved for order and consignment cards at 390/768/1440; keyboard and long identifier tests. One commit.

### C2: Pick

Scope: Smart Pick, source selection, Pick group/detail and product drawer integration. Preserve route selection and quantity semantics.

Gate: claim/read-only/in-progress/partial/complete/route-choice/conflict/problem states; exact permissions; browser widths. One commit.

### C3: Mark

Scope: Mark projected/legacy queues, marking instructions/assets, and task detail presentation.

Gate: missing/present asset, manual route warning, permission/read-only, partial/complete/problem; original files and snapshots unchanged. One commit.

### C4: Assembly

Scope: Assembly projected/legacy queues and instruction presentation.

Gate: instructions present/missing/manual, locked/ready/in-progress/complete/problem, order/consignment; no invented guidance. One commit.

### C5: Pack

Scope: Pack projected/legacy queues and packing/AWB surfaces.

Gate: prior-stage locks, exact quantities, picked/unpicked shipment state, packed read-only, scanner handoff, conflict/problem. One commit.

### C6: Scanner and Problems

Scope: Universal scanner controls/results/candidate actions and Problems list/resolution/reassignment presentation.

Gate: no-result/multiple/exact/completed/read-only/permission/account mismatch; scan never mutates; status announcements; focus remains stable; problem history and quantities preserved. One commit, or split Scanner and Problems if the runtime-file/line budget is exceeded.

**Owner review gate:** approve worker consistency and operational safety before owner-data routes.

## Phase D — owner data and administration

### D1: Inventory

Scope: product inventory list/filter/pagination/create/edit entry patterns.

Gate: long identifiers, missing image/title/category, marketplace variants, mobile card/desktop comparison, 390/768/1440. One commit.

### D2: Product Details and Missing Data

Scope: product/listing detail, images, marking/process data, missing-data/problem presentation.

Gate: present/partial/missing data, external image failure/retry, identifiers, route rules, safe disclosure. One commit.

### D3: Imports

Scope: imports list/job/mapping/issues and marketplace/purpose entry orientation. Preserve every importer, retained-file, retry, cancel, mapping, and export contract.

Gate: queued/running/mapping/file-role/complete/failed/cancelled/stale states; mobile cards and bounded desktop table; Amazon/Flipkart correctness. One commit, or split list vs job/mapping if over budget.

### D4: Consignments

Scope: batch list/create/import/review/detail/issues/activation presentation.

Gate: draft/validation/blocking/warning/active/completed states, line form density, account/marketplace isolation, activation evidence. One commit, or split review from list/detail if over budget.

### D5: Accounts and Users

Scope: summary list/table and single focused create/edit surfaces; all account, role, capability, assigned-account, active, and password-reset semantics remain intact.

Gate: owner/worker variants, validation/errors, keyboard focus, 390/768/1440, exact permission payload parity. One commit, or split Accounts and Users if over budget.

### D6: Data Management, Reports, and System

Scope: administrative IA and shared status/metric/data-region patterns. Preserve typed phrases, quarantine/restore/purge retention, report data, audit evidence, and production checks.

Gate: destructive flows and disabled conditions, empty/history states, 760 px data region containment, report/system error states. Split into D6a/D6b if the normal file/line budget is exceeded.

**Owner review gate:** approve owner/admin consistency, data safety, and responsive behavior.

## Phase E — focused QA and closure

No broad redesign. Fix only defects found in the accepted B–D surfaces. Run full typecheck/lint/tests/build, detector, protected-path check, browser matrix at 390/768/1440 plus 360 stress cases, keyboard/focus/reduced-motion/contrast review, long-content and empty/error/loading/conflict states, and console/page/request error review. Re-run any business invariants whose presentation changed around a server action.

Phase E ends with an owner evidence review and a separate release decision. It does not implicitly authorize PostgreSQL migration, deployment, merging, or mobile work.
