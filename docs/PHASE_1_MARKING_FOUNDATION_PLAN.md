# Phase 1 Marking And Workflow Foundation Plan

## Current Architecture

Marketplace Pick & Pack is a Next.js 15 application with Prisma 6, SQLite for the owner-PC deployment, and a parallel PostgreSQL schema/migration tree. Accounts scope listings, imports, orders, scans, problems, and worker assignments. Existing live work uses `Order.pickStatus` and `Order.packStatus`; those fields remain authoritative.

Authentication uses signed HTTP-only sessions backed by `UserDeviceSession`. Owners can access all active accounts, while workers are limited to assigned active accounts. Audit events are written through the existing `AuditLog` service. Listing imports create or update `MarketplaceListing` records in account-scoped batches.

## Additive Migration Strategy

The migration adds five `User` permission columns with safe `false` defaults, identifier/marking/process/work-task tables, foreign keys, uniqueness constraints, and indexed exact-match paths. Existing users, accounts, listings, orders, imports, scans, and pick/pack statuses are not rewritten. Existing listings are backfilled into the identifier registry idempotently. No `WorkTask` rows are created for existing orders.

Both `prisma/schema.prisma` and `prisma/schema.postgres.prisma` receive equivalent models. SQLite and PostgreSQL migrations are maintained separately using their existing repository conventions.

## Models Added

- `MarketplaceListingIdentifier`: account-aware exact identifiers with raw and normalized values.
- `MarkingAsset`: owner-managed design metadata independent of any engraving database.
- `MarkingAssetFile`: immutable managed file versions; binary data stays on disk.
- `MarkingAssetListingLink`: explicit many-listing and multi-account links.
- `ProductProcessRule`: one service-enforced active route per marketplace listing.
- `WorkTask`: dormant generic stage/task foundation for later order and consignment workflows.

## Storage Design

Files live below `storage/marking-library/<assetId>/<fileId>/` under randomized managed names. SQLite stores only relative managed paths and metadata. Central helpers enforce size/count limits, extension allowlists, executable blocklists, path containment, zero-byte rejection, SHA-256 calculation, duplicate detection, and cleanup of partial writes. ZIP files are stored but never extracted in this phase. Downloads are authenticated and never expose absolute paths.

## Authorization Design

`OWNER` receives every new capability through server-side bypass logic even when legacy owner rows contain default `false` values. Workers may receive stage and management permissions independently, but account assignment still limits every listing, link, rule, file, and future task operation. Management actions re-check authorization server-side and never trust a client-supplied account ID as proof.

## Listing Matching

Identifier matching is selected-account scoped and exact. Seller SKU is checked first, then marketplace product identifiers, barcode identifiers, and model number. Results are `EXACT_UNIQUE`, `EXACT_MULTIPLE`, `NOT_FOUND`, or `INVALID`. Ambiguous results are never auto-selected. Product title remains a manual search aid only.

## Non-Goals

- No inventory balance, ledger, receiving, QC, valuation, reservation, or marketplace stock update.
- No activated `WorkTask` integration with current orders.
- No consignment worker flow.
- No universal scan page.
- No Windows Worker Agent or automatic deletion of owner files.
- No Android/mobile-app changes.

## Rollback Concerns

Application rollback is safe while new tables are unused by current pick/pack flows. Database rollback should preserve marking files and metadata; dropping the new tables is intentionally not automated. Back up the database and `storage/marking-library/` together. The owner original marking file is never deleted by normal workflow completion.

## Validation Plan

- Validate both Prisma schemas.
- Apply migrations to a fresh SQLite database and an existing-style copied SQLite database.
- Verify identifier backfill can run repeatedly without duplicates.
- Exercise pure permission, normalization, process-route, task-plan, and storage-security tests.
- Run existing importer, picker, packing, report, account, and mobile API regression tests.
- Run typecheck, lint, validator suite, production build, audit, and Git safety checks.
