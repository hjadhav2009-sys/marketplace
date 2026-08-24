# Amazon Compact Catalog Contract V1

Status: Frozen D3 implementation contract. Phase 7.4D2A.1 records this contract but does not implement Amazon file parsing, mapping UI, or Product Catalog import runtime.

## Purpose and boundary

Normal Amazon Product Catalog processing must not turn 500–900 category-template columns into operational catalog fields. It inspects source structure, maps the compact canonical contract below, reads only mapped useful values, and ignores unrelated columns.

The existing generic bounded profile/form engine remains available as fallback infrastructure. Its 1,000-field safety boundary and 40-visible-control behavior are not removed or made the normal Amazon import model.

Primary listing identity is always:

```text
Seller Account + AMAZON + Seller SKU
```

Filename, title, and ASIN are not primary listing identity.

## Canonical row

```ts
type AmazonCanonicalCatalogRowV1 = {
  sellerSku: string;
  title?: string;
  productType?: string;
  description?: string;
  color?: string;
  asin?: string;
  mainImageUrl?: string;
  otherImageUrls?: string[]; // positions 1 through 8 only
  swatchImageUrl?: string;
};
```

Only `sellerSku` is required. A valid Seller SKU with blank or absent ASIN, title, product type, description, color, or images remains a valid catalog row. A new Seller SKU containing only identity may create a local `NEEDS_ENRICHMENT` listing.

## Canonical field registry

The D3 registry is the single source of truth for field identity, labels, required state, exact signals, approved aliases, multiplicity, storage, validation, and blank behavior. Marketplace parsers must not maintain competing private alias lists for this contract.

| Canonical key | Label | Required | Exact human header | Technical signals | Approved aliases | Multiplicity | Storage target | Blank behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SELLER_SKU` | Seller SKU | Yes | `SKU` | `contribution_sku#1.value` and existing exact Amazon SKU keys | `Seller SKU`, `Merchant SKU`, `Seller SKU Id`, `seller_sku` | One | `sellerSkuId` and `sku` | Blank row blocks that row; missing/ambiguous mapping makes the file `NEEDS_MAPPING` |
| `TITLE` | Title | No | `Title` | Existing exact `item_name...#1.value` keys | Approved marketplace title aliases only | One | `productTitle` | Preserve stored value |
| `PRODUCT_TYPE` | Product Type | No | `Product Type` | Existing exact `product_type...value` keys | Approved product-type aliases only | One | `subCategory` / Amazon classification | Preserve stored value |
| `DESCRIPTION` | Description | No | `Product Description` | Existing exact `product_description...#1.value` keys | `Long Description` only after explicit registry approval or saved mapping | One | `description` | Preserve stored value |
| `COLOR` | Color | No | `Color` | Existing exact `color...value` keys | Approved color aliases only | One | bounded attribute `amazon.color` | Preserve stored value |
| `ASIN` | ASIN | No | `Product Id` | Existing exact ASIN/product-id technical keys | `ASIN`, `Product ID` | One | supporting ASIN identifier | Blank is valid and silent; malformed nonblank value is warning/review |
| `MAIN_IMAGE_URL` | Main image | No | `Main Image URL` | Existing exact `main_product_image_locator...media_location` keys | Approved main-image aliases only | One | `mainImageUrl` and `imageUrl1` | Preserve stored value |
| `OTHER_IMAGE_URL_1` … `OTHER_IMAGE_URL_8` | Other image 1 … 8 | No | repeated `Other Image URL` | Corresponding exact other-image locator/media keys | Approved other-image aliases only | Ordered eight | `imageUrl2` … `imageUrl9` | Preserve each stored position |
| `SWATCH_IMAGE_URL` | Swatch image | No | `Swatch Image URL` | Existing exact swatch locator/media keys | Approved swatch aliases only | One | `imageUrl10` | Preserve stored value |

Unknown generic headers such as `Code`, `Item`, or `Reference` are never Seller SKU aliases.

## Source-column identity and duplicate headers

A source column must retain at least:

- sheet or detected table identity;
- zero- or one-based column index;
- Excel column letter when available;
- raw human header;
- technical header/key when available.

For example, `H · Other Image URL`, `I · Other Image URL`, and `J · Other Image URL` are three distinct source columns. A parser must not convert source rows to an object keyed only by human header before repeated columns are resolved, because later duplicate keys would overwrite earlier image values.

XLSM macros are never executed. Formulas are not evaluated as executable code, and workbook external links are not followed. Cells are inspected as bounded data only.

## Detection priority

D3 uses this exact priority for each canonical target:

1. stable marketplace technical key;
2. exact saved `MarketplaceFileProfile` mapping;
3. exact normalized human header;
4. explicitly approved alias;
5. owner mapping.

Harmless normalization may cover capitalization, whitespace, underscore/hyphen differences, punctuation, and `Id` versus `ID`. Identity fields never use fuzzy guessing.

Detection outcomes are explicit: detected by technical key, reused saved mapping, exact header, approved alias, ambiguous, missing required, missing previously mapped optional, or intentionally unmapped.

## Adaptive mapping UX

When the required Seller SKU cannot be confidently found, is ambiguous, or the source table cannot be identified safely, the file status is `NEEDS_MAPPING` and merge cannot start.

The owner mapping screen shows only useful canonical targets and source columns:

- canonical software field and required marker;
- source-column dropdown containing sheet/table, column letter/index, and raw header;
- detection source and confidence/state;
- counts for useful columns mapped and source columns ignored.

Optional targets offer `Not mapped this import`. Selecting it permits import, preserves existing stored data, and performs no blank overwrite. A previously mapped optional source column that disappears or becomes ambiguous is shown for review rather than silently remapped.

Adding unrelated Amazon columns does not trigger mapping review when all useful fields still map confidently. For example, moving from 820 to 845 source columns may proceed with 16 useful columns mapped and 829 ignored.

## Saved mapping profiles

D3 extends the existing `MarketplaceFileProfile` architecture; it must not create a second mapping subsystem. A saved mapping is:

- versioned and reusable;
- bound to marketplace `AMAZON` and purpose `PRODUCT_CATALOG`;
- bound to the source human-header fingerprint and technical-header fingerprint when present;
- explicit about canonical targets and source column positions;
- account- or global-scoped according to current profile rules.

A future matching file maps automatically. If required or previously mapped useful columns disappear or become ambiguous, the retained file returns to `NEEDS_MAPPING`. The retained upload remains retryable after mapping; the owner does not upload it again.

## Category source families

The three current Amazon category file families are different source profiles with the same destination schema:

```text
Category profile A ─┐
Category profile B ─┼─> AmazonCanonicalCatalogRowV1 ─> MarketplaceListing
Category profile C ─┘
```

Known category slots may remain in the Product Catalog UI. Filename is never authoritative, a future fourth profile is addable without redesign, and a refresh may contain one or several category files. Absence of a previously used category file never deletes listings from that category.

## Storage and blank-value rules

Storage uses existing catalog fields:

- `SKU` → `sellerSkuId` and `sku`;
- `Title` → `productTitle`;
- `Product Type` → `subCategory` / Amazon product classification;
- `Product Description` → `description`;
- `Color` → bounded `amazon.color` catalog attribute;
- nonblank `Product Id` → supporting ASIN identifier;
- `Main Image URL` → `mainImageUrl` and `imageUrl1`;
- other images 1–8 → `imageUrl2`–`imageUrl9`;
- swatch → `imageUrl10`.

No Prisma column is added merely for this compact contract unless D3 proves a genuine model gap. Missing optional columns and blank incoming optional values never erase useful stored values.

## ASIN semantics

ASIN is optional supporting identity:

- blank ASIN is valid and does not produce an error or required warning;
- absence of a Product Id/ASIN column does not block import;
- nonblank values are safely normalized and retained as ASIN identifiers;
- malformed nonblank values produce bounded warning/review according to D3 validation;
- ASIN absence never blocks listing creation;
- two different Seller SKUs sharing an ASIN remain distinct and are never automatically merged.

The database may retain the same ASIN under different listings because Seller SKU, not ASIN, is canonical listing identity.

## Same-SKU multi-file merge

D3 merge behavior is deterministic:

- same account + same Seller SKU + same values → unchanged/safe merge;
- blank and nonblank values for the same Seller SKU → retain/use nonblank;
- two different nonblank ASINs for the same Seller SKU in one job → identity conflict requiring review; never silently choose one;
- conflicting descriptive values at the same source authority → deterministic source ordering plus a warning; never create a duplicate listing;
- duplicate source rows with one Seller SKU → one canonical listing plus warning/count;
- two different Seller SKUs with one ASIN → two distinct listings.

No title matching is permitted.

## D3 implementation handoff

D3A will implement compact extraction, mapping/profile reuse, deterministic merge, retained-file retry, and Import History handoff for Product Catalog. This document does not authorize changes to Flipkart, Meesho, Daily Order, or Consignment contracts, and D2A.1 must not implement those services early.
