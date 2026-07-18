import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capabilityHomePath } from "../lib/auth";
import { hasWorkPermission, type WorkPermission, type WorkPermissionUser } from "../lib/work-permissions";
import { getMobilePermissions } from "../lib/mobile-permissions";
import { userCanMutateStage } from "../src/lib/workflow/worker-access";

const defaults={canPick:false,canMark:false,canAssemble:false,canPack:false,canReportProblem:false,canManageMarkingLibrary:false,canManageProcessRules:false,canViewAllWork:false,canViewConsignments:false,canImportConsignments:false,canManageConsignments:false};
const user=(role:"OWNER"|"PICKER"|"PACKER",permissions:Partial<typeof defaults>={}):WorkPermissionUser=>({role,...defaults,...permissions});
const all:WorkPermission[]=["canPick","canMark","canAssemble","canPack","canReportProblem","canManageMarkingLibrary","canManageProcessRules","canViewAllWork","canViewConsignments","canImportConsignments","canManageConsignments"];
for(const permission of all)assert.equal(hasWorkPermission(user("OWNER"),permission),true,`Owner has ${permission}`);
assert.equal(hasWorkPermission(user("PICKER"),"canPick"),false,"Role labels do not force Pick permission");assert.equal(hasWorkPermission(user("PICKER",{canPick:true}),"canPick"),true);assert.equal(hasWorkPermission(user("PICKER",{canPack:true}),"canPack"),true);assert.equal(hasWorkPermission(user("PACKER",{canPick:true}),"canPick"),true);assert.equal(hasWorkPermission(user("PACKER"),"canPack"),false,"Role labels do not force Pack permission");assert.equal(hasWorkPermission(user("PACKER",{canPack:true}),"canPack"),true);
assert.equal(userCanMutateStage(user("PICKER") as never,"PICK"),false,"The workflow resolver does not restore legacy PICKER grants");assert.equal(userCanMutateStage(user("PICKER",{canPick:true}) as never,"PICK"),true);assert.equal(userCanMutateStage(user("PACKER") as never,"PACK"),false,"The workflow resolver does not restore legacy PACKER grants");assert.equal(userCanMutateStage(user("PACKER",{canPack:true}) as never,"PACK"),true);assert.equal(userCanMutateStage(user("OWNER") as never,"ASSEMBLE"),true,"OWNER remains the only role bypass");
assert.equal(hasWorkPermission(user("PICKER",{canViewAllWork:true}),"canManageConsignments"),false,"View-all remains read-only");assert.equal(hasWorkPermission(user("PACKER",{canMark:true}),"canManageMarkingLibrary"),false,"Marking work does not grant library management");assert.equal(hasWorkPermission(user("PICKER",{canImportConsignments:true}),"canManageConsignments"),false,"Importer cannot activate consignments");
assert.equal(capabilityHomePath(user("OWNER") as never),"/dashboard","OWNER home remains the dashboard");
assert.equal(capabilityHomePath(user("PICKER") as never),"/accounts","A disabled PICKER is not redirected back to legacy Pick");
assert.equal(capabilityHomePath(user("PACKER") as never),"/accounts","A disabled PACKER is not redirected back to legacy Pack");
assert.equal(capabilityHomePath(user("PACKER",{canPick:true}) as never),"/work/pick","Explicit Pick permission, not the role label, selects modern Pick");
assert.equal(capabilityHomePath(user("PICKER",{canPack:true}) as never),"/work/pack","Explicit Pack permission, not the role label, selects modern Pack");
assert.equal(capabilityHomePath(user("PICKER",{canMark:true}) as never),"/work/mark");
assert.equal(capabilityHomePath(user("PACKER",{canAssemble:true}) as never),"/work/assemble");
assert.equal(capabilityHomePath(user("PICKER",{canViewAllWork:true}) as never),"/work");
assert.equal(capabilityHomePath(user("PICKER",{canReportProblem:true}) as never),"/work/problems");
assert.equal(capabilityHomePath(user("PACKER",{canViewConsignments:true}) as never),"/owner/consignments");
assert.equal(capabilityHomePath(user("PICKER",{canManageMarkingLibrary:true}) as never),"/owner/marking-library");
assert.equal(capabilityHomePath(user("PACKER",{canManageProcessRules:true}) as never),"/owner/process-rules");
const mobilePicker=getMobilePermissions(user("PICKER") as never),mobilePacker=getMobilePermissions(user("PACKER") as never);assert.equal(mobilePicker.canPick,false);assert.equal(mobilePicker.canReportProblem,false);assert.equal(mobilePacker.canPack,false);assert.equal(mobilePacker.canReportProblem,false);assert.equal(getMobilePermissions(user("PICKER",{canPick:true,canReportProblem:true}) as never).canPick,true);assert.equal(getMobilePermissions(user("OWNER") as never).canPack,true);
const nav=readFileSync("components/AppShell.tsx","utf8");for(const permission of ["canPick","canMark","canAssemble","canPack","canViewConsignments","canManageMarkingLibrary","canManageProcessRules"])assert.match(nav,new RegExp(`hasWorkPermission\\(user, "${permission}"\\)`),`Navigation checks ${permission}`);
const actions=readFileSync("app/owner/consignments/actions.ts","utf8");assert.match(actions,/requireWorkPermission\("canManageConsignments"\)/);assert.match(actions,/requireConsignmentAccess\("import"\)/);
for(const path of ["app/owner/consignments/[batchId]/TaskAssignmentPanel.tsx","app/work/problems/page.tsx"]){const source=readFileSync(path,"utf8");assert.match(source,/userCanMutateStage/);assert.doesNotMatch(source,/worker\.role\s*===\s*["'](?:PICKER|PACKER)["']/,"Assignment options must not restore disabled role-based stage grants");}
for(const path of ["app/picker/page.tsx","app/picker/[sku]/page.tsx","app/packing/page.tsx","app/packing/[awb]/page.tsx","app/work/page.tsx","app/work/scan/page.tsx","app/work/SmartStagePage.tsx","app/work/assembly/page.tsx","app/work/groups/[stage]/[groupKey]/page.tsx","app/work/marking/[taskId]/page.tsx","app/work/problems/page.tsx"]){const source=readFileSync(path,"utf8");assert.match(source,/redirect\(capabilityHomePath\(user\)\)/,`${path} sends denied direct access to an actually permitted destination`);assert.doesNotMatch(source,/roleHomePath|redirect\(["']\/(?:picker|packing)["']\)/,`${path} cannot create a role-label redirect loop`);}
for(const path of ["lib/auth.ts","lib/work-permissions.ts","lib/consignment-auth.ts","app/page.tsx","app/accounts/actions.ts","components/AppShell.tsx","app/packing/actions.ts","app/packing/[awb]/actions.ts"]){assert.doesNotMatch(readFileSync(path,"utf8"),/roleHomePath/,`${path} must not route from the compatibility role label`);}
const legacyProblems=readFileSync("app/problems/page.tsx","utf8");assert.match(legacyProblems,/requireUser\(\["OWNER"\]\)/,"Legacy customer-order Problems is OWNER-only");assert.doesNotMatch(legacyProblems,/requireUser\(\[[^\]]*"PACKER"/,"A PACKER role label cannot read the owner-only legacy Problems page");
console.log("Phase 7 permission matrix tests passed.");
