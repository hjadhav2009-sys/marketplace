import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PickSourceSelector } from "../app/work/pick/PickSourceSelector";
import { navigationForUser, type NavigationUser } from "../lib/app-navigation";
import { pickSourceLabel, resolvePickSource, supportedPickSources, type PickSummary } from "../src/lib/workflow/pick-workspace";

const read = (file: string) => readFileSync(file, "utf8");
const item = (cardCount: number, overrides: Partial<PickSummary["ORDER"]> = {}) => ({
  cardCount, itemCount: cardCount * 2, requiredQuantity: cardCount * 3, problems: 0, assignedToMe: 0,
  oldestWaitingAt: null, projectionUnavailable: false, projectionState: "READY", ...overrides,
});
const summary = (orders: number, consignments: number): PickSummary => ({ ORDER: item(orders), CONSIGNMENT: item(consignments) });

assert.deepEqual(supportedPickSources("FLIPKART"), ["ORDER", "CONSIGNMENT"]);
assert.deepEqual(supportedPickSources("AMAZON"), ["CONSIGNMENT"], "Amazon never exposes unsupported Daily Orders.");
assert.deepEqual(supportedPickSources("MEESHO"), []);
assert.equal(pickSourceLabel("ORDER"), "Customer Orders");
assert.equal(pickSourceLabel("CONSIGNMENT"), "Consignments");

assert.equal(resolvePickSource({ supportedSources: ["ORDER", "CONSIGNMENT"], summary: summary(4, 0) }).selectedSource, "ORDER");
assert.equal(resolvePickSource({ supportedSources: ["ORDER", "CONSIGNMENT"], summary: summary(0, 3) }).selectedSource, "CONSIGNMENT");
assert.equal(resolvePickSource({ supportedSources: ["ORDER", "CONSIGNMENT"], summary: summary(4, 3) }).selectedSource, "ORDER", "Both-active fallback is stable while the switcher remains available.");
assert.equal(resolvePickSource({ supportedSources: ["ORDER", "CONSIGNMENT"], summary: summary(4, 0), requestedSource: "CONSIGNMENT" }).selectedSource, "CONSIGNMENT", "A supported explicit empty source remains truthful.");
assert.equal(resolvePickSource({ supportedSources: ["CONSIGNMENT"], summary: summary(9, 0), requestedSource: "ORDER" }).selectedSource, "CONSIGNMENT", "An unsupported request falls back to the supported marketplace source.");
assert.equal(resolvePickSource({ supportedSources: ["ORDER", "CONSIGNMENT"], summary: summary(0, 0) }).selectedSource, null, "A two-source true empty state has no fake active source.");

const selector = renderToStaticMarkup(<PickSourceSelector initial={{ ORDER: item(2, { problems: 1, assignedToMe: 1 }), CONSIGNMENT: item(1) }} selectedSource="ORDER" supportedSources={["ORDER", "CONSIGNMENT"]} />);
assert.match(selector, /aria-label="Pick work source"/);
assert.match(selector, /Customer Orders/);
assert.match(selector, /Consignments/);
assert.match(selector, /min-h-16/, "Each source switch keeps at least the 44px operational minimum.");
assert.doesNotMatch(selector, />ORDER<|>CONSIGNMENT</, "Raw source codes are not worker-facing labels.");
assert.doesNotMatch(selector, /aria-current="page"/, "The source control never creates a second current page navigation item.");
const amazonSelector = renderToStaticMarkup(<PickSourceSelector initial={summary(0, 1)} selectedSource="CONSIGNMENT" supportedSources={["CONSIGNMENT"]} />);
assert.equal(amazonSelector, "", "A one-source marketplace does not render an unsupported or redundant switcher.");

const defaults: NavigationUser = { role: "PICKER", canPick: false, canPack: false, canReportProblem: false, canMark: false, canAssemble: false, canManageMarkingLibrary: false, canManageProcessRules: false, canViewAllWork: false, canViewConsignments: false, canImportConsignments: false, canManageConsignments: false };
const pickerLinks = navigationForUser({ ...defaults, canPick: true }).filter((link) => link.icon === "pick");
assert.deepEqual(pickerLinks.map((link) => [link.label, link.href]), [["Pick", "/work/pick"]], "Workers receive one canonical Pick navigation entry.");

const workspace = read("app/work/pick/PickWorkspace.tsx");
const legacy = read("app/work/consignments/pick/page.tsx");
const grouped = read("app/work/GroupedWorkCard.tsx");
const quickActions = read("components/work-card/GroupedQuickActions.tsx");
const routeDialog = read("components/work-card/WorkRouteDialogC1A.tsx");
const seed = read("scripts/staging/seed.ts");
for (const copy of ["Pick exact items and required quantity", "Pick queue temporarily unavailable", "No Pick work right now", "Page {page}"]) assert.match(workspace, new RegExp(copy));
assert.match(workspace, /selectedSource === "ORDER" \? "Customer Order" : "Consignment"/);
assert.match(workspace, /FeedbackBanner/);
assert.match(workspace, /EmptyState/);
assert.match(workspace, /getGroupedWork/);
assert.match(workspace, /hasWorkPermission\(user, "canPick"\)/);
assert.match(workspace, /user\.canViewAllWork/);
assert.match(legacy, /redirect\(`\/work\/pick\?\$\{destination\.toString\(\)\}`\)/);
assert.match(legacy, /query\.q\?\.trim\(\)/);
assert.match(legacy, /query\.status !== "active"/, "Search and historical status views remain as narrow legacy compatibility paths.");
assert.match(grouped, /label=\{card\.stage === "PICK" \? "Pick quantity"/);
assert.match(grouped, /Ready to pick/);
assert.match(grouped, /Picking in progress/);
assert.match(grouped, /Read-only Pick view/);
assert.match(grouped, /card\.status === "PROBLEM" \|\| card\.problemCount > 0/);
assert.match(quickActions, /card\.pendingQuantity > 1/);
assert.match(quickActions, /max = card\.requiredQuantity - 1/);
assert.match(routeDialog, /humanProcessRoute\(option\.flow\)/, "Pick route options use human-readable flow labels.");
for (const actionLabel of ["Direct to Pack", "Send to Marking", "Send to Assembly", "Marking then Assembly"]) assert.match(routeDialog, new RegExp(actionLabel));
for (const routeCode of ["PICK_PACK", "PICK_MARK_PACK", "PICK_ASSEMBLE_PACK", "PICK_MARK_ASSEMBLE_PACK"]) assert.doesNotMatch(workspace, new RegExp(routeCode), `The page does not expose raw route code ${routeCode}.`);
for (const fixture of ["stage4-line-amazon-pick", "stage4-account-pick-projection", "Synthetic C2 projection failure"]) assert.match(seed, new RegExp(fixture));

const protectedHashes: Record<string, string> = {
  "src/lib/workflow/route-decision-policy.ts": "7e80762e3062d66b8c30491cf3decef6f3325009e946a66f94299df271a3b53e",
  "src/lib/workflow/route-selection.ts": "d7f465a9cfe7b92254ea2d6479eb238dfca25f3eff729a2ed6fc0ca3c517402f",
  "src/lib/workflow/grouped-transition.ts": "5a52d4798bed591c1f6f8af9c6c6646e65ad6596595a5b7f9c797ffee4f2517c",
  "src/lib/workflow/grouped-progress.ts": "98592bc58d9e2ce8deff9417e4917415ad0ddf82d679d7b620fd0a2903890266",
  "src/lib/workflow/stage-transition.ts": "c357bfa890b8ef6549525463fe4ec98a5637c813047c5914959dfe2d20d574af",
  "src/lib/workflow/order-pack-scope.ts": "65e30f0f66dd536f16b92bed8b0979f9b13da4609a9ab45df7541b1d564ad6f3",
  "src/lib/workflow/order-problems.ts": "d2f6c7f2fb570883c93b7733832a3fc5e088654cd9b91cee00e67715b4533314",
  "src/lib/workflow/task-store.ts": "4b2585611526ff1a680b86c7a8c5c23c8845f861b239f4d5552f9325d8d7dfe8",
};
for (const [file, expected] of Object.entries(protectedHashes)) assert.equal(createHash("sha256").update(read(file)).digest("hex"), expected, `${file} crossed the protected C2 boundary.`);

console.log("Phase 7.4C2 Pick experience contracts passed.");
