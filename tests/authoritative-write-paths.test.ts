import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked=execFileSync("git",["ls-files","-z"],{encoding:"utf8"}).split("\0").filter(path=>/^(app|lib|src|scripts)\/.*\.(?:ts|tsx|mjs)$/.test(path));
const sensitive=/\b(?:prisma|tx|client)\.(?:order|workTask|consignmentLine|consignmentBatch|marketplaceListing|marketplaceListingIdentifier|importJob|account|user|userDeviceSession|session|passwordResetRequest|securityThrottle)\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/;
const allow=new Set([
 "app/api/mobile/accounts/select/route.ts","app/api/mobile/auth/change-password/route.ts","app/api/mobile/auth/login/route.ts","app/change-password/actions.ts","app/forgot-password/actions.ts","app/login/actions.ts","app/owner/accounts/actions.ts","app/owner/consignments/actions.ts","app/owner/old-pending/actions.ts","app/owner/users/actions.ts","app/packing/actions.ts","app/setup/actions.ts","lib/account-lifecycle.ts","lib/auth.ts","lib/import/orders.ts","lib/security-throttle.ts","scripts/operational-retention.ts","scripts/repair-legacy-order-workflow.ts","src/lib/consignments/adaptive-mapping.ts","src/lib/consignments/amazon/import-service.ts","src/lib/consignments/import-service.ts","src/lib/consignments/resume-mapped-import.ts","src/lib/import-jobs/runner.ts","src/lib/import-jobs/store.ts","src/lib/imports/adaptive-rows.ts","src/lib/marketplaces/flipkart/import.ts","src/lib/marking/identifiers.ts","src/lib/product-inventory/jobs.ts","src/lib/product-inventory/merge.ts","src/lib/workflow/grouped-progress.ts","src/lib/workflow/grouped-transition.ts","src/lib/workflow/order-assembly.ts","src/lib/workflow/order-pack-scope.ts","src/lib/workflow/order-picking.ts","src/lib/workflow/order-problems.ts","src/lib/workflow/order-route-tasks.ts","src/lib/workflow/route-selection.ts","src/lib/workflow/stage-transition.ts","src/lib/workflow/task-store.ts"
]);
const found=tracked.filter(path=>sensitive.test(readFileSync(path,"utf8"))),unreviewed=found.filter(path=>!allow.has(path));
assert.deepEqual(unreviewed,[],`Sensitive mutations require authoritative-path review: ${unreviewed.join(", ")}`);
const taskStore=readFileSync("src/lib/workflow/task-store.ts","utf8"),card=readFileSync("app/work/WorkTaskCard.tsx","utf8"),statusRoute=readFileSync("app/owner/imports/[jobId]/status/route.ts","utf8");
assert.match(taskStore,/task\.stage === "PACK"[\s\S]{0,120}Packing must use the authoritative Pack Completed action/);
assert.match(card,/task\.stage!=="PACK"/);
assert.doesNotMatch(statusRoute,/startImportJob|startProductInventoryJob/);
console.log(`Authoritative write-path policy passed for ${found.length} reviewed mutation files.`);
