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

Implemented:

- `app/globals.css`
- `components/AppShell.tsx`
- `components/MobileAccountMenu.tsx`
- shared navigation, page-header, status, statistic, empty-state,
  structured-detail, image-gallery and dialog components

Result:

- permission-filtered navigation and server-action Logout remain intact;
- mobile and desktop navigation expose the same authorized destinations;
- page/account context, focus, text wrapping, status semantics and touch
  targets are more explicit;
- no parallel navigation or authentication implementation was introduced.

## Wave 3 — owner and catalogue UI

Implemented:

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

Implemented:

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

Implemented:

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

Implemented:

- Data Management;
- reports/system;
- QA audit and Design Lab accessibility.

Safety:

- owner reauthentication, one-use grants, typed confirmation, quarantine,
  restore, retention and audit receipts are preserved;
- QA routes remain unavailable without the staging UI audit environment.

## Local implementation checkpoints

| Commit | Scope |
|---|---|
| `00ad86b` | Reconciled requirement matrix and deterministic fixture truth |
| `eaf3568` | Isolated Product Inventory image storage |
| `27bebd8` | Accessible shared navigation |
| `a408834` | Shared account and page context |
| `5a4d531` | Authentication, account chooser and dashboard |
| `7e96c55` | Product Inventory and catalogue details |
| `1ba319d` | Consignments and import operations |
| `42bae4e` | Owner administration and report scope |
| `f4b6de0` | Worker cards and route-decision dialogs |
| `d0dfc67` | Owner Data Management lifecycle controls |

These commits are local to the implementation branch. They do not modify
`main`, the RC1 pull request, production data, or `mobile-app`.

## Requirement reconciliation status

The matrix contains 193 independently classified rows:

- 14 already implemented;
- 4 conflict with an approved product rule;
- 6 conflict with the current authoritative backend architecture;
- 24 lack sufficient source evidence;
- 1 is stale;
- 26 are valid accessibility findings;
- 22 are valid fixture defects;
- 27 are valid responsive findings;
- 69 are valid UI findings.

Conflicting requirements were not implemented. Missing-evidence rows were not
converted into code changes without reproduction. The safe UI and fixture
clusters above are implemented, but a matrix row is not considered
browser-verified until it is exercised against the final committed build.

## Verification

Focused source and service tests, TypeScript, lint and diff validation have
passed for the committed waves. Six-width browser verification, keyboard/focus
checks, overflow checks and replacement screenshots must still be generated
from one final committed source/build/seed combination. Historical atlas
images are preserved as historical evidence and are not relabelled as proof of
this implementation branch.
