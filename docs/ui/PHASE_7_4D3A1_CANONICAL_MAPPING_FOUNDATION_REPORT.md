# Phase 7.4D3A.1 Canonical Mapping Foundation Report

Result: `PHASE_7_4D3A1_CANONICAL_MAPPING_FOUNDATION_CLOSED`.

## Checkpoint identities

- Approved D2A.1 starting final HEAD: `fcf2beadc5efb7d0c6db224eed47b635e3659e92`.
- Preserved branch: `phase-7.4d3a1-canonical-mapping-foundation`.
- D3A.1 runtime SHA: `ed34bd465629a8e7985fbf67331fe65dcd317e6d`.
- Exact committed BUILD_ID: `OzljcVkOas4gKndiSC_fN`.
- Browser-harness-only correction SHA: `136aa095c896c5d785eba7186b37dfeb8056b6eb`. This commit changes two QA scripts and no application-runtime files.
- Final HEAD: the report-only closure commit following the browser-harness correction commit. Its immutable SHA is recorded in the final handoff and can be obtained with `git log -1 --format=%H -- docs/ui/PHASE_7_4D3A1_CANONICAL_MAPPING_FOUNDATION_REPORT.md`.
- Historical uncommitted development BUILD_ID `eBqWqpBOHKAbDgfKIICjO` is not exact-commit closure evidence.

## Reconciliation scope and fixes

Every original changed/untracked source, test, and report was inspected. The worktree and branch were preserved. No competing implementation branch was created.

Review found and corrected these foundation issues before freezing the runtime:

1. Amazon canonical output names no longer matched the existing mapped parser. The adapter now retains `Merchant SKU`, `ASIN`, `Item Name`, and `Main Product Image` at that existing boundary and still reads legacy `productTitle` and `fnsku` profile keys. The production parser and merge policy are unchanged.
2. Partial repeated image galleries could reuse a single source column for later slots. Ordered duplicate headers now select only an available corresponding ordinal. Individually numbered aliases and technical keys resolve uniquely.
3. Profile save now checks the selected account's marketplace. Mapping route access and save check job account and marketplace. Account-specific profiles take precedence over global defaults.
4. Normalized fingerprints cannot silently authorize stale raw V2 references; saved positional references are checked against the current columns.
5. The legacy header-keyed adapter explicitly rejects duplicate source keys requiring positional rows. The positional extraction utility preserves distinct array positions; it does not reconstruct duplicates from already collapsed objects.
6. Meesho `Image N URL` aliases and Flipkart Listing Status were added to the registries. Mapping selects are constrained to their grid width.

## Architecture and boundaries

The shared registry covers Flipkart Product Catalog, Amazon Compact Product Catalog V1, and Meesho Product Catalog. Seller SKU is the required identity field. Amazon exposes exactly 16 fields and treats ASIN as optional. Marketplace identifiers remain supporting fields; this phase introduces no cross-account or cross-SKU merge behavior. Stock/reference values do not become workflow quantities.

`SourceColumnRefV2` stores version, sheet ID, optional table ID, zero-based index, Excel column letter, human header, and optional technical key. Strings, mapping counts, and indexes are bounded; duplicate positions are rejected. The helper layer does not execute formulas or macros or follow workbook links, and it adds no private filesystem paths to column identity.

Canonical detection supports technical key, saved mapping, exact header, approved alias, and owner review. Unknown identity labels are not fuzzily guessed. The existing production layout-known paths remain compatible; D3A.2 owns production workbook/parser integration and merge behavior.

`MarketplaceFileProfile.fieldMappingJson` remains authoritative. V1 string mappings and V2 positional mappings coexist without a schema migration or rewriting historical profiles during reads. New UI saves validate encoded columns against the server-retained request.

The source inspection ceiling is 2,000 columns; synthetic tests exercise 900 columns, eight repeated image labels, and Seller SKU at index 899. The independent generic detected-template 250-header ceiling and existing 1,000-field bounded fallback form were not changed.

The mapping page shows only useful canonical targets, distinguishable sheet/column labels, required markers, detection states, and initial detected/ignored counts. Optional targets may remain unmapped. Saved profiles resume the existing retained job without requiring another upload.

Production extraction of duplicate headers from marketplace workbooks is explicitly deferred to D3A.2. The 900-column browser fixture proves the mapping surface independently; retained-file execution proof uses an existing supported synthetic CSV path. This report does not claim a new Amazon compact workbook importer or Meesho job execution.

## Changed files

Application mapping foundation:

- `app/owner/imports/[jobId]/mapping/actions.ts`
- `app/owner/imports/[jobId]/mapping/page.tsx`
- `src/lib/imports/adaptive-rows.ts`
- `src/lib/imports/canonical-field-registry.ts`
- `src/lib/imports/header-profiles.ts`
- `src/lib/imports/import-purpose-definitions.ts`
- `src/lib/imports/mapping-request.ts`
- `src/lib/imports/source-column-mapping.ts`

Validation and commands:

- `package.json`
- `tests/adaptive-import.test.ts`
- `tests/adaptive-profile-integration.test.ts`
- `tests/phase-7-4d3a1-canonical-mapping-foundation.test.ts`
- `scripts/phase-7-4d3a1-browser.mjs`
- `scripts/phase-7-4d3a1-fixture.ts`

## Validation evidence

Passed against disposable or private synthetic data:

- `npm.cmd run phase7.4d3a1:test`
- `npm.cmd run adaptive-import:test`
- `npm.cmd run adaptive-profile-integration:test`
- `npm.cmd run product-inventory-import:test`
- `npm.cmd run phase7.4d2a1:test`
- `npm.cmd run typecheck`
- `npm.cmd run validate`, including TypeScript, lint, and the complete validator suite
- Lint: 0 errors, 152 warnings in checked-in skill scripts
- `git diff --check`

The first added regression test had a TypeScript-only inferred optional-key error. Its annotation was corrected; subsequent TypeScript validation passed.

Focused tests cover partial galleries, repeated positional mappings, late-column detection, missing/ambiguous identity, optional-field absence, V1 compatibility through the existing Amazon parser, V2 persistence/reuse, account and marketplace isolation, changed fingerprints, stale references, tampered column rejection, and duplicate positions. Adaptive integration covers retained mapping/retry/reuse across definitions. Meesho registry integration uses a synthetic Meesho account and does not imply a production Meesho importer.

## Exact build and browser evidence

One production build was run after the runtime commit using `npm.cmd run staging:build` (which invokes `npm run build` with the isolated staging environment).

- Runtime SHA: `ed34bd465629a8e7985fbf67331fe65dcd317e6d`.
- BUILD_ID: `OzljcVkOas4gKndiSC_fN`.
- Routes: 123, counted from `.next/server/app-paths-manifest.json`.
- Build duration: 266,413 ms.
- Build receipt time: 2026-09-07T17:14:46.798Z.
- Database identity: `PRIVATE_SYNTHETIC_STAGING`, `.codex-tmp/stage3-sanitized-staging/database/staging.db` (SQLite).
- PostgreSQL migrations disabled; no application-runtime files changed after this build.

`npm.cmd run phase7.4d3a1:browser` passed in installed headless Chrome at 390 x 844 and 1440 x 900. Both screenshots were visually inspected. Local evidence remains ignored under `.codex-tmp/phase-7-4d3a1/`: `browser-report.json`, `mapping-390.png`, and `mapping-1440.png`. Screenshots and synthetic database/storage files are not committed.

| Assertion | 390 x 844 | 1440 x 900 |
| --- | --- | --- |
| 900-column request, only 16 mapping targets | Pass | Pass |
| Eight repeated image labels distinguished H through O | Pass | Pass |
| Unknown Seller SKU requires owner selection | Pass | Pass |
| Tampered submitted positional reference rejected; no profile written | Pass | Pass |
| Valid mapping saved; same retained file path | Pass | Pass |
| Existing synthetic listing enriched with expected title | COMPLETED | COMPLETED |
| New synthetic job reuses saved fingerprint without another mapping | COMPLETED | COMPLETED |
| Cross-account URL renders Not Found with no mapping control | Pass | Pass |
| Console / page / unexpected request / HTTP errors in audited flows | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Horizontal overflow / enabled controls below 44 px | 0 / 0 | 0 / 0 |

The explicit access-denial probe is recorded separately from successful-flow error accounting. Next.js streamed its Not Found page with HTTP transport status 200 at both widths; the probe verifies the rendered 404 and absence of the mapping form, rather than claiming transport status 404.

Initial browser runs required corrections to test synchronization and fixture assumptions: tampering now alters submitted FormData from a valid selection; the retained form is explicitly reopened after rejection; account names are unique across reruns; and the Amazon fixture seeds an established listing because the frozen PRODUCT_CATALOG policy enriches rather than creates. These are QA-only corrections committed separately after the exact build. The final complete two-width run passed against the same unchanged application build. Scoped lint and TypeScript also passed after those corrections.

## Protected scope

Prisma schemas/migrations, PostgreSQL, `mobile-app`, real marketplace data, and `src/lib/marketplace-capabilities.ts` were not changed. Production marketplace parsers, merge rules, Daily Orders, and Consignment parsing were not changed. Existing shared mapping consumers were covered by regression tests.

Only disposable SQLite test databases and the existing `PRIVATE_SYNTHETIC_STAGING` SQLite database were used. No real database was queried, migrated, or seeded. No main-branch change, merge, deployment, or D3A.2 implementation occurred.

## Closure

The runtime, exact build, focused browser proof, and scope audit are complete. Staging was verified STOPPED with port 3188 closed after browser testing. The final commit contains this report only. The final handoff records the report commit SHA and verifies its equality with the pushed `phase-7.4d3a1-canonical-mapping-foundation` remote branch and a clean worktree.

The publish audit permits only the reviewed mapping source, package commands, tests, QA helpers, and this report. No environment files, credentials, databases, storage, private marketplace inputs, screenshots, build output, node_modules, or mobile artifacts are included in the checkpoint diff.

D3A.2 is explicitly NOT STARTED. No merge or deployment was performed.
