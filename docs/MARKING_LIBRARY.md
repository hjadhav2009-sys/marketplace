# Marking Library

The Marking Library is an owner-managed design and process foundation. It is not inventory management and does not track physical stock, valuation, receiving, QC, reservations, or marketplace quantities.

## Assets And Files

`MarkingAsset` stores design metadata. `MarkingAssetFile` stores immutable version metadata while the binary remains under `storage/marking-library/`. Replacement uploads create a new version and deactivate the previous version; history and the owner original remain available. ZIP files are stored without extraction.

Back up the database and `storage/marking-library/` together. A database backup alone cannot restore marking files.

Allowed marking formats are deliberately conservative: EZD, DXF, SVG, AI, CDR, PLT/HPGL, G-code/NC, PDF, and stored ZIP. Preview images allow PNG/JPEG/WebP. Reports allow PDF/TXT/CSV. Executables and scripts are blocked. The referenced EngravingBrain repository was not available in this workspace, so no dependency or unverified proprietary format behavior was copied.

## Listing Links And Matching

One design may be explicitly linked to many marketplace listings and accounts. Every link records its account, marketplace, match method, actor, and safe identifier snapshot. Exact matching never crosses the selected account.

Priority is seller SKU, marketplace product identifiers, barcodes, model number, then internal/external identifiers. A unique exact result may be proposed; multiple exact results require owner selection. Titles are only a manual fallback.

## Process Routes

- `PICK_PACK`: ready-made product.
- `PICK_MARK_PACK`: linked marking asset required.
- `PICK_ASSEMBLE_PACK`: assembly configuration required.
- `PICK_MARK_ASSEMBLE_PACK`: marking asset and assembly configuration required.

Changing a rule does not alter existing order state in Phase 1. Current picker and packer flows continue using `Order.pickStatus` and `Order.packStatus`.

## Permissions

Owners have all capabilities through server-side bypass. Workers may independently receive Pick, Mark, Assemble, Pack, Report Problem, Manage Marking Library, Manage Process Rules, and View All Work permissions. Assigned accounts continue to restrict worker data.

## Metadata Validation

Asset status is limited to `DRAFT`, `ACTIVE`, or `ARCHIVED`. Names cannot be blank; settings must be valid JSON; passes must be a positive whole number up to 1000; dimensions are non-negative; power is capped at 100, speed at 100000, and frequency at 1000. Optional machine values may remain unset.
