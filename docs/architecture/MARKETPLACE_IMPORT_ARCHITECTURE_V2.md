# Marketplace Import Architecture V2

Status: Frozen architecture for the remaining Phase 7.4 owner work. Phase D1 records this contract but does not implement or change import behavior.

## Scope and isolation

Every Product Catalog row belongs to exactly one seller account and one marketplace. Marketplace listing identity remains isolated by:

```text
Seller Account + Marketplace + Seller SKU
```

Product Catalog creates and refreshes the marketplace listing master. Daily Orders and Consignments consume that catalog according to their marketplace-specific contracts. Exports are not imports.

## Flipkart

### Product Catalog

- Accept one main Listing Report.
- `Seller SKU Id` is the Seller SKU.
- `Flipkart Serial Number` is the FSN.
- Retain Sub-category, MRP, Selling Price, Brand, Description, Product Rating, and Image URLs.
- Marketplace stock fields remain reference-only. They do not become warehouse inventory or create workflow quantities.

### Daily Orders

- Accept one Excel or CSV file.
- `ORDER ITEM ID` is the item identity.
- `Tracking ID` is the package and Packing scan identity.
- Orders match Product Catalog.
- Import is rolling and idempotent.

### Consignments

- One Quantity Sent file is required.
- At least one category/detail file is required; additional category files are allowed.
- Quantity Sent alone determines required work quantity.
- Quantity Received, QC, and Inwarded fields create no workflow.
- Category files enrich and validate the Consignment.
- A required Quantity Sent line with no category detail freezes activation.
- A category-only row absent from the Quantity Sent file produces a warning and creates no work.
- SKU and FSN agreement is preferred.
- SKU-only matching is permitted when FSN is unavailable.
- FSN-only matching is permitted when SKU is unavailable.
- Conflicting SKU and FSN blocks review.
- Fuzzy title matching is prohibited.
- Any blocking required line keeps the Consignment in `REVIEW_REQUIRED` until it is resolved.

## Amazon

### Product Catalog

- Accept one or more category catalog files. The current category families are reusable source profiles feeding one canonical Amazon destination contract; a future category profile must not require an application redesign.
- Use the frozen [Amazon Compact Catalog Contract V1](./AMAZON_COMPACT_CATALOG_CONTRACT_V1.md) for normal Product Catalog processing. Amazon workbooks may contain hundreds of columns, but normal operational import extracts only the useful canonical fields and ignores unrelated columns.
- Seller SKU is the only mandatory canonical field and remains the listing identity inside the selected seller account. ASIN is optional supporting identity.
- Technical keys are high-confidence detection signals, not a requirement to persist every source column as a catalog attribute.
- Preserve repeated source-column identity by sheet/table and column position; duplicate human headers such as repeated `Other Image URL` columns must not overwrite one another.
- Reuse versioned `MarketplaceFileProfile` mappings. Detection follows technical key, exact saved mapping, exact normalized human header, approved alias, then owner mapping. Seller SKU never uses fuzzy guessing.
- Present known categories as reusable file slots, allow an owner to add a future source profile, and retain uploaded files for retry after mapping.
- Missing optional fields and blank incoming optional values do not block import or erase useful stored values.
- A valid category catalog row with a valid Merchant/Seller SKU may create a new `MarketplaceListing` as `NEEDS_ENRICHMENT`; All Listings remains backward-compatible and optional.
- Different Seller SKUs remain distinct even when they share an ASIN. Conflicting nonblank identities for the same Seller SKU require review.

### Daily Orders

- Disabled.

### Consignments

- Accept one shipment file.
- Merchant SKU is the primary match.
- ASIN and FNSKU are supporting identifiers.
- FNSKU is the operational barcode.
- Shipped is the required work quantity.
- Catalog files are not required with every Consignment.

## Meesho

### Product Catalog

- Accept one listing file.
- `Style ID/Sku` is the Seller SKU.
- Retain Product ID and Catalog ID.
- `Catalog Name` is the title.
- Retain Description, Meesho Price, and Image 1..N URLs.
- Every seller account owns an independent Product Inventory.

### Daily Orders

- Accept one text-based Supplier Manifest PDF.
- Do not use OCR for the normal text-based export.
- Courier manifest rows are canonical Order rows.
- Picklist is reconciliation and validation evidence.
- Retain Sub Order No, AWB, Courier, SKU, Qty, and Size.
- AWB is used by Scanner and Packing.
- A duplicate AWB inside one account is a conflict requiring review.
- Picklist aggregate and manifest aggregate must reconcile.

### Consignments

- Disabled.

## Future reports and exports

Exports are not import inputs. The planned report/export families are:

- Product Catalog
- Customer Orders
- Consignments
- Packed/Completed
- Problems
- Import History/Issues

## Implementation boundary

Phase D3 owns implementation through bounded checkpoints:

- D3A: Product Catalog Imports — Flipkart, Amazon, and Meesho.
- D3B: Daily Orders — Flipkart Excel/CSV and Meesho PDF; Amazon disabled.
- D3C: Consignments — Flipkart Quantity Sent plus category files and Amazon shipment file; Meesho disabled.
- D3D: Mapping, Import History, Issues, and Retry.

Phase D1 must not change catalog merge behavior, import services, mapping services, `ImportJob` execution, header-profile detection, or marketplace import availability.
