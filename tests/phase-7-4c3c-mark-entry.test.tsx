import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCurrentNavigationId } from "../components/appNavigation";
import { navigationForUser, type NavigationUser } from "../lib/app-navigation";

const marker: NavigationUser = {
  role: "PICKER",
  canPick: false,
  canPack: false,
  canReportProblem: true,
  canMark: true,
  canAssemble: false,
  canManageMarkingLibrary: false,
  canManageProcessRules: false,
  canViewAllWork: false,
  canViewConsignments: false,
  canImportConsignments: false,
  canManageConsignments: false,
};

const links = navigationForUser(marker);
const marking = links.find((link) => link.id === "marking");
assert.equal(marking?.href, "/work/mark");
assert.deepEqual(marking?.ownedPaths, ["/work/marking"]);
assert.equal(resolveCurrentNavigationId("/work/mark", links), "marking");
assert.equal(resolveCurrentNavigationId("/work/marking", links), "marking");
assert.equal(resolveCurrentNavigationId("/work/marking/synthetic-task", links), "marking");

const legacyPage = readFileSync("app/work/marking/page.tsx", "utf8");
assert.match(legacyPage, /!query\.q\?\.trim\(\) && status === "active"/);
assert.match(legacyPage, /redirect\(`\/work\/mark\?\$\{destination\.toString\(\)\}`\)/);
assert.match(legacyPage, /query\.status === "completed"[\s\S]*query\.status === "problem"/);
assert.match(legacyPage, /WorkerQueuePage stage="MARK"/);
assert.match(legacyPage, /query\.success[\s\S]*query\.error/, "Canonical redirect carries safe action feedback.");

const detailPage = readFileSync("app/work/marking/[taskId]/page.tsx", "utf8");
assert.match(detailPage, /href="\/work\/mark\?source=CONSIGNMENT"[\s\S]*Back to Marking/);
assert.match(detailPage, /accountId:account\.id[\s\S]*sourceType:"CONSIGNMENT"[\s\S]*stage:"MARK"/);
assert.match(detailPage, /hasWorkPermission\(user,"canMark"\)\|\|user\.canViewAllWork/);

console.log("Phase 7.4C3C canonical Mark entry contracts passed.");
