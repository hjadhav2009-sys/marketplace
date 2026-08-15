import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [grouped,workCard,workQuantity,nav,shell,scanner,scannerDialog,workDialog,details,productDetails,importPage,importActions,jobs,legacyTask,dataPage,dataActions,dataService,dataApi] = await Promise.all([
  read("app/work/GroupedWorkCard.tsx"),read("components/work-card/WorkCard.tsx"),read("components/work-card/WorkCardQuantity.tsx"),read("components/AppNav.tsx"),read("components/AppShell.tsx"),read("components/UniversalScannerPanel.tsx"),read("components/ScannerPickRouteDialog.tsx"),read("components/WorkRouteDialog.tsx"),read("app/work/groups/[stage]/[groupKey]/page.tsx"),read("app/owner/product-inventory/[listingId]/page.tsx"),read("app/owner/imports/[jobId]/page.tsx"),read("app/owner/imports/[jobId]/actions.ts"),read("src/lib/product-inventory/jobs.ts"),read("app/work/WorkTaskCardView.tsx"),read("app/owner/data-management/page.tsx"),read("app/owner/data-management/actions.ts"),read("src/lib/data-management/service.ts"),read("app/api/owner/data-management/preview/route.ts")
]);
const card = `${grouped}\n${workCard}\n${workQuantity}`;

assert.match(nav,/data-mobile-drawer/);assert.match(nav,/sticky top-0/);assert.match(shell,/AppNav/);
assert.match(card,/Order Item ID/);assert.match(card,/Package quantity/);assert.match(card,/Quantity to process/);assert.match(card,/data-work-actions/);assert.match(card,/WorkRouteDialog/);
assert.doesNotMatch(`${card}${scanner}${legacyTask}`,/<select[^>]+name=["']routeReason/i,"Route-reason controls remain inside on-demand dialogs.");
assert.match(scannerDialog,/<select[^>]+name=["']routeReason/i,"Scanner overrides use the approved bounded reason selector.");
assert.match(workDialog,/<select[^>]+name=["']routeReason/i,"Grouped-work overrides use the approved bounded reason selector.");
assert.match(scannerDialog,/name="confirmMissingInstructions"[\s\S]*required/,"Scanner missing-instruction routing requires visible confirmation.");
assert.match(workDialog,/name="confirmMissingInstructions"[\s\S]*required/,"Grouped missing-instruction routing requires visible confirmation.");
assert.doesNotMatch(scanner,/function ScannerPickRoutes/,"The retired scanner route implementation cannot return.");
assert.match(scanner,/lg:grid-cols-\[360px_minmax\(0,1fr\)\]/);assert.match(scannerDialog,/role="dialog"/);assert.match(workDialog,/role="dialog"/);assert.match(workDialog,/crypto\.randomUUID/);assert.match(scannerDialog,/crypto\.randomUUID/);
for(const section of ["Overview","Quantity and Members","Instructions","Identifiers","Timeline","Problems and History"])assert.match(details,new RegExp(section));
for(const section of ["Overview","Marketplace Listing","Pricing and Settlement","Live Marketplace Data","Description and Specifications","Processing and Workflow","Fulfilment and Stock References","Package and Shipping","Tax and Legal","Attachments","Problems and History"])assert.match(productDetails,new RegExp(section));
for(const label of ["Back to imports","Start another import","Review Amazon file roles","Confirm roles and start"])assert.match(importPage,new RegExp(label));
assert.match(importActions,/confirmProductInventoryFileRoles/);assert.match(jobs,/AWAITING_FILE_ROLES/);assert.match(jobs,/REFERENCE_IGNORE/);
assert.doesNotMatch(legacyTask,/RouteChoiceWithInstructionConfirmation/);assert.match(legacyTask,/capabilities\.canProgress && task\.stage !== "PACK"/,"Generic exact progress is explicitly excluded for Pack.");
for(const label of ["Uploaded Source Files","Import Jobs","Operational Test Data","Product Inventory Data","Trash / Quarantine","Deletion History","Full Reset Guidance"])assert.match(dataPage,new RegExp(label));
assert.match(dataPage,/ownerPassword/);assert.match(dataPage,/confirmationPhrase/);assert.match(dataActions,/requireUser\(\["OWNER"\]\)/);assert.doesNotMatch(dataActions,/@\/lib\/prisma|\.\s*(?:create|update|delete|upsert)\s*\(/);
for(const control of ["createOwnerActionGrant","consumeOwnerActionGrant","previewDataAction","executeDataAction","QUARANTINING_FILES","FILES_QUARANTINED","DELETING_DATABASE_ROWS","VERIFYING","FAILED_RESTORED"])assert.match(dataService,new RegExp(control));
assert.match(dataApi,/user\.role\s*!==\s*"OWNER"/);assert.match(dataApi,/status:\s*403/);assert.match(dataApi,/previewDataAction/);
assert.doesNotMatch(dataPage,/actionKind="[^"]*RESET/,"Full database reset remains guidance-only, never a browser mutation.");

console.log("Stage 4.1 responsive UI and import-role contracts passed.");
