# Phase 7.3.6 Stage 4.5 Route Inventory

Inventory version: `phase-7.3.6-stage4.5-v1`

Routes: 68

| Route | Access | Dynamic parameters | Source | Evidence |
|---|---|---|---|---|
| `/` | PUBLIC | — | `app/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/%5F%5Fqa/design-lab` | AUTHENTICATED | — | `app/%5F%5Fqa/design-lab/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/%5F%5Fqa/design-lab/[area]` | AUTHENTICATED | area | `app/%5F%5Fqa/design-lab/[area]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/%5F%5Fqa/ui-audit` | AUTHENTICATED | — | `app/%5F%5Fqa/ui-audit/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/access-denied` | AUTHENTICATED | — | `app/access-denied/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/accounts` | AUTHENTICATED | — | `app/accounts/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/change-password` | AUTHENTICATED | — | `app/change-password/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/dashboard` | AUTHENTICATED | — | `app/dashboard/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/forgot-password` | PUBLIC | — | `app/forgot-password/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/login` | PUBLIC | — | `app/login/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/network-blocked` | PUBLIC | — | `app/network-blocked/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner` | AUTHENTICATED | — | `app/owner/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/accounts` | OWNER | — | `app/owner/accounts/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/catalog/missing` | OWNER | — | `app/owner/catalog/missing/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/catalog/missing/[issueId]` | OWNER | issueId | `app/owner/catalog/missing/[issueId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/cleanup` | OWNER | — | `app/owner/cleanup/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/consignments` | OWNER | — | `app/owner/consignments/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/consignments/[batchId]` | OWNER | batchId | `app/owner/consignments/[batchId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/consignments/[batchId]/issues` | OWNER | batchId | `app/owner/consignments/[batchId]/issues/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/consignments/[batchId]/listing/[lineId]` | OWNER | batchId, lineId | `app/owner/consignments/[batchId]/listing/[lineId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/consignments/[batchId]/review` | OWNER | batchId | `app/owner/consignments/[batchId]/review/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/consignments/new` | OWNER | — | `app/owner/consignments/new/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/data-management` | OWNER | — | `app/owner/data-management/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/imports` | OWNER | — | `app/owner/imports/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/imports/[jobId]` | OWNER | jobId | `app/owner/imports/[jobId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/imports/[jobId]/issues` | OWNER | jobId | `app/owner/imports/[jobId]/issues/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/imports/[jobId]/mapping` | OWNER | jobId | `app/owner/imports/[jobId]/mapping/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/manual-review` | OWNER | — | `app/owner/manual-review/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/marking-library` | OWNER | — | `app/owner/marking-library/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/marking-library/[assetId]` | OWNER | assetId | `app/owner/marking-library/[assetId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/marking-library/new` | OWNER | — | `app/owner/marking-library/new/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/old-pending` | OWNER | — | `app/owner/old-pending/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/process-rules` | OWNER | — | `app/owner/process-rules/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/product-inventory` | OWNER | — | `app/owner/product-inventory/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/product-inventory/[listingId]` | OWNER | listingId | `app/owner/product-inventory/[listingId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/product-inventory/[listingId]/edit` | OWNER | listingId | `app/owner/product-inventory/[listingId]/edit/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/product-inventory/new` | OWNER | — | `app/owner/product-inventory/new/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/product-inventory/refresh` | OWNER | — | `app/owner/product-inventory/refresh/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/sku-mappings` | OWNER | — | `app/owner/sku-mappings/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/sku-mappings/import` | OWNER | — | `app/owner/sku-mappings/import/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/system` | OWNER | — | `app/owner/system/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/uploads/[batchId]/review` | OWNER | batchId | `app/owner/uploads/[batchId]/review/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/uploads/new` | OWNER | — | `app/owner/uploads/new/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/users` | OWNER | — | `app/owner/users/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/owner/work-route-summary` | OWNER | — | `app/owner/work-route-summary/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/packing` | AUTHENTICATED | — | `app/packing/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/packing/[awb]` | AUTHENTICATED | awb | `app/packing/[awb]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/picker` | AUTHENTICATED | — | `app/picker/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/picker/[sku]` | AUTHENTICATED | sku | `app/picker/[sku]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/problems` | AUTHENTICATED | — | `app/problems/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/reports` | AUTHENTICATED | — | `app/reports/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/setup` | PUBLIC | — | `app/setup/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work` | AUTHENTICATED | — | `app/work/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/assemble` | WORKER | — | `app/work/assemble/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/assembly` | WORKER | — | `app/work/assembly/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/consignments/assemble` | WORKER | — | `app/work/consignments/assemble/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/consignments/items/[taskId]` | WORKER | taskId | `app/work/consignments/items/[taskId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/consignments/pack` | WORKER | — | `app/work/consignments/pack/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/consignments/pick` | WORKER | — | `app/work/consignments/pick/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/groups/[stage]/[groupKey]` | WORKER | stage, groupKey | `app/work/groups/[stage]/[groupKey]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/mark` | WORKER | — | `app/work/mark/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/marking` | WORKER | — | `app/work/marking/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/marking/[taskId]` | WORKER | taskId | `app/work/marking/[taskId]/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/order-marking` | WORKER | — | `app/work/order-marking/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/pack` | WORKER | — | `app/work/pack/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/pick` | WORKER | — | `app/work/pick/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/problems` | WORKER | — | `app/work/problems/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
| `/work/scan` | WORKER | — | `app/work/scan/page.tsx` | FULL_PAGE_AT_SIX_RESOLUTIONS |
