# Marketplace Pick & Pack: project master guide

## 1–5. Purpose, non-goals, structure, deployment, and SQLite

The application coordinates marketplace catalog imports, marking references, customer-order and consignment work, scanning, assignment, problems, and pack completion for a small owner-operated warehouse. It is a Next.js application with UI/routes under `app`, reusable UI under `components`, domain services under `src/lib`, Prisma schemas/migrations under `prisma`, tests under `tests`, operational scripts under `scripts`, and decisions/runbooks under `docs`.

The local owner-PC deployment uses a private SQLite database and private filesystem storage. A parallel PostgreSQL schema/migration tree exists for a future production deployment. Product Inventory is a marketplace listing catalog; physical inventory, stock balances, purchasing, accounting, ERP ledgers, and automatic marketplace synchronization are explicit non-goals.

## 6–8. Authentication, permissions, and account assignment

Users authenticate with username and a stored password hash. Roles provide broad identity while explicit capability flags control Pick, Mark, Assembly, Pack, problem reporting, marking-library management, process-rule management, view-all work, and consignment operations. Active state, forced password change, login-failure lockout, sessions, password-reset requests, and audit logs support operational security.

Seller accounts scope listings, identifiers, orders, consignments, tasks, actions, scans, and imports. A user may have a selected account and assigned-account relation. Server actions must authorize capability and account; hiding a UI control is not authorization.

## 9–12. Catalog, identifiers, defaults, and marking

MarketplaceListing is the canonical per-account catalog row. MarketplaceListingIdentifier stores exact lookup values such as SKU, FSN, listing ID, ASIN, FNSKU, EAN/UPC/GTIN, model, barcode, and external ID. Imports merge through marketplace-specific classifiers and services; account scoping prevents ambiguous cross-account mutation.

ProductProcessRule is optional. Missing rules default to Pick to Pack. MarkingAsset, files, and listing links provide reusable warehouse marking material; database and marking-library files must be backed up together.

## 13–17. Customer, assembly, consignment, Flipkart, and Amazon workflows

Customer orders retain their established pick/pack fields while WorkTask represents staged work. Supported routes include Pick-Pack, Pick-Mark-Pack, Pick-Assembly-Pack, and Pick-Mark-Assembly-Pack for customer work where enabled. Task sequence, locks, assignments, quantities, problems, completions, and immutable action logs enforce safe progression.

Consignments import shipment lines, resolve exact catalog matches, snapshot identifiers/content, review issues, select optional processing, and activate tasks. Flipkart and Amazon parsers have marketplace-specific evidence and safety policies. Amazon reference worksheets are excluded by default and submitted worksheet selections are revalidated server-side. Consignment assembly remains intentionally blocked.

## 18–22. Scanner, packing, problems, imports, and images

The universal scanner resolves exact work across order, tracking, identifiers, tasks, consignments, snapshots, and completed results within authorized accounts. Packing checks shipment-wide readiness, including multi-item Flipkart safety. Problem reporting pauses work; authorized resolution restores controlled state. Assignment and view-all permissions are distinct.

ImportJob records background import progress, reports, cancellation, and recovery data. Upload batches retain preview/issue information. Private source files live in ignored storage. Image mappings and cache health accelerate worker cards without turning the catalog into stock inventory.

## 23–28. Backup, reset, security, idempotency, concurrency, performance

Real-database migrations use inspect, verified backup, copied-database deployment tests, unchanged-source proof, explicit typed confirmation, and post-migration verification. The fresh-start workflow adds exact owner selection, complete dynamic table inventory, database/storage backup, disposable reset proof, three typed confirmations, and a manual restore helper.

Security depends on server-side authentication, account/capability authorization, bounded upload/archive/parser limits, safe file paths, input validation, and private ignored operational data. Client request IDs and task/action uniqueness make replay idempotent. Quantity progress uses bounded retry and safe replay recovery; some older action paths retain narrower transaction-based replay behavior and must not be described as universally transaction-free.

The measured resolver result is for the small preset: 2 accounts, 5,000 listings, 1,000 tasks, and 500 orders. Representative exact query plans cover AWB, tracking, identifiers, queue, assignment, and snapshot FNSKU. Medium-or-larger testing on stronger hardware remains a production gate.

## 29–33. Responsive QA, limitations, manual QA, native plan, APK plan

Responsive manual checks are mandatory at 360, 390, 430, 768, 1024, and 1440 pixels. Warehouse tests must use sanitized fixtures and cover every stage, problems, assignments, contention, files, and scanner hardware. Automated approval does not approve production rollout.

Current limitations include unproven 800,000-listing performance, representative rather than exhaustive query-plan proof, high-concurrency 2/5/10/20 coverage specific to duplicate quantity increments, and older replay callbacks in some action families. Phase 7.2B is not implemented on this checkpoint branch, and Phase 7.2C is not implemented.

The future mobile application must be fully native React Native/Expo with no WebView. Begin only after browser and warehouse approval; test in Expo before any final APK/AAB build.

## 34–38. Troubleshooting, commands, glossary, timeline, roadmap

If a migration/reset proof is stale, stop writers, inspect again, create a new backup, and repeat the disposable test. If integrity or foreign keys fail, do not reset or restore automatically. If a scan is ambiguous, confirm account and identifier source. If a task is busy, retry through the supported UI rather than editing the database. If private storage is missing, restore the matching database and storage snapshot together after reviewing newer-data loss.

Core commands are documented in `README.md`, `docs/REAL_DATABASE_BACKUP_AND_MIGRATION.md`, `docs/FRESH_START_DATABASE_RESET.md`, and `docs/FRESH_START_QA_PLAN.md`. Important terms: account (seller scope), listing (marketplace catalog row), identifier (exact lookup value), route (ordered stages), task (one stage), consignment (marketplace shipment batch), snapshot (activation-time catalog evidence), idempotency (safe replay), and fresh start (one owner, no operational rows, unchanged schema/migrations).

The evidence-backed commit timeline and phase detail are in `docs/history/PHASE_1_TO_7_2A_HISTORY.md`. The roadmap retains manual QA, stronger-hardware performance, production rollout approval, native Expo work, and final APK packaging as separate gates.

The consolidated history requested a target of 50,000 lines. The clean-base evidence-backed result is 18,924 lines in `PROJECT_HISTORY_PHASE_1_TO_7_2A_18924_LINES.txt`, generated strictly from commit `2981db0` plus this reset checkpoint. The repository contains only enough distinct verified evidence for that count; padding and later-branch evidence were rejected. Accuracy and branch purity take priority over the requested size.
