# Phase 7.4 implementation sequence

## Working agreement

Implementation is deliberately split into small, reversible chunks. A normal chunk changes 3–8 runtime files and stays below roughly 1,000–1,500 net application lines. If the proof cannot fit, split it before coding. Each chunk gets one intentional commit and must pass its test/browser gate. Do not mix cleanup from neighboring routes.

Business behavior is frozen: no database model/migration, route/action contract, permission, account isolation, workflow transition, import/report semantics, retention/deletion behavior, mobile-app behavior, or synthetic/real-data boundary changes. Any discovered need outside that list stops the chunk for owner direction.

## Phase B — foundation and owner orientation

### B1a: tokens, actions, fields, and focus

Scope: CSS/Tailwind token normalization plus `Button`/link-button and base `Field` behavior. Normalize pending, disabled, danger, help/error, and visible-focus states without redesigning a route or changing a server-action contract.

Gate: typecheck, lint, focused primitive tests, detector, keyboard/focus and contrast review, and representative consumers at 360/390/430/768/1024/1440. One commit.

### B1b: feedback and surface primitives

Scope: `FeedbackBanner`, `StatusBadge`, `Surface`/`SectionCard`, `EmptyState`, and `Metric`. Preserve semantic status vocabulary and existing data; normalize live-region behavior, hierarchy, radius/density, and intrinsic-width safety.

Gate: success/warning/error/read-only/empty/long-label states, screen-reader semantics, no document overflow, and all six approved widths. One commit.

### B1c: collection primitives, deferred

Scope: introduce only the smallest `FilterBar`, `Pagination`, or bounded `DataRegion` primitives proven necessary by the first owner collection selected for migration. Do not build a speculative collection framework during B1a/B1b.

Gate: at least two real consumers or defer the primitive; mobile list/card and desktop comparison behavior; labelled internal scrolling; all six approved widths. One commit only when the first owner collection is authorized.

### B2: shell

Scope: `AppShell`, `AppNav`, mobile drawer/account menu/overlay support and at most the directly required primitive files. Group navigation, fix exact current-route ownership, complete keyboard/focus/background semantics, and make header density responsive.

Gate: one `aria-current` for nested owner/worker routes; expanded/collapsed/drawer/account menu at all six approved widths; Tab/Shift+Tab/Escape/arrows/Home/End; background isolation; no overflow; role/capability visibility unchanged. One commit.

### B3: dashboard

Scope: dashboard page plus its data adapter/loading/error presentation and directly used metrics/actions. Recompose as owner command center, correct marketplace/purpose labels, fix 360/390 overflow, and align loading/empty/error states. Do not invent new business metrics.

Gate: populated/empty/error/import-risk states, owner account variants, all six approved widths, exact action destinations, no document overflow, no console/page/request errors. One commit.

**Owner review gate:** approve foundation, shell, and dashboard before worker routes.

## Phase C — worker operations

### C1: shared work card

Scope: common work-card anatomy and the smallest adapters for `GroupedWorkCard`/`WorkTaskCard`; no stage behavior change.

Gate: source/account/stage/status/quantity/assignment/instructions/actions preserved for order and consignment cards at all six approved widths; keyboard and long identifier tests. One commit.

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

Gate: long identifiers, missing image/title/category, marketplace variants, mobile card/desktop comparison, all six approved widths. One commit.

### D2: Product Details and Missing Data

Scope: product/listing detail, images, marking/process data, missing-data/problem presentation.

Gate: present/partial/missing data, external image failure/retry, identifiers, route rules, safe disclosure. One commit.

### D3: Imports

Scope: imports list/job/mapping/issues and marketplace/purpose entry orientation. Preserve every importer, retained-file, retry, cancel, mapping, and export contract.

Gate: queued/running/mapping/file-role/complete/failed/cancelled/stale states; mobile cards and bounded desktop table; Amazon/Flipkart correctness. One commit, or split list vs job/mapping if over budget.

### D4: Consignments

Scope: batch list/create/import/review/detail/issues/activation presentation.

Gate: draft/validation/blocking/warning/active/completed states, line form density, account/marketplace isolation, activation evidence. One commit, or split review from list/detail if over budget.

### D5a: Accounts

Scope: account summary collection and one focused create/edit surface. Preserve selected-account switching, marketplace/account identity, activation/deactivation, confirmation, last-import context, and every server-action contract.

Gate: collapsed disclosure baseline, one/two-editor stress states, validation/errors, keyboard focus, exact account target boxes, all six approved widths, and exact mutation payload parity. One commit.

### D5b: Users

Scope: user/session summary collection and one focused create/edit surface. Preserve role, capability, assigned-account, active-session, password-reset, and permission semantics.

Gate: owner/worker variants, one/two-editor stress states, validation/errors, keyboard focus, all six approved widths, and exact permission payload parity. One commit.

### D6a: Data Management

Scope: destructive-action IA and shared status/data-region patterns. Preserve typed phrases, quarantine/restore/purge retention, audit evidence, disabled conditions, and production protections.

Gate: destructive flows without executing them in visual QA, disabled conditions, empty/history states, 760 px data-region containment, focus/recovery, and all six approved widths. One commit.

### D6b: Reports and System

Scope: report/system hierarchy, status/metric patterns, download/action targets, production checks, and error/empty presentation. Preserve report data and operational behavior.

Gate: report/system empty/error/healthy states, exact link destinations, true control target boxes, responsive containment at all six approved widths, and no console/page/request errors. One commit.

**Owner review gate:** approve owner/admin consistency, data safety, and responsive behavior.

## Phase E — focused QA and closure

No broad redesign. Fix only defects found in the accepted B–D surfaces. Run full typecheck/lint/tests/build, detector, protected-path check, browser matrix at 360/390/430/768/1024/1440, keyboard/focus/reduced-motion/contrast review, long-content and empty/error/loading/conflict states, and console/page/request error review. Re-run any business invariants whose presentation changed around a server action.

Phase E ends with an owner evidence review and a separate release decision. It does not implicitly authorize PostgreSQL migration, deployment, merging, or mobile work.
