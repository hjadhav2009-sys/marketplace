# Phase 7.4D2A Catalog Form Completeness Report

Result: `PHASE_7_4D2A_CATALOG_FORM_COMPLETENESS_CLOSED`

## Runtime identity and boundary

- Starting completed branch: `phase-7.4d2-professional-product-details-missing-listings`
- Starting D2 final HEAD: `fffb4aca049789bf296e8fae72883f9ce433a980`
- Starting browser-tested D2 runtime: `614a97aa4d089a838f35858590ac7b33bd801022`
- Starting D2 BUILD_ID: `cEqqZZ24rlFF0HcZGlwLD`
- D2 final delta from its tested runtime: the D2 implementation report only
- D2A branch: `phase-7.4d2a-catalog-form-completeness`
- Browser-tested D2A runtime commit: `800ce68742a20b6e57bc34341417664eeab13a2f`
- D2A BUILD_ID: `7TIccEsDsqxxtCl5k7SBY`
- Build route count: 123
- Build database identity: `SYNTHETIC_ONLY`

D2A is the requested small closure for the existing Product Details and Missing Listings work. It does not begin D3, broadly redesign Product Inventory or Product Details, alter worker workflows, merge, deploy, or access production data.

## Workspace permission verification

Normal, non-elevated create/write/delete probes passed in all six requested areas before implementation:

- `src/`
- `app/`
- `components/`
- `lib/`
- `scripts/`
- `tests/`

The probes used harmless ignored temporary paths and were removed. No `takeown`, `icacls`, elevated PowerShell, or elevated source patch was used. All application, test, script, and documentation edits were made through normal workspace writes.

## Commit and changed-file boundary

Runtime commit:

- `800ce68` Close D2 catalog form completeness gaps

Runtime components and helpers:

- `components/BoundedMarketplaceListingForm.tsx`
- `components/MissingListingsWorkspace.tsx`
- `components/ProductInventoryDetails.tsx`
- `lib/missing-listing-read.ts`
- `lib/product-inventory-details.ts`

Focused QA and test support:

- `scripts/phase-7-4d2a-browser.mjs`
- `tests/phase-7-4d2a-catalog-form-completeness.test.tsx`
- `package.json`
- this report

The final exact-build browser rerun required one QA-only correction after the runtime commit: the harness now calculates resolution receipt IDs with the persisted `ImportRowIssue.version` default of `1`, rather than the incorrect fixture assumption of `0`. The first run had already proved the application mutations, task/projection state, stored attributes, selected candidate, and error-free page behavior; only its receipt lookup assertion was wrong. No application runtime file changed after the one production build. The final retained run described below passed against the unchanged `800ce687...` runtime.

## Full profile field reachability

`BoundedMarketplaceListingForm` no longer silently truncates the selected profile to its first 250 validated dynamic fields.

- Every validated field in the selected profile is searchable and pageable, up to the existing service safety maximum of 1,000 profile fields.
- Advanced controls use 40-row pages, so no more than 40 are visible at once.
- Search scans the complete selected profile, including fields beyond position 250.
- Pagination spans the complete profile.
- Controlled attribute state preserves entered values while the user searches or changes pages within the selected profile.
- Changing the selected profile clears incompatible entered attribute state.
- The DOM does not receive all 883 active inputs.

The existing server request boundary remains authoritative. The form retains the 250 nonblank dynamic-attribute maximum and now counts nonblank values explicitly. If the limit is exceeded it displays a clear `role="alert"` validation message and disables the full-listing submit action. It does not raise request-size limits.

The focused 883-field regression covers fields 1, 249, 250, 251, 700, and 883. Source and browser evidence prove that search finds fields 700 and 883, pagination reaches later fields, entered values survive navigation/search, and at most 40 advanced controls render at once.

## Missing-listing reason truth

The combined Missing Listings read model now applies the exact supported semantics:

- `reason=ambiguous` includes Order `AMBIGUOUS_LISTING` and Consignment `EXACT_MULTIPLE`.
- `reason=conflict` includes Consignment `IDENTIFIER_CONFLICT` only.
- Ambiguous Order issues are never relabelled or returned as identifier conflicts.

The conflict path skips the Order issue query instead of broadening the Order predicate. Focused synthetic database tests assert the exact returned source/type combinations.

## First-seen information

Each Missing Listing row now presents `First seen <formatted timestamp>` from the existing `createdAt` read-model value. Formatting is server-rendered through the existing date/time helper. No live timer, client clock, or hydration dependency was added.

## Safe marketplace links

Product Details now includes a compact Marketplace links surface for populated:

- Generated Direct Product URL
- Canonical Product URL

Links render only after `safeExternalHttpUrl(...)` accepts an HTTP or HTTPS URL. The helper rejects JavaScript, data, file, malformed, and credential-bearing URLs. Valid links open in a new tab with `rel="noopener noreferrer"` and reuse the shared quiet action styling. Invalid stored URLs remain non-clickable and no legacy placeholder block was restored.

## Browser mutation proof

- Engine: installed Google Chrome through repository `playwright-core`
- Environment: `PRIVATE_SYNTHETIC_STAGING`
- Host: `127.0.0.1:3188`
- Exact source SHA: `800ce68742a20b6e57bc34341417664eeab13a2f`
- Exact BUILD_ID: `7TIccEsDsqxxtCl5k7SBY`
- Viewports: `390x844` and `1440x900`
- Retained records: 14
- Passing records: 14
- Failures: 0

At both widths the browser submitted the real existing server-action forms against isolated synthetic fixtures:

1. Edit Listing changed the synthetic title, followed the redirect, confirmed the database value, and reloaded Product Details with the saved title.
2. Create Minimal resolved the Order issue, created one account-scoped listing, released exactly one WorkTask with quantity 2, produced the current projection, persisted one workflow receipt, and remained duplicate-free when the identical form submission was replayed from a second tab.
3. Create Full used an 883-field synthetic Amazon profile, entered and retained values at fields 700 and 883, submitted the form, stored both exact `MarketplaceListingAttribute` keys/values, released exactly one WorkTask with quantity 3, produced the current projection, persisted one workflow receipt, and remained duplicate-free on replay.
4. Ambiguous Link Existing selected retained candidate B, resolved only to that exact listing, recorded candidate B in the resolution audit, created exactly one WorkTask, persisted one workflow receipt, and remained safe on replay.

The browser also proved reason filtering, first-seen rendering, safe marketplace links, search for fields 700 and 883, later-page reachability, state retention across search/page changes, and the 40-control render bound.

Final retained exact-build totals:

- document overflow failures: 0
- inspected enabled operational controls below the existing minimum: 0
- duplicate current-route indicators: 0
- console errors: 0
- page or hydration errors: 0
- unexpected request failures: 0
- unexpected HTTP error responses: 0

Retained owner-review screenshots are under the ignored synthetic evidence directory `.codex-tmp/phase-7-4d2a/owner-review/`:

- `missing-first-seen-390.png`
- `large-profile-field-700-390.png`
- `large-profile-field-700-1440.png`
- `marketplace-links-1440.png`

Visual inspection confirmed readable card hierarchy, visible focus, bounded advanced-field rendering, usable mobile stacking, safe-link clarity, and no horizontal clipping. No broad Product Details redesign or decorative motion was introduced.

## Validation

All requested validation completed successfully:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; the unchanged checked-in Impeccable skill baseline remains 152 warnings
- `npm.cmd run validate`
- `npm.cmd run phase7.4d1:test`
- `npm.cmd run manual-listing:test`
- `npm.cmd run missing-listing-resolution:test`
- `npm.cmd run dynamic-catalog-form:test`
- `npm.cmd run projection-lifecycle:test`
- `npm.cmd run rolling-order-import:test`
- `npm.cmd run phase7.4d2:test`
- `npm.cmd run phase7.4d2a:test`
- `node --check scripts/phase-7-4d2a-browser.mjs`
- `npm.cmd run phase7.4d2a:browser`
- `git diff --check`

The one production build was performed only after application runtime source became final. Browser proof ran against that exact build; the later harness receipt-version correction did not change the application runtime or require a second build.

## Runtime safety and performance

- Existing authentication, authorization, account scoping, server actions, workflow services, stale-version behavior, idempotency, task release, and projection code remain authoritative.
- No form, animation, UI, or runtime package was added.
- No new client module was introduced. `BoundedMarketplaceListingForm` was already a client component; its new state/count behavior remains confined there.
- First-seen formatting and safe-link validation remain server-compatible.
- Prisma schema and migrations are unchanged.
- PostgreSQL and real data were untouched.
- `mobile-app` is unchanged.
- Synthetic browser fixtures were isolated from real data.
- Staging is stopped and port 3188 is closed.
- No PR, merge, deployment, or D3 work was performed.

D2A closes the identified catalog-form reachability and final mutation-evidence gaps while preserving the D2 workflow and data boundaries.
