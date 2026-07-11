# Phase 5 Customer Order Assembly Plan

## Lifecycle

- Ready-made product: `PICK -> PACK -> COMPLETED`.
- Assembly rule: `PICK -> ASSEMBLE -> PACK -> COMPLETED`.
- Manual exception: a pack-authorized worker sends a picked order to Assembly, then normal packing resumes after completion.

One `WorkTask` with source `ORDER` and stage `ASSEMBLE` represents the work. `Order.pickStatus` and `Order.packStatus` remain authoritative. The task's immutable `metadataJson` snapshot contains versioned instructions, safe image URLs, SKU/title snapshots, rule identity, requester, and request time.

## Rule Matching

Automatic matching is account-scoped and exact. Seller SKU is checked first, then internal SKU through `MarketplaceListingIdentifier`. Titles are never matched. Ambiguous listings, invalid rules, and `PICK_MARK_ASSEMBLE_PACK` customer-order routes require owner review instead of guessing.

## Worker Flow

- A successful Pick creates the task automatically for `PICK_ASSEMBLE_PACK`.
- A pack-authorized worker can manually send a picked, unpacked, non-problem order with instructions.
- An assembly worker claims, completes, or reports a problem on a task.
- Only an owner can reassign, resolve a problem, or skip assembly with a reason.
- The packing transaction rechecks all active shipment rows. Any pending/problem/invalid assembly state blocks the entire shipment.

## Permissions

- Pick: owner or `canPick` (legacy Picker remains compatible).
- Send to Assembly: owner or `canPack`.
- Assembly progress: owner or `canAssemble`, with account and assignment checks.
- View all assembly work: owner or `canViewAllWork` (read-only without `canAssemble`).
- Resolve, reassign, skip: owner only in Phase 5.

## Non-goals

No BOM, parts inventory, stock deduction, multi-step manufacturing, assembly stations, costing, QC, ERP, Worker Agent, Amazon consignment, APK, or mobile-app changes are included.
