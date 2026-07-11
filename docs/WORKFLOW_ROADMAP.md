# Workflow Roadmap

Marketplace Pick & Pack is a worker workflow system, not an ERP or inventory product.

## Current Live Flow

- Customer order: Pick, then Pack.
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

Implemented the worker Work Hub, Consignment Picker, Marking, Consignment Packing, stage-scoped exact search, atomic assignment claims, idempotent quantity progress, task problems, private marking-file delivery, and line/batch completion reconciliation. Search never mutates work.

## Phase 4: Universal Cross-account Scanner

Implemented one exact, lookup-only scanner for customer orders and active consignment Pick/Mark/Pack tasks across every authorized active seller account. `/work/scan` and `/packing` reuse the same resolver and cards. Multiple matches remain separate, completed work is non-actionable, and every explicit action re-authorizes its account and source.

## Later Phases

- Customer order: Pick, Assemble, Pack.
- Consignment: Pick, Mark, Pack.
- Optional: Pick, Mark, Assemble, Pack.
- Authenticated Windows Worker Agent and temporary file delivery.
- Product Variant and Product Design identity mapping.
- Optional reviewed EngravingBrain protocol integration without sharing its database.

Inventory balances, branch/warehouse stock, receiving, QC, stock deductions, valuation, reservations, in-transit inventory, and marketplace stock updates are explicitly excluded.
