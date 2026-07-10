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

## Later Phases

- Customer order: Pick, Assemble, Pack.
- Consignment: Pick, Mark, Pack.
- Optional: Pick, Mark, Assemble, Pack.
- Universal scan resolver and worker UI.
- Authenticated Windows Worker Agent and temporary file delivery.
- Optional reviewed EngravingBrain protocol integration without sharing its database.

Inventory balances, branch/warehouse stock, receiving, QC, stock deductions, valuation, reservations, in-transit inventory, and marketplace stock updates are explicitly excluded.
