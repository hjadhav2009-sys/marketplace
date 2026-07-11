# Workflow Roadmap

Marketplace Pick & Pack is a worker workflow system, not an ERP or inventory product.

## Current Live Flow

- Ready-made customer order: Pick, then Pack.
- Assembly-required customer order: Pick, Assembly task, then Pack.
- Existing `Order` pick/pack statuses remain authoritative.

## Phase 1 Foundation

- Generic listing identifiers.
- Owner marking asset/file library.
- Explicit multi-account listing links.
- Product process routes.
- Dormant generic `WorkTask` stage plans.
- Mark/Assemble/management permissions.

No existing order task rows are created.

## Phase 2: Owner Consignment Activation

Implemented owner-side Flipkart consignment CSV/ZIP intake, safe supporting-file classification, account-scoped listing matching, process-route review, and explicit transactional activation. WorkTask source, quantity, and uniqueness constraints are enforced, but no consignment worker screen invokes task transitions yet.

## Phase 3: Consignment Worker Flow

Implemented the worker Work Hub, Consignment Picker, Marking, Consignment Packing, stage-scoped exact search, atomic assignment claims, idempotent quantity progress, task problems, and line/batch completion reconciliation. Search never mutates work.

## Phase 4: Universal Cross-account Scanner

Implemented one exact, lookup-only scanner for customer orders and active consignment Pick/Mark/Pack tasks across every authorized active seller account. `/work/scan` and `/packing` reuse the same resolver and cards. Multiple matches remain separate, completed work is non-actionable, and every explicit action re-authorizes its account and source.

## Phase 5: Simple Customer Order Assembly

Implemented exact process-rule resolution, immutable Assembly task snapshots, automatic task creation after Pick, manual diversion, assignment/problem/owner-skip controls, an Assembly queue, scanner integration, and a shipment-wide transactional packing gate. This is task workflow only and introduces no inventory or manufacturing subsystem.

## Phase 6: Amazon Consignment And Rich Marking Cards

Implemented bounded Amazon CSV/TSV/XLSX/XLSM/ZIP classification, account-scoped listing/catalog enrichment, exact FNSKU/SKU/ASIN/external/barcode matching, owner preview and activation, immutable catalog snapshots, shared Pick/Mark/Pack tasks, Amazon scanner identifiers, and rich marking details. Worker marking-file delivery is postponed while the owner library remains preserved.

## Next Phases

- Phase 7: performance and complete website/backend QA.
- Phase 8: fully native React Native/Expo app, without WebView.
- Final: Android release APK after Expo testing.
- Future optional: reviewed EngravingBrain protocol and authenticated Worker Agent.

Inventory balances, branch/warehouse stock, receiving, QC, stock deductions, valuation, reservations, in-transit inventory, and marketplace stock updates are explicitly excluded.
