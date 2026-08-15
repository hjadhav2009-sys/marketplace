import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkCardQuantity } from "../components/work-card/WorkCardQuantity";
import { humanProcessRoute, processRouteStages, WorkProcessFlow } from "../components/work-card/WorkProcessFlow";

const read = (file: string) => readFileSync(file, "utf8");
const overlay = read("components/worker-overlay/WorkerOverlay.tsx");
const route = read("components/work-card/WorkRouteDialogC1A.tsx");
const groupedQuick = read("components/work-card/GroupedQuickActions.tsx");
const taskQuick = read("components/work-card/WorkTaskQuickActions.tsx");
const grouped = read("app/work/GroupedWorkCard.tsx");
const task = read("app/work/WorkTaskCardView.tsx");
const groupApi = read("app/api/work/groups/[stage]/[groupKey]/route.ts");
const stageActions = read("app/work/stage-actions.ts");
const gallery = read("components/WorkImageGallery.tsx");

assert.deepEqual(processRouteStages("PICK_PACK"), ["PICK", "PACK"]);
assert.deepEqual(processRouteStages("PICK_MARK_PACK"), ["PICK", "MARK", "PACK"]);
assert.deepEqual(processRouteStages("PICK_ASSEMBLE_PACK"), ["PICK", "ASSEMBLE", "PACK"]);
assert.deepEqual(processRouteStages("PICK_MARK_ASSEMBLE_PACK"), ["PICK", "MARK", "ASSEMBLE", "PACK"]);
assert.equal(humanProcessRoute("PICK_MARK_ASSEMBLE_PACK"), "Pick → Mark → Assembly → Pack");
assert.doesNotMatch(humanProcessRoute("PICK_PACK"), /PICK_PACK/);

const flowMarkup = renderToStaticMarkup(<WorkProcessFlow currentStage="MARK" route="PICK_MARK_ASSEMBLE_PACK" />);
assert.match(flowMarkup, /Pick[\s\S]*Mark[\s\S]*Assembly[\s\S]*Pack/);
assert.match(flowMarkup, /Pick[\s\S]*completed/);
assert.match(flowMarkup, /Current stage Mark/);

const quantity = renderToStaticMarkup(<WorkCardQuantity stage="PICK" required={10} completed={4} assignment="Assigned · Picker A" />);
for (const value of ["10 required", "4 done", "6 remaining", "Assigned · Picker A", "role=\"progressbar\""]) assert.ok(quantity.includes(value), `Compact quantity lost ${value}`);
assert.doesNotMatch(quantity, /grid-cols-3/, "Compact quantity no longer renders three tall columns.");
const packageQuantity = renderToStaticMarkup(<WorkCardQuantity stage="PACK" required={9} completed={0} itemCount={3} mode="package" assignment="Assigned" />);
assert.match(packageQuantity, /3 items[\s\S]*9 units/);

for (const invariant of [/role="dialog"/, /aria-modal="true"/, /data-app-shell-root/, /\.inert = true/, /document\.body\.style\.overflow = "hidden"/, /event\.key === "Escape"/, /event\.key !== "Tab"/, /focusable\.includes\(document\.activeElement/, /history\.pushState/, /popstate/, /openerRef/, /createPortal/]) assert.match(overlay, invariant, `Overlay contract lost ${invariant}.`);
assert.match(overlay, /items-end md:items-center/, "Compact widths use a bottom sheet and desktop uses the requested surface alignment.");
assert.match(overlay, /max-h-\[90dvh\]/);
assert.match(overlay, /surface === "drawer"[\s\S]*md:ml-auto/);
assert.match(overlay, /surface === "lightbox"[\s\S]*md:mx-auto/);

for (const field of ["stage", "sourceType", "groupKey", "groupVersion", "taskId", "expectedQuantity", "route", "nextStage", "useRecommended", "clientRequestId", "routeReason", "routeOtherReason", "confirmMissingInstructions", "workerNote"]) assert.match(route, new RegExp(`name="${field}"`), `Process Flow lost ${field}.`);
assert.match(route, /ROUTE_CHANGE_REASONS\.map[\s\S]*type="radio"/, "True saved-route overrides use one-tap reason choices.");
assert.match(route, /reasonRequired[\s\S]*hasExplicitSavedRoute/, "Reason choices remain conditional on a true saved-route override.");
assert.match(route, /No machine settings or directions will be invented/);
assert.match(route, /Complete Pick & Send to/);
assert.doesNotMatch(route, /Request route change|Submit route request|Wait for approval|Owner approval required/i);

for (const field of ["stage", "sourceType", "groupKey", "groupVersion", "targetQuantity", "clientRequestId", "returnPath"]) assert.match(groupedQuick, new RegExp(`name="${field}"`), `Grouped Partial Quantity lost ${field}.`);
for (const field of ["taskId", "expectedQuantity", "targetQuantity", "clientRequestId", "returnPath"]) assert.match(taskQuick, new RegExp(`name="${field}"`), `Task Partial Quantity lost ${field}.`);
assert.match(groupedQuick, /setGroupedProgressAction/);
assert.match(taskQuick, /setTaskProgressAction/);

assert.match(groupApi, /getGroupedWorkDetails/);
assert.match(groupApi, /pageSize:25[\s\S]*historyPageSize:5/);
assert.doesNotMatch(groupApi, /Response\.json\(details\)/, "Quick Details never returns raw Prisma details.");
assert.match(groupApi, /problemReporter:[\s\S]*problemReportedAt:/, "Grouped Open Problem retains reporter and reported-time context.");
assert.match(groupedQuick + taskQuick, /Saved instructions are unavailable[\s\S]*No settings will be invented/, "Quick Details states known missing instructions truthfully.");
assert.match(groupedQuick + taskQuick, /Open full details/);
assert.match(groupedQuick, /tasks\.filter[\s\S]*selectedTaskId/);
assert.match(groupedQuick, /Choose the exact item/);
assert.match(stageActions, /reportGroupedProblemAction[\s\S]*reportWorkTaskProblem[\s\S]*reportOrderWorkflowProblem/);
assert.match(taskQuick, /reportTaskProblemAction/);

assert.match(gallery, /Open large image preview/);
assert.match(gallery, /surface: "lightbox"/);
assert.match(gallery, /ArrowLeft[\s\S]*preventDefault[\s\S]*ArrowRight/);
assert.match(gallery, /Previous[\s\S]*aria-live="polite"[\s\S]*Next/);

assert.doesNotMatch(grouped, /Identifiers and work context/);
assert.doesNotMatch(task, /Identifiers and route context|Prior stages|ProblemDisclosure/);
assert.match(grouped, /WorkRouteDialogC1A[\s\S]*GroupedQuickActions/);
assert.match(task, /WorkRouteDialogC1A[\s\S]*WorkTaskQuickActions/);

const protectedHashes: Record<string, string> = {
  "src/lib/workflow/route-decision-policy.ts": "7e80762e3062d66b8c30491cf3decef6f3325009e946a66f94299df271a3b53e",
  "src/lib/workflow/route-selection.ts": "d7f465a9cfe7b92254ea2d6479eb238dfca25f3eff729a2ed6fc0ca3c517402f",
  "src/lib/workflow/grouped-transition.ts": "5a52d4798bed591c1f6f8af9c6c6646e65ad6596595a5b7f9c797ffee4f2517c",
  "src/lib/workflow/grouped-progress.ts": "98592bc58d9e2ce8deff9417e4917415ad0ddf82d679d7b620fd0a2903890266",
  "src/lib/workflow/task-store.ts": "ab5e3a91fb46a8bdd7d9f6f9921d7211a4da524e6c4978ae69d33d5803b9b3cc",
  "src/lib/workflow/order-pack-scope.ts": "65e30f0f66dd536f16b92bed8b0979f9b13da4609a9ab45df7541b1d564ad6f3",
  "src/lib/workflow/worker-access.ts": "30b946c5facf23e977393c2031f5808a023cd5d753f1928a3cea2b93469a377c",
  "prisma/schema.prisma": "1d37d77d8564eade98a0153c898707e61e4cc25ac03892ec9a30fa5a4862cc78",
};
for (const [file, expected] of Object.entries(protectedHashes)) assert.equal(createHash("sha256").update(read(file)).digest("hex"), expected, `${file} changed across the protected C1A boundary.`);
assert.equal(createHash("sha256").update(read("app/work/actions.ts")).digest("hex"), "c0ae118554dd3841f7676b9a85aef88a0485c2670b68e7da5398a8ca1b0bf016", "Individual task server actions remain byte-identical.");

console.log("Phase 7.4C1A worker interaction surfaces and business-parity contracts passed.");
