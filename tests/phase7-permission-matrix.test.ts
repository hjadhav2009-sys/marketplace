import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasWorkPermission, type WorkPermission, type WorkPermissionUser } from "../lib/work-permissions";

const defaults={canPick:false,canMark:false,canAssemble:false,canPack:false,canReportProblem:false,canManageMarkingLibrary:false,canManageProcessRules:false,canViewAllWork:false,canViewConsignments:false,canImportConsignments:false,canManageConsignments:false};
const user=(role:"OWNER"|"PICKER"|"PACKER",permissions:Partial<typeof defaults>={}):WorkPermissionUser=>({role,...defaults,...permissions});
const all:WorkPermission[]=["canPick","canMark","canAssemble","canPack","canReportProblem","canManageMarkingLibrary","canManageProcessRules","canViewAllWork","canViewConsignments","canImportConsignments","canManageConsignments"];
for(const permission of all)assert.equal(hasWorkPermission(user("OWNER"),permission),true,`Owner has ${permission}`);
assert.equal(hasWorkPermission(user("PICKER"),"canPick"),true);assert.equal(hasWorkPermission(user("PICKER",{canPack:true}),"canPack"),true);assert.equal(hasWorkPermission(user("PACKER",{canPick:true}),"canPick"),true);assert.equal(hasWorkPermission(user("PACKER"),"canPack"),true);
assert.equal(hasWorkPermission(user("PICKER",{canViewAllWork:true}),"canManageConsignments"),false,"View-all remains read-only");assert.equal(hasWorkPermission(user("PACKER",{canMark:true}),"canManageMarkingLibrary"),false,"Marking work does not grant library management");assert.equal(hasWorkPermission(user("PICKER",{canImportConsignments:true}),"canManageConsignments"),false,"Importer cannot activate consignments");
const nav=readFileSync("components/AppShell.tsx","utf8");for(const permission of ["canPick","canMark","canAssemble","canPack","canViewConsignments","canManageMarkingLibrary","canManageProcessRules"])assert.match(nav,new RegExp(`hasWorkPermission\\(user, "${permission}"\\)`),`Navigation checks ${permission}`);
const actions=readFileSync("app/owner/consignments/actions.ts","utf8");assert.match(actions,/requireWorkPermission\("canManageConsignments"\)/);assert.match(actions,/requireConsignmentAccess\("import"\)/);
console.log("Phase 7 permission matrix tests passed.");
