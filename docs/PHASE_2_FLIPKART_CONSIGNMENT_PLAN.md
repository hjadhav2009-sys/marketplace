# Phase 2: Flipkart Consignment Import and Activation

## Baseline

Phase 1 provides a generic listing identifier registry, marking assets and immutable managed files, per-listing process rules, dormant `WorkTask` records, and granular worker permissions. Existing customer Order Pick/Pack continues to use its original status fields and routes.

## Phase 1 issues addressed here

- Connect `WorkTask.consignmentLineId` to a real consignment line.
- Enforce exactly one valid source, positive quantities, bounded completion, positive sequence numbers, and source-stage/sequence uniqueness.
- Validate marking settings and process-rule inputs before activating real work.
- Derive navigation from permissions while preserving legacy PICKER/PACKER behavior.

## Additive migration

Phase 2 adds consignment enums, batches, lines, supporting-file metadata, issues, three user permissions, and relations. Only the dormant `WorkTask` table may be rebuilt on SQLite to add CHECK constraints and foreign keys. The existing `Order` table and order statuses are not changed.

## Import architecture

CSV and ZIP uploads are size-checked before buffering. ZIP entries are enumerated lazily, bounded by entry count/name length/extracted bytes, checked for traversal and unsafe types, and classified by decoded headers/content. Exactly one Consignment Details CSV is required. Supporting label, QC-reference, README, and unknown safe files create metadata only.

The parser normalizes headers and rows, treats `Quantity Sent` strictly as required work quantity, and records safe structured issues. Identifier matching is batched and account-scoped: Seller SKU first, then FSN. Conflicts and ambiguity always require owner resolution; titles are never auto-matched.

## Preview architecture

`/owner/consignments` lists batches. New uploads are created at `/owner/consignments/new`. Detail, review, and issue routes use paginated database queries (50 rows by default), compact listing projections, lazy product images, summary counts, and account-scoped actions. No tasks exist during preview.

## Activation transaction

Activation reclaims the batch with a guarded status update, re-reads all lines, validates listing/route/marking requirements, writes immutable snapshots, creates stage plans in chunks, marks lines activated, and moves the batch to ACTIVE in one transaction. A second or concurrent activation cannot create duplicate tasks. Audit metadata contains identifiers and counts only.

## Task integrity

- ORDER tasks require only `orderId`; CONSIGNMENT tasks require only `consignmentLineId`.
- Account ownership is checked in services.
- Required quantity and sequence are positive integers; completed quantity is bounded.
- A source cannot have duplicate stages or sequence numbers.
- First stage is READY and later stages are LOCKED.
- Transition helpers use guarded database updates and never mutate merely because a code was scanned.

## Permissions

`canViewConsignments`, `canImportConsignments`, and `canManageConsignments` are account-scoped. OWNER bypasses all three. Import permits draft upload/parsing; management permits mapping, route resolution, cancellation, and activation.

## Tests

Tests cover parser aliases and invalid quantities, ZIP classification and traversal rejection, account-scoped matching/conflicts, SQLite CHECK and unique constraints, activation idempotency, route task plans, snapshots, supporting-file non-activation, permission boundaries, and regression checks for old Order Pick/Pack.

## Explicit non-goals

No inventory, stock ledger, receiving, QC workflow, label printing, destination stock, worker consignment pages, mobile API, or APK changes are part of Phase 2.
