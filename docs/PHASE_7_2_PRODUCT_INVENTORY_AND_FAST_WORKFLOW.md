# Phase 7.2 - Product Inventory and Fast Workflow

Product Inventory is the account-scoped marketplace listing catalog. It is not physical stock inventory and has no available quantity, reservation, ledger, valuation, receiving, warehouse-location, or stock-update behavior. Consignment quantity is work quantity only.

Catalog refresh and consignment intake are separate workflows. Refresh adds products and enriches existing `MarketplaceListing` records; it must not delete absent products, overwrite useful values with blanks, or replace manual mappings and settings.

Implemented foundation:

- `/owner/product-inventory` is the canonical server-paginated catalog route.
- `/owner/product-inventory/[listingId]` shows identity, identifiers, image, refresh history, marking mapping, and optional default processing.
- Existing SKU mapping and process-rule routes remain compatible.
- `MarketplaceListing` remains the product master; no duplicate inventory model exists.
- `ProductProcessRule` is optional. Without one, activation snapshots `PICK_PACK`.
- The generic task-plan helper can represent all four processing routes. This does not claim every source-specific worker queue currently supports every route end to end.
- Missing title, image, default, marking asset, or marking instructions are warnings; identity/account conflicts and invalid quantity remain blocking.

No schema migration was required. Existing product and workflow data is preserved.

## Private profile verification

An ignored private ZIP containing 14 entries was inspected without logging filenames or data rows: 8 CSV, 1 TXT, 3 XLSM, and 2 XLSX. Header-only streaming inspection completed in about 78 seconds after full materialization exceeded 10 minutes.

Verified generalized profiles include three Amazon category catalog templates with machine headers on row 4, an identity-rich supporting workbook, a product catalog text report, and multiple seller-SKU/category supporting CSVs. XLSM macros and formulas were never executed. Reference/instruction sheets remained inert.

Two profiles need classifier work before import: an image-rich workbook without a recognized authoritative SKU, and category supporting CSVs currently classified as `SUPPORTING`. Multi-file catalog merge, placeholder creation, one-time Pick diversion, full image-state expansion, and complete mobile queue redesign remain for a subsequent implementation pass.

Expo, Android, APK/AAB, ERP, physical inventory, EngravingBrain, and Worker Agent work remain out of scope.
