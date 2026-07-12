# Phase 7.2B - Bulk Product Inventory Refresh

Product Inventory is the marketplace listing catalog, not warehouse stock or ERP inventory. Refresh files are periodic; new consignment files are uploaded per shipment and normally contain only work quantity.

## Architecture

Legacy single-file jobs remain supported. Product Inventory jobs use a versioned bounded manifest, private `storage/import-jobs/<jobId>` storage, sequential processing, persisted stage/file counters, and a duplicate-run guard. Queued work restarts when its progress page is read. Cancellation is accepted only before `mergeStartedAt`.

CSV, TSV, TXT, XLSX, XLSM, multiple files, and bounded ZIP are accepted. Executables, nested archives, encryption, traversal, unsafe extensions and excessive sizes fail closed. Macros, formulas, external links and reference sheets remain inert.

`MarketplaceCatalogRowV1` bounds identifiers, attributes, text and ten HTTP/HTTPS image URLs. The shared merge is account/marketplace scoped and prefetches identities in chunks. New products require Seller SKU; rows without it may enrich only one exact existing match. Title similarity is never used.

Automated refresh fills blanks and reports nonblank conflicts rather than overwriting potentially manual data. It never deletes absent products. Rules, marking links, manual mappings, work and snapshots are untouched. Identifiers are appended idempotently and never moved.

The ignored private ZIP has 14 CSV/TXT/XLSX/XLSM entries. Generalized profiles include Amazon category templates, product-catalog text, identity-rich supporting data, Seller-SKU/category CSVs and image-rich data without authoritative SKU. Header inspection took about 78 seconds; full combined materialization exceeded ten minutes, so processing is file-by-file.

The additive `ImportJob` migration keeps SQLite/PostgreSQL aligned. A copied 759 MB real database retained 55,961 listings, 223,844 identifiers and all workflow counts with integrity `ok` and zero FK violations. The real database is not migrated automatically.

Phase 7.2C retains worker route choice, full image reliability, simplified work cards, review redesign and mobile-web work. Expo/APK remains postponed.
