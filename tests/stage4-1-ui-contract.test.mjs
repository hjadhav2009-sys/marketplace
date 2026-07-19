import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [card,nav,shell,scanner,scannerDialog,workDialog,details,productDetails,importPage,importActions,jobs,legacyTask] = await Promise.all([
  read("app/work/GroupedWorkCard.tsx"),read("components/AppNav.tsx"),read("components/AppShell.tsx"),read("components/UniversalScannerPanel.tsx"),read("components/ScannerPickRouteDialog.tsx"),read("components/WorkRouteDialog.tsx"),read("app/work/groups/[stage]/[groupKey]/page.tsx"),read("app/owner/product-inventory/[listingId]/page.tsx"),read("app/owner/imports/[jobId]/page.tsx"),read("app/owner/imports/[jobId]/actions.ts"),read("src/lib/product-inventory/jobs.ts"),read("app/work/WorkTaskCard.tsx")
]);

assert.match(nav,/data-mobile-drawer/);assert.match(nav,/sticky top-0/);assert.match(shell,/AppNav/);
assert.match(card,/Order Item ID/);assert.match(card,/Package quantity/);assert.match(card,/Quantity to process/);assert.match(card,/data-work-actions/);assert.match(card,/WorkRouteDialog/);
assert.doesNotMatch(`${card}${scanner}${scannerDialog}${workDialog}${legacyTask}`,/<select[^>]+name=["']routeReason/i,"Route reasons are plain text in on-demand dialogs, never a permanent dropdown.");
assert.doesNotMatch(scanner,/function ScannerPickRoutes/,"The retired scanner route implementation cannot return.");
assert.match(scanner,/lg:grid-cols-\[360px_minmax\(0,1fr\)\]/);assert.match(scannerDialog,/role="dialog"/);assert.match(workDialog,/role="dialog"/);assert.match(workDialog,/crypto\.randomUUID/);assert.match(scannerDialog,/crypto\.randomUUID/);
for(const section of ["Overview","Quantity and Members","Instructions","Identifiers","Timeline","Problems and History"])assert.match(details,new RegExp(section));
for(const section of ["Overview","Marketplace Listing","Pricing","Fulfilment and Stock References","Package Measurements","Tax and Legal","Processing","Problems and History"])assert.match(productDetails,new RegExp(section));
for(const label of ["Back to Imports","New Import","Import History","Review Amazon file roles","Confirm Roles and Start"])assert.match(importPage,new RegExp(label));
assert.match(importActions,/confirmProductInventoryFileRoles/);assert.match(jobs,/AWAITING_FILE_ROLES/);assert.match(jobs,/REFERENCE_IGNORE/);
assert.doesNotMatch(legacyTask,/RouteChoiceWithInstructionConfirmation/);assert.match(legacyTask,/stage!=="PACK"\?<form action=\{setTaskProgressAction\}/,"Generic exact progress is explicitly excluded for Pack.");

console.log("Stage 4.1 responsive UI and import-role contracts passed.");
