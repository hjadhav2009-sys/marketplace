import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkProcessFlow } from "../components/work-card/WorkProcessFlow";
import {
  resolveWorkRoutePresentation,
  routeRelevantMissingInstructionStages,
  selectableForwardStages,
} from "../src/lib/workflow/work-route-presentation";

const read = (file: string) => readFileSync(file, "utf8");

const selections = {
  DIRECT_PACK: "PICK_PACK",
  MARK: "PICK_MARK_PACK",
  ASSEMBLE: "PICK_ASSEMBLE_PACK",
  MARK_ASSEMBLE: "PICK_MARK_ASSEMBLE_PACK",
} as const;
for (const [selection, expected] of Object.entries(selections)) {
  const result = resolveWorkRoutePresentation({
    routeSnapshotJson: JSON.stringify({ selectedActualRoute: selection }),
    savedProcessRoute: "PICK_PACK",
    currentStage: expected.includes("MARK") ? "MARK" : "PICK",
  });
  assert.equal(result.processRoute, expected);
  assert.equal(result.actualProcessRoute, expected);
  assert.equal(result.source, "ACTUAL_SELECTION");
}

assert.equal(resolveWorkRoutePresentation({ routeSnapshotJson: JSON.stringify({ actualProcessRoute: "PICK_MARK_ASSEMBLE_PACK" }), savedProcessRoute: "PICK_PACK", currentStage: "MARK" }).processRoute, "PICK_MARK_ASSEMBLE_PACK");
assert.equal(resolveWorkRoutePresentation({ routeSnapshotJson: JSON.stringify({ actualStages: ["PICK", "MARK", "PACK"] }), metadataJson: JSON.stringify({ processRoute: "PICK_ASSEMBLE_PACK" }), savedProcessRoute: "PICK_PACK", currentStage: "MARK" }).processRoute, "PICK_MARK_PACK");
assert.equal(resolveWorkRoutePresentation({ metadataJson: JSON.stringify({ processRoute: "PICK_ASSEMBLE_PACK" }), savedProcessRoute: "PICK_PACK", currentStage: "ASSEMBLE" }).processRoute, "PICK_ASSEMBLE_PACK");
assert.equal(resolveWorkRoutePresentation({ savedProcessRoute: "PICK_MARK_PACK", currentStage: "MARK" }).source, "SAVED_DEFAULT");
assert.equal(resolveWorkRoutePresentation({ currentStage: "PICK" }).source, "SYSTEM_FALLBACK");

const ambiguous = resolveWorkRoutePresentation({ routeSnapshotJson: JSON.stringify({ actualStages: ["PICK", "MARK"] }), savedProcessRoute: "PICK_PACK", currentStage: "MARK" });
assert.equal(ambiguous.actualProcessRoute, null, "A partial visited-stage prefix does not invent a future route.");
assert.equal(ambiguous.processRoute, "PICK_PACK");
assert.equal(ambiguous.degraded, true);
assert.equal(resolveWorkRoutePresentation({ routeSnapshotJson: "not-json", savedProcessRoute: "UNKNOWN", currentStage: "MARK" }).degraded, true);
assert.equal(resolveWorkRoutePresentation({ routeSnapshotJson: JSON.stringify({ actualProcessRoute: "PICK_BACKWARDS_PACK" }), currentStage: "PICK" }).processRoute, "PICK_PACK");
assert.equal(resolveWorkRoutePresentation({ routeSnapshotJson: JSON.stringify({ actualStages: ["PICK", "MARK", "MARK", "PACK"] }), currentStage: "MARK" }).actualProcessRoute, null);
assert.equal(resolveWorkRoutePresentation({ routeSnapshotJson: JSON.stringify({ actualProcessRoute: "PICK_MARK_PACK", padding: "x".repeat(60_000) }), savedProcessRoute: "PICK_PACK", currentStage: "MARK" }).source, "SAVED_DEFAULT");

assert.deepEqual(routeRelevantMissingInstructionStages(["PICK", "PACK"], ["MARK", "ASSEMBLE"]), []);
assert.deepEqual(routeRelevantMissingInstructionStages(["PICK", "MARK", "PACK"], ["MARK", "ASSEMBLE"]), ["MARK"]);
assert.deepEqual(routeRelevantMissingInstructionStages(["PICK", "ASSEMBLE", "PACK"], ["MARK", "ASSEMBLE"]), ["ASSEMBLE"]);
assert.deepEqual(routeRelevantMissingInstructionStages(["PICK", "MARK", "ASSEMBLE", "PACK"], ["MARK", "ASSEMBLE"]), ["MARK", "ASSEMBLE"]);
assert.deepEqual(selectableForwardStages("MARK", ["PICK", "MARK"], ["PICK"]), ["ASSEMBLE", "PACK"]);
assert.deepEqual(selectableForwardStages("MARK", ["PICK", "MARK", "ASSEMBLE", "PACK"], ["PICK"]), [], "The UI does not offer destinations the protected service currently rejects as already selected.");

const mismatchMarkup = renderToStaticMarkup(<WorkProcessFlow currentStage="MARK" route="PICK_PACK" />);
assert.match(mismatchMarkup, /Current stage: Mark/);
assert.match(mismatchMarkup, /not represented in this flow/);
assert.match(mismatchMarkup, /data-route-degraded="true"/);
assert.doesNotMatch(mismatchMarkup, /completed/, "A missing current stage never silently makes Pick completed/current.");

const taskQuick = read("components/work-card/WorkTaskQuickActions.tsx");
assert.match(taskQuick, /model\.required - model\.completed > 1/);
assert.match(taskQuick, /min=\{model\.completed \+ 1\}/);
assert.match(taskQuick, /max=\{model\.required - 1\}/);
assert.match(taskQuick, /defaultValue=\{model\.completed \+ 1\}/);
assert.doesNotMatch(taskQuick, /useId/);
assert.match(taskQuick, /requestBase}:partial/);
assert.match(taskQuick, /requestBase}:problem/);
assert.match(taskQuick, /model\.instructions\.length[\s\S]*model\.missingInstructionStages\.length/, "Available copy cannot hide a required missing-instruction warning.");

const taskView = read("app/work/WorkTaskCardView.tsx");
assert.match(taskView, /requestBase = `\$\{task\.id\.slice\(0, 60\)\}:\$\{task\.version\}:\$\{randomUUID\(\)\}`/);
assert.match(taskView, /resolveWorkRoutePresentation/);
assert.match(taskView, /routeRelevantMissingInstructionStages/);
assert.match(taskView, /imageUrl1[\s\S]*imageUrl2[\s\S]*imageUrl3/, "The worker fixture can prove multi-image preview keyboard behavior.");

const queue = read("src/lib/workflow/queues.ts");
assert.match(queue, /mainImageUrl: true, imageUrl1: true, imageUrl2: true, imageUrl3: true/);
const seed = read("scripts/staging/seed.ts");
for (const fixture of ["stage4-c1a1-case-a", "stage4-c1a1-case-b", "stage4-c1a1-case-c", "stage4-c1a1-case-d"]) assert.match(seed, new RegExp(fixture));

const routeDialog = read("components/work-card/WorkRouteDialogC1A.tsx");
assert.match(routeDialog, /PICK_MARK_PACK/);
assert.match(routeDialog, /PICK_MARK_ASSEMBLE_PACK/);
assert.match(routeDialog, /Current work flow/);
assert.match(routeDialog, /Saved product default/);
assert.match(routeDialog, /completeQuickStageRouteAction/);
assert.match(routeDialog, /card\.savedProcessRoute/, "Saved-default reason comparison remains separate from current-flow presentation.");

const gallery = read("components/WorkImageGallery.tsx");
assert.match(gallery, /window\.addEventListener\("keydown", onKeyDown\)/);
assert.match(gallery, /window\.removeEventListener\("keydown", onKeyDown\)/);
assert.match(gallery, /images\.length <= 1/);
assert.doesNotMatch(gallery, /className="grid gap-3" onKeyDown/, "The preview no longer double-handles arrows from focused inner content.");

const quickRouteAction = read("app/work/quick-route-actions.ts");
assert.match(quickRouteAction, /completeStageAndChooseNext/);
assert.match(quickRouteAction, /expectedVersion/);
assert.match(quickRouteAction, /expectedCompletedQuantity/);
assert.match(quickRouteAction, /routeReason/);
assert.match(quickRouteAction, /confirmMissingInstructions/);

const taskStore = read("src/lib/workflow/task-store.ts");
assert.match(taskStore, /task\.stage === "PICK" && requestKind !== "COMPLETE" && targetQuantity === task\.requiredQuantity/);
assert.match(taskStore, /Use Complete Pick and choose a processing flow to finish picking/);

const protectedHashes: Record<string, string> = {
  "src/lib/workflow/route-decision-policy.ts": "7e80762e3062d66b8c30491cf3decef6f3325009e946a66f94299df271a3b53e",
  "src/lib/workflow/route-selection.ts": "d7f465a9cfe7b92254ea2d6479eb238dfca25f3eff729a2ed6fc0ca3c517402f",
  "src/lib/workflow/grouped-transition.ts": "ac4c205be3bb2f774e215d752f4e19bd65a57ebbf9515bd67e0663632fddd49e",
  "src/lib/workflow/grouped-progress.ts": "3f53d7b582d950ab216a92c17d4dd5cf0d559483e99137a502b3b7ca13439c56",
  "src/lib/workflow/stage-transition.ts": "d104a70482a5d438885fd7f5df53bc5b2bd44de681bd0031d1bddc6139db3d2b",
  "src/lib/workflow/order-pack-scope.ts": "65e30f0f66dd536f16b92bed8b0979f9b13da4609a9ab45df7541b1d564ad6f3",
  "src/lib/workflow/order-problems.ts": "d2f6c7f2fb570883c93b7733832a3fc5e088654cd9b91cee00e67715b4533314",
  "prisma/schema.prisma": "1d37d77d8564eaDE98A0153C898707E61E4CC25AC03892EC9A30FA5A4862CC78".toLowerCase(),
};
for (const [file, expected] of Object.entries(protectedHashes)) assert.equal(createHash("sha256").update(read(file)).digest("hex"), expected, `${file} crossed the protected C1A.1 boundary.`);

console.log("Phase 7.4C1A.1 interaction-truth source contracts passed.");
