# Phase 6 Amazon Consignment Plan

Amazon extends the existing generic Flipkart consignment architecture. It uses the same `ConsignmentBatch`, `ConsignmentLine`, owner review, transactional activation, `WorkTask` stages, assignments, problems, universal scanner, and line/batch reconciliation.

## Sources And Classification

Supported files are CSV, TSV/TXT, XLSX, XLSM, and bounded ZIP archives. Header signatures classify shipment, All Listings, category catalog, product catalog, and supporting data. Filenames are not authoritative. XLSM cells are read as workbook data only; macros and formulas are never executed.

Shipment rows retain bounded operational fields only. All Listings is authoritative for Seller SKU, ASIN, FNSKU, and listing status. Catalog files enrich nonblank title, category, brand, descriptions, bullets, attributes, and up to ten safe image URLs. Raw rows and private paths are not retained.

## Matching And Activation

Exact matching is scoped to the selected Amazon account. Priority is FNSKU, Seller SKU, ASIN, External ID, then EAN/UPC/GTIN. Conflicting or duplicate identifiers require owner review; titles never auto-match. Upload and preview create no tasks.

Activation supports `PICK_PACK` and `PICK_MARK_PACK`. It copies immutable Amazon identifiers and a versioned catalog snapshot to the line, then creates the existing stage plan. Marking requires an active asset and meaningful instructions or Master Design ID. A worker marking file is not required.

## Security And Performance

ZIP paths, symlinks, encrypted entries, nested archives, executables, entry counts, depth, and expanded bytes are bounded. Workbooks have size, sheet, row, column, cell-length, and total-cell limits. Matching and identifier writes are batched, queue queries remain bounded, and snapshots contain no raw spreadsheet rows.

## Migration And Tests

SQLite uses a safe-copy migration to widen the existing Flipkart-only batch constraint while preserving all rows and indexes. PostgreSQL receives additive enum values, columns, and indexes. Tests cover classification, workbook and ZIP safety, exact scoped matching, preview, enrichment, activation, immutable snapshots, migration compatibility, scanner behavior, and a synthetic 10,000-row parse.

## Non-goals

No inventory, receiving, QC, stock ledger, BOM, ERP, EngravingBrain, Worker Agent, WebView, Expo work, or APK work is included.
