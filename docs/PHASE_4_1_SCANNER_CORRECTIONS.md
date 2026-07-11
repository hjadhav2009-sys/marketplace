# Phase 4.1 Universal Scanner Corrections

Base commit: `02879e8302804eb805f985eb3e70817763982043`

## Shipment packing safety

Universal Flipkart packing now resolves the active shipment from the primary order on the server. A Flipkart shipment is grouped by account, marketplace, and Tracking ID. Every non-packed sibling must be picked, ready to pack, and free of problem status before any row is changed.

The final transaction repeats account authorization, re-reads the primary order and complete active shipment, validates every row, updates only the verified IDs, writes one scan log per changed row, and writes one masked shipment audit summary. The browser never supplies a trusted sibling-order list.

Blocked messages are explicit:

- `Shipment cannot be packed: X item(s) are still waiting for picking.`
- `Shipment contains problem work.`

Already packed rows are excluded from active scope and remain unchanged. Repeated or concurrent attempts are idempotent at the order state boundary.

## Scanner candidates

One active Flipkart Tracking ID produces one shipment-level Pack candidate. The card shows its Tracking ID, representative AWB values, order and shipment references, item count, total quantity, picked count, waiting count, and product summary. Order-level Pick candidates remain separate and show their own AWB, Tracking ID, order number, shipment ID, and SKU.

Consignment cards show the consignment number, stage, short task reference, source row, Seller SKU, FSN, Listing ID, and required/done/remaining quantities. Mark tasks also show Master Design ID, asset name, position, dimensions, power, speed, frequency, passes, instructions, and protected preview/download links. Managed storage paths are never returned.

Identifier match reasons use this deterministic priority:

1. FNSKU
2. Seller SKU
3. FSN
4. ASIN
5. Listing ID
6. LID
7. EAN
8. UPC
9. GTIN
10. Barcode
11. Internal SKU
12. External ID

Assigned exact tasks are queried before general exact matches, merged, deduplicated, ranked, and only then bounded. This prevents a worker's assigned task from disappearing behind many unassigned matches.

## Next-scan behavior

Lookup retains the submitted code while candidates are reviewed. A successful action redirects without `q`, so the input is empty and focused for the next scan. A failed or stale action preserves the code, selects all text, and focuses the field so the next hardware scan replaces it. Enter remains lookup-only; scanning never performs a mutation automatically.

## Permissions and problem visibility

The Universal Scanner is available to owners and users with Pick, Mark, Pack, View All Work, or Manage Consignments permission. Users without scanner-related permission are redirected.

Customer packing counts, latest batch data, old-pending controls, and the legacy AWB panel are queried and rendered only for owners or Pack-authorized users.

Customer-order problem candidates are read-only. They are visible to owners, Pack-authorized users, View All Work users, and the worker who reported that specific problem. `canReportProblem` by itself does not reveal every customer problem in an authorized account.

## Manual QA

Test at 360, 390, 430, 768, 1024, and 1440 px:

1. Scan one picked Flipkart shipment and confirm one shipment card appears.
2. Scan a shipment with an unpicked sibling and confirm Pack is unavailable.
3. Complete picking, rescan, Pack, and confirm all eligible siblings change together.
4. Confirm AWB, Tracking ID, order, shipment, consignment, and quantity text wraps without horizontal page overflow.
5. Complete an action and immediately scan the next barcode; it must replace an empty focused field.
6. Trigger a stale action and verify the old code is selected for replacement.
7. Open a Mark candidate and test authorized preview/download links.
8. Sign in as Pick-only and Mark-only workers; confirm scanner access without packing counts or legacy packing controls.
9. Sign in as a Pack worker; confirm customer packing counts and the legacy panel remain available.
10. Verify all action controls are at least 44 px high and the scan input remains above the fold.

No inventory model, customer-order Assembly, Amazon consignment import, Worker Agent, or mobile-app change is part of this phase.
