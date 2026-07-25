# Phase 7.3.6 Synthetic Complete UI Surface Inventory

## Scope and evidence labels

This inventory is for private synthetic staging only. It does not use or describe
production data.

- `SOURCE_REVIEWED`: the complete route source was inventoried.
- `SYNTHETIC_STATE_PRESENT`: the canonical Stage 4.2 seed contains a relevant state.
- `BROWSER_PENDING`: the route has not been certified in the current visible-browser run.
- `NOT_REACHABLE_IN_SEED`: the route exists but the canonical seed does not currently expose a safe link or valid dynamic identifier.

The repository contains 64 `page.tsx` routes. Browser status remains pending
because the browser-control connection was unavailable on 25 July 2026.

## Public and account surfaces

| Route | Primary surface/state | Evidence |
|---|---|---|
| `/` | authenticated entry redirect | SOURCE_REVIEWED, BROWSER_PENDING |
| `/login` | login, invalid credentials, disabled user | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/forgot-password` | request form, neutral response | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/setup` | first-run setup guard | SOURCE_REVIEWED, NOT_REACHABLE_IN_SEED |
| `/network-blocked` | network policy error | SOURCE_REVIEWED, NOT_REACHABLE_IN_SEED |
| `/accounts` | account chooser and selected-account state | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/change-password` | current/new password form and validation | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/dashboard` | role-aware navigation and summaries | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |

## Owner administration

| Route | Primary surface/state | Evidence |
|---|---|---|
| `/owner` | owner landing redirect | SOURCE_REVIEWED, BROWSER_PENDING |
| `/owner/accounts` | active/inactive accounts, create/edit/deactivate controls | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/users` | ten role/permission states including disabled worker | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/system` | system status and operational settings | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/cleanup` | cleanup preview/confirmation/error states | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/data-management` | files/imports/operational/catalog/trash/history/reset tabs | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/manual-review` | owner review queue | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/old-pending` | legacy pending review and bounded actions | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/work-route-summary` | route summary filters and counts | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |

## Product Inventory and catalog

| Route | Primary surface/state | Evidence |
|---|---|---|
| `/owner/product-inventory` | active/inactive/archived/error, image variants, filters | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/product-inventory/new` | standalone manual create | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/product-inventory/refresh` | refresh upload | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/product-inventory/[listingId]` | product details, route, provenance, locks | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/product-inventory/[listingId]/edit` | optimistic edit and protected identity | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/catalog/missing` | unresolved missing-listing queue | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/catalog/missing/[issueId]` | link/minimal/full resolution form | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/process-rules` | Direct Pack, Mark, Assembly, combined and fallback | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/marking-library` | asset list, empty/upload controls | SOURCE_REVIEWED, BROWSER_PENDING |
| `/owner/marking-library/new` | new marking asset | SOURCE_REVIEWED, BROWSER_PENDING |
| `/owner/marking-library/[assetId]` | asset details/files/edit/delete | SOURCE_REVIEWED, NOT_REACHABLE_IN_SEED |
| `/owner/sku-mappings` | mappings, filters, create/edit/delete/export | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/sku-mappings/import` | mapping import/review/errors | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |

## Imports and uploads

| Route | Primary surface/state | Evidence |
|---|---|---|
| `/owner/imports` | queued/mapping/running/completed/warnings/failed/cancelled jobs | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/imports/[jobId]` | lifecycle-specific job details/actions | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/imports/[jobId]/issues` | warning/blocking issue filters/export | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/imports/[jobId]/mapping` | adaptive mapping form | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/uploads/new` | daily-order upload purpose selector | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/uploads/[batchId]/review` | mapping, blocking issues, retained upload review | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |

## Consignments

| Route | Primary surface/state | Evidence |
|---|---|---|
| `/owner/consignments` | draft/review/ready/active/completed batches | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/consignments/new` | marketplace-aware new import | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/consignments/[batchId]` | summary, files, lines, assignment and activation | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/consignments/[batchId]/review` | matched/unmatched/blocking issue review | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/consignments/[batchId]/issues` | zero/invalid/missing-listing issue states | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/owner/consignments/[batchId]/listing/[lineId]` | missing-listing resolution bridge | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |

## Modern work surfaces

| Route | Primary surface/state | Evidence |
|---|---|---|
| `/work` | Work Hub and source/stage summaries | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/pick` | grouped Order and Consignment Pick | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/mark` | grouped Mark | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/assemble` | grouped Assembly | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/pack` | grouped authoritative Pack | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/scan` | exact active/completed/no-match scanner states | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/problems` | current worker problem queue/actions | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/groups/[stage]/[groupKey]` | paged members, exact selection, history | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/consignments/items/[taskId]` | worker-safe Consignment task details | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/marking/[taskId]` | immutable marking instructions/files | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/consignments/pick` | Consignment Pick compatibility queue | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/consignments/assemble` | Consignment Assembly compatibility queue | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/consignments/pack` | Consignment Pack compatibility queue | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |

## Compatibility and reporting surfaces

| Route | Primary surface/state | Evidence |
|---|---|---|
| `/picker` | redirect-only legacy Picker | SOURCE_REVIEWED, BROWSER_PENDING |
| `/picker/[sku]` | redirect-only legacy SKU page | SOURCE_REVIEWED, BROWSER_PENDING |
| `/packing` | legacy package search compatibility | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/packing/[awb]` | package details/problem/authoritative completion | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/problems` | legacy-compatible owner/worker problem management | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/reports` | reports, filters and exports | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/assembly` | legacy-compatible Order Assembly view | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/marking` | legacy-compatible Marking redirect/view | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |
| `/work/order-marking` | direct Order marking compatibility | SOURCE_REVIEWED, SYNTHETIC_STATE_PRESENT, BROWSER_PENDING |

## Non-page UI boundaries

The source inventory also includes route-local loading and error boundaries for
Dashboard, Imports, Packing, Picker, Marking, Cleanup, System, Upload New and
Upload Review. These must be triggered deliberately during browser QA; source
presence alone is not a visual pass.
