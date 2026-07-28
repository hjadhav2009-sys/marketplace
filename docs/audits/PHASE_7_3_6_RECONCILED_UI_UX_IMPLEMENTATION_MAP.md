# Phase 7.3.6 Reconciled UI/UX Implementation Map

## Boundary

Source base: `d612882875cafeeef0f3907bdd803ee7a788d311`

Implementation branch:
`phase-7.3.6-stage4.6-reconciled-ui-ux-implementation`

The screenshot audits are evidence, not authorization to replace workflow
services. Backend changes require a disposable-database reproduction and a
failing service-level test.

## Authoritative services to preserve

| Domain action | Existing authority |
|---|---|
| Route decision and immutable route state | `src/lib/workflow/route-decision-policy.ts`, `route-selection.ts`, `route-provenance.ts` |
| Workflow prerequisites | `src/lib/workflow/workflow-prerequisites.ts` |
| Group/member stage completion | `src/lib/workflow/grouped-transition.ts`, `stage-transition.ts` |
| Customer package Pack | Existing package-scoped Packing service called by grouped, scanner, Details and mobile entry points |
| Consignment Pack | Existing transactional Consignment Pack service |
| Problems | `src/lib/workflow/order-problems.ts` and reviewed Consignment task problem actions |
| Idempotency | `src/lib/workflow/workflow-action-receipt.ts` and existing request gates |
| Projections and live updates | Existing affected-group refresh and `WorkChangeEvent` paths |
| Missing listing | `src/lib/catalog/missing-listing-resolution.ts` |
| Product Inventory jobs | `src/lib/import-jobs/runner.ts`, `progress.ts`, `store.ts` |
| Destructive owner actions | `src/lib/data-management/service.ts` |

## Wave 1 — evidence and deterministic fixtures

Files:

- `scripts/staging/seed.ts`
- `scripts/staging/core.mjs`
- `scripts/qa/stage4-5-scenarios.mjs`
- `scripts/qa/stage4-5-capture.mjs`
- `tests/staging.test.mjs`

Purpose:

- prove completed Mark and Assembly states using real synthetic WorkTasks;
- prove an Assembly-pending Pack lock through the authoritative prerequisite
  UI;
- correct scanner query parameters and completed read-only evidence;
- show real open and resolved Order problems;
- use deterministic authenticated local images;
- retain real synthetic selected-file state;
- prove the owner zero-account state using a bounded temporary active-account
  change that is restored immediately after capture.

No production database, schema or workflow service is changed.

## Wave 2 — shared visual system

Primary candidates:

- `app/globals.css`
- `components/AppShell.tsx`
- `components/MobileAccountMenu.tsx`
- current button, field, status, alert, empty-state, image and dialog
  components

Decision:

Audit existing primitives first. Add no duplicate primitive when an existing
one can be extended. Preserve permission-filtered navigation and server-action
Logout.

## Wave 3 — owner and catalogue UI

Primary candidates:

- authentication and account pages;
- dashboard, Accounts and Users;
- Product Inventory list/details/forms;
- missing-listing list and resolution screens.

Safety:

- Product Inventory remains catalogue data;
- minimal listing identity remains account + marketplace + Seller/Merchant
  SKU;
- existing manual-listing and missing-listing services remain authoritative.

## Wave 4 — imports and consignments

Primary candidates:

- Product Inventory refresh;
- import list/detail/mapping/issues;
- reusable selected-file queue;
- Consignment list/review/issues/details.

Safety:

- Amazon Daily Orders remain disabled;
- import leases and retained-file recovery are preserved;
- Flipkart `Quantity Sent` and Amazon `Shipped` remain authoritative;
- invalid quantities remain blockers and zero creates no work.

## Wave 5 — worker operations

Primary candidates:

- Work Hub;
- Pick, Mark, Assembly and Pack;
- scanner and problems;
- grouped and exact Details.

Safety:

- one actionable Pick/Mark/Assembly card per exact Order Item ID;
- one actionable Consignment card per exact ConsignmentLine;
- customer Pack remains package-scoped;
- scanner lookup never mutates;
- only saved-route override requires a reason;
- missing instructions use warning, Continue/Cancel and optional note.

## Wave 6 — data, reports and QA

Primary candidates:

- Data Management;
- reports/system;
- QA audit and Design Lab accessibility.

Safety:

- owner reauthentication, one-use grants, typed confirmation, quarantine,
  restore, retention and audit receipts are preserved;
- QA routes remain unavailable without the staging UI audit environment.

## Verification

Each changed wave requires focused source tests, TypeScript, lint, six-width
browser verification, keyboard/focus checks, overflow checks and new evidence
from one exact committed source/build/seed combination.

