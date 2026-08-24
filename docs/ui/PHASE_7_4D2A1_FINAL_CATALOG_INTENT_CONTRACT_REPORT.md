# Phase 7.4D2A.1 Final Catalog Intent Contract Report

Result: `PHASE_7_4D2A1_FINAL_CATALOG_INTENT_CONTRACT_CLOSED`

## Starting and final runtime identity

- Required completed branch: `phase-7.4d2a-catalog-form-completeness`
- Starting D2A final HEAD: `2a9b20b3bdf46fa3fe0e7efb461ec41188c8a87a`
- Starting browser-tested D2A runtime: `800ce68742a20b6e57bc34341417664eeab13a2f`
- Starting D2A BUILD_ID: `7TIccEsDsqxxtCl5k7SBY`
- D2A.1 branch: `phase-7.4d2a1-final-catalog-intent-contract`
- D2A.1 runtime commit: `ea53ef100142eebe2df7b50a92433b64185d4bdd`
- D2A.1 BUILD_ID: `DXNz35_dOnXoG2SvSJJo4`
- Build routes: 123
- Build database identity: `SYNTHETIC_ONLY`

The final branch adds this report only after the exact runtime above. Because a commit cannot contain its own SHA, the exact final report-only branch HEAD is recorded in the pushed-branch handoff. No application runtime source changes after `ea53ef1` are included in the browser claim.

D2A.1 is the final bounded D2 catalog closure. It corrects form intent and owner-lock truth, freezes the D3 Amazon/mapping contracts, and adds focused evidence. It does not implement a Product Catalog importer, parse Amazon/Flipkart/Meesho files, change worker workflows, begin D3, merge, or deploy.

## Commit and changed files

Runtime/docs/test commit:

- `ea53ef1` Close final catalog intent and import contracts

Application runtime:

- `components/BoundedMarketplaceListingForm.tsx`
- `src/lib/catalog/missing-listing-resolution.ts`
- `src/lib/catalog/manual-listing.ts`

Architecture:

- `docs/architecture/MARKETPLACE_IMPORT_ARCHITECTURE_V2.md`
- `docs/architecture/AMAZON_COMPACT_CATALOG_CONTRACT_V1.md`

Focused QA:

- `tests/phase-7-4d2a1-final-catalog-intent-contract.test.tsx`
- `scripts/phase-7-4d2a1-authoritative-refresh.ts`
- `scripts/phase-7-4d2a1-browser.mjs`
- `package.json`
- this report

No dependency was added.

## Consignment resolution action correction

The shared bounded form no longer submits a hidden `resolutionAction=CREATE_FULL` beside the secondary submitter.

- Primary `Create full listing` omits `resolutionAction`; the existing server action defaults absence to `CREATE_FULL`.
- Secondary `Create minimal listing` is the only named submitter and supplies `resolutionAction=CREATE_MINIMAL` when clicked.
- Order Missing Listing uses the same explicit/default contract and remains unchanged at the service boundary.
- The allowed service actions remain `LINK_EXISTING`, `CREATE_MINIMAL`, and `CREATE_FULL`.

Focused rendered-markup and browser checks prove zero hidden `resolutionAction` inputs and exactly one named resolution control. Actual Consignment browser submission recorded audit action `CREATE_MINIMAL`, not an ambiguous multi-value form result.

## Owner-supplied fields versus system defaults

Both manual-listing creation helpers now determine `ownerSuppliedFields` from normalized raw owner input before adding system defaults.

When Listing Status is omitted:

- stored status remains the valid system default `NEEDS_ENRICHMENT`;
- `manualLocksJson` contains no `listingStatus` lock;
- `fieldProvenanceJson` does not falsely label the default as `MANUAL_OWNER`.

When an owner enters Product Title and keeps protection enabled:

- Product Title retains `MANUAL_OWNER` provenance;
- Product Title remains manually locked;
- a later catalog disagreement is reported and the owner value survives.

This does not weaken explicit owner locking. Existing manual-listing concurrency, replay, editing, imported metadata preservation, and lock-management tests remain green.

## Authoritative refresh proof

At both browser widths a Full Listing was created with an entered protected title and no explicit Listing Status. Database truth before refresh was:

- `listingStatus = NEEDS_ENRICHMENT`;
- listing-status lock absent;
- listing-status manual provenance absent;
- Product Title lock present.

The focused harness then invoked the existing `mergeMarketplaceCatalogRows` service with a synthetic authoritative Amazon All Listings row containing `listingStatus = ACTIVE` and a conflicting title.

Database truth after refresh was:

- `listingStatus = ACTIVE`;
- protected owner Product Title unchanged;
- title disagreement recorded as a manual-lock conflict.

No new import runtime or special production bypass was introduced.

## Amazon Compact Catalog Contract V1

The frozen contract is `docs/architecture/AMAZON_COMPACT_CATALOG_CONTRACT_V1.md`. Normal D3 Amazon Product Catalog processing will extract the compact canonical row rather than persist hundreds of unused template fields.

Canonical targets:

- required: `SELLER_SKU`;
- optional: `TITLE`, `PRODUCT_TYPE`, `DESCRIPTION`, `COLOR`, `ASIN`, `MAIN_IMAGE_URL`, `OTHER_IMAGE_URL_1` through `OTHER_IMAGE_URL_8`, and `SWATCH_IMAGE_URL`.

Seller identity remains:

```text
Seller Account + AMAZON + Seller SKU
```

ASIN is optional supporting identity. A valid Seller SKU with blank ASIN or without a Product Id column remains valid. Title, classification, description, color, and images are also optional and blank incoming values never erase useful stored values.

Storage reuses existing listing fields:

- SKU → `sellerSkuId` and `sku`;
- Title → `productTitle`;
- Product Type → `subCategory` / Amazon classification;
- Description → `description`;
- Color → bounded `amazon.color` attribute;
- nonblank Product Id → ASIN identifier;
- main image → `mainImageUrl` and `imageUrl1`;
- eight other images → `imageUrl2` through `imageUrl9`;
- swatch → `imageUrl10`.

No Prisma field is added for this compact contract.

## Repeated image-column safety

Repeated `Other Image URL` human headers must remain distinct by sheet/table identity plus column index/letter, raw header, and technical header/key when present. D3 must not first convert a row into an object keyed only by human header, because duplicate keys could overwrite image values.

XLSM macros are not executed, formulas are not evaluated as code, and workbook external links are not followed.

## Canonical mapping and saved-profile architecture

D3 detection priority is frozen as:

1. stable marketplace technical key;
2. exact saved `MarketplaceFileProfile` mapping;
3. exact normalized human header;
4. approved alias;
5. owner mapping.

Seller SKU never uses fuzzy guessing. Headers such as `Code`, `Item`, or `Reference` cannot silently become identity.

Uncertain required identity or unsafe source-table detection produces `NEEDS_MAPPING`. The owner UI maps only useful canonical targets, shows detection state, distinct source-column identity, mapped/ignored counts, and lets optional targets choose `Not mapped this import`. Unmapped optional values preserve stored data.

D3 reuses the existing versioned, marketplace/purpose/fingerprint-bound `MarketplaceFileProfile` architecture. A saved exact profile maps future matching files automatically; changed or ambiguous useful columns return the retained file to `NEEDS_MAPPING` for retry without re-upload.

## Ignored-column and category-file policy

Normal Amazon processing may inspect an 800+ column file but retains only mapped useful values. Unrelated columns are ignored and do not create hundreds of `MarketplaceListingAttribute` rows or mapping tasks.

The existing generic 1,000-field-safe profile/form engine remains available as fallback infrastructure and its D2A regressions remain green.

The three current Amazon category source families are separate source profiles feeding one canonical row. Filename is not authoritative, a fourth profile can be added without redesign, one refresh may contain one or several files, and an absent category file never deletes prior listings.

## Same-SKU merge and ASIN rules

The D3 contract freezes:

- same account/SKU/same values → unchanged;
- blank plus nonblank → retain/use nonblank;
- two nonblank conflicting ASINs for one SKU → review, never silently choose;
- same-authority descriptive conflict → deterministic ordering plus warning, never duplicate listing;
- duplicate rows for one Seller SKU → one canonical listing plus warning/count;
- two Seller SKUs sharing one ASIN → remain distinct listings;
- no title matching.

Missing optional columns and unrelated added columns do not block import when required/useful mappings remain safe.

## Focused browser proof

- Engine: installed Google Chrome through repository `playwright-core`
- Environment: `PRIVATE_SYNTHETIC_STAGING`
- Host: `127.0.0.1:3188`
- Exact runtime: `ea53ef100142eebe2df7b50a92433b64185d4bdd`
- Exact BUILD_ID: `DXNz35_dOnXoG2SvSJJo4`
- Viewports: `390x844` and `1440x900`
- Records: 4
- Passed: 4
- Failed: 0

At both widths actual form submissions proved:

- clicked secondary intent recorded `CREATE_MINIMAL`;
- one listing existed after replay;
- no Full dynamic attributes were written;
- Consignment quantity 5 remained unchanged;
- line resolved but remained unactivated;
- batch remained unactivated;
- no WorkTask was created;
- one completed workflow receipt existed after identical replay;
- Full creation stored system `NEEDS_ENRICHMENT` without owner lock/provenance;
- authoritative refresh changed status to `ACTIVE`;
- manually protected title survived.

Exact-build browser totals:

- document overflow: 0
- undersized enabled operational controls: 0
- duplicate current-route indicators: 0
- console errors: 0
- page/hydration errors: 0
- unexpected request failures: 0
- unexpected HTTP error responses: 0

Retained ignored screenshots:

- `.codex-tmp/phase-7-4d2a1/owner-review/consignment-minimal-390.png`
- `.codex-tmp/phase-7-4d2a1/owner-review/consignment-minimal-1440.png`

Visual inspection confirmed clear primary/secondary intent, usable mobile stacking, restrained desktop hierarchy, visible controls, and no clipping. No broad D2 UI redesign or motion was introduced.

## Validation

All requested gates passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; unchanged checked-in Impeccable baseline of 152 warnings
- `npm.cmd run validate`
- `npm.cmd run phase7.4d1:test`
- `npm.cmd run phase7.4d2:test`
- `npm.cmd run phase7.4d2a:test`
- `npm.cmd run phase7.4d2a1:test`
- `npm.cmd run manual-listing:test`
- `npm.cmd run missing-listing-resolution:test`
- `npm.cmd run dynamic-catalog-form:test`
- `npm.cmd run product-inventory-import:test`
- `npm.cmd run projection-lifecycle:test`
- `node --check scripts/phase-7-4d2a1-browser.mjs`
- `npm.cmd run phase7.4d2a1:browser`
- `git diff --check`

One production build was performed after runtime source was final. The direct build produced the exact SHA/BUILD_ID above; its ignored private-staging receipt was registered afterward without rebuilding.

## Protected boundaries and final state

- Authentication, authorization, selected-account scoping, Consignment quantity, activation rules, Order release behavior, allowed resolution actions, dynamic-profile fingerprint validation, 250-attribute server boundary, workflow receipts, and catalog merge authority remain enforced.
- No runtime dependency or new client module was added.
- Prisma schema and migrations are unchanged.
- PostgreSQL was untouched.
- `mobile-app` is unchanged.
- Only isolated synthetic/disposable data was used.
- No real data was accessed.
- Staging is stopped and port 3188 is closed.
- No PR, merge, deployment, or D3 implementation was performed.

D1, D2, D2A, and D2A.1 are now ready to freeze before the separately authorized D3A Product Catalog Import implementation.
