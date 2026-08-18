import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkingGuidance } from "../components/work-card/MarkingGuidance";
import { MarkSourceSelector } from "../app/work/mark/MarkSourceSelector";
import { combinedMarkMetrics, markSourceLabel, resolveMarkSource, supportedMarkSources, type MarkSummary } from "../src/lib/workflow/mark-workspace";
import { parseManualMarkingGuidance, resolveMarkingGuidance } from "../src/lib/workflow/marking-guidance";

const read = (file: string) => readFileSync(file, "utf8");
const summaryItem = (cardCount: number, overrides = {}) => ({ cardCount, itemCount: cardCount * 2, requiredQuantity: cardCount * 3, problems: 0, assignedToMe: 0, oldestWaitingAt: null, projectionUnavailable: false, projectionState: "READY", ...overrides });
const summary = (orders: number, consignments: number): MarkSummary => ({ ORDER: summaryItem(orders), CONSIGNMENT: summaryItem(consignments) });

assert.deepEqual(supportedMarkSources("FLIPKART"), ["ORDER", "CONSIGNMENT"]);
assert.deepEqual(supportedMarkSources("AMAZON"), ["CONSIGNMENT"]);
assert.equal(markSourceLabel("ORDER"), "Customer Orders");
assert.equal(markSourceLabel("CONSIGNMENT"), "Consignments");
assert.equal(resolveMarkSource({ summary: summary(3, 0), supportedSources: ["ORDER", "CONSIGNMENT"] }).selectedSource, "ORDER");
assert.equal(resolveMarkSource({ summary: summary(0, 2), supportedSources: ["ORDER", "CONSIGNMENT"] }).selectedSource, "CONSIGNMENT");
assert.equal(resolveMarkSource({ summary: summary(3, 2), supportedSources: ["ORDER", "CONSIGNMENT"] }).selectedSource, null, "Two active sources require an explicit worker choice.");
assert.equal(resolveMarkSource({ requestedSource: "CONSIGNMENT", summary: summary(3, 2), supportedSources: ["ORDER", "CONSIGNMENT"] }).selectedSource, "CONSIGNMENT");
assert.deepEqual(combinedMarkMetrics({ ORDER: summaryItem(2, { problems: 1, assignedToMe: 1 }), CONSIGNMENT: summaryItem(3, { problems: 2, assignedToMe: 2 }) }, ["ORDER", "CONSIGNMENT"]), { openWork: 5, requiredQuantity: 15, problems: 3, assignedToMe: 3 });

const selector = renderToStaticMarkup(<MarkSourceSelector initial={{ ORDER: summaryItem(2, { problems: 1, assignedToMe: 1, oldestWaitingAt: "2026-01-01T00:00:00.000Z" }), CONSIGNMENT: summaryItem(1) }} selectedSource={null} sources={["ORDER", "CONSIGNMENT"]}/>);
for (const copy of ["Marking work source", "Customer Orders", "Consignments", "2 open", "6 units", "1 problems", "1 assigned to me", "Oldest"]) assert.match(selector, new RegExp(copy));
assert.doesNotMatch(selector, />ORDER<|>CONSIGNMENT</, "Raw source enum values are not worker-facing labels.");
assert.match(read("app/work/mark/MarkSourceSelector.tsx"), /timeZone: "Asia\/Kolkata"/, "Server and browser render the same operational timestamp.");

const metadata = JSON.stringify({ version: 1, source: "PROCESS_RULE", routeChoice: "MARK", processRoute: "PICK_MARK_PACK", requestFingerprint: "synthetic", marketplaceListingId: "listing", processRuleId: "rule", markingAssetId: "asset", markingAssetName: "Shiv Pendant Front", masterDesignId: "MD-1042", material: "Steel", markingPosition: "Front centre", markingWidthMm: 20, markingHeightMm: 10, powerSetting: 30, speedSetting: 500, frequencySetting: 25, passes: 1, instructions: "Keep engraving centered inside the border.", sellerSkuSnapshot: "SKU-MARK", requestedByUserId: "worker", requestedAt: "2026-01-01T00:00:00.000Z" });
const guidance = resolveMarkingGuidance({ metadataJson: metadata });
assert.ok(guidance);
assert.equal(guidance.source, "TASK_SNAPSHOT");
assert.equal(guidance.masterDesignId, "MD-1042");
assert.equal(guidance.power, 30);
const guidanceMarkup = renderToStaticMarkup(<MarkingGuidance guidance={guidance}/>);
for (const copy of ["Marking guidance", "MD-1042", "Shiv Pendant Front", "Front centre", "20 × 10 mm", "Power", "30", "Speed", "500", "Frequency", "25", "1 pass", "Keep engraving centered"]) assert.match(guidanceMarkup, new RegExp(copy));
assert.doesNotMatch(guidanceMarkup, /PROCESS_RULE|requestFingerprint|markingAssetId|managedRelativePath|PICK_MARK_PACK/);

const routeSnapshot = { processRuleId: "rule", markingAssetId: "asset", markingAssetName: "Immutable route design", masterDesignId: "MD-ROUTE", instructions: "Use saved route instructions." };
assert.equal(resolveMarkingGuidance({ metadataJson: "malformed", routeSnapshot })?.source, "ROUTE_SNAPSHOT");
assert.equal(resolveMarkingGuidance({ metadataJson: metadata, routeSnapshot })?.designName, "Shiv Pendant Front", "Task snapshot wins before route or live legacy data.");
assert.equal(resolveMarkingGuidance({ metadataJson: null, routeSnapshot: null, legacyAsset: { name: "Legacy design", instructions: "Legacy approved note" } })?.source, "LEGACY_ASSET");
assert.equal(resolveMarkingGuidance({ metadataJson: "{", routeSnapshot: null }), null);

const manual = parseManualMarkingGuidance(JSON.stringify({ instructionStatus: "MISSING", warning: "Saved marking instructions unavailable", routedByUserId: "private-user-id", routedAt: "2026-01-02T03:04:05.000Z", workerNote: "Use the approved paper template." }));
assert.ok(manual);
const manualMarkup = renderToStaticMarkup(<MarkingGuidance manual={manual}/>);
assert.match(manualMarkup, /authorized worker/);
assert.match(manualMarkup, /Use the approved paper template/);
assert.doesNotMatch(manualMarkup, /private-user-id/, "Internal user IDs never reach worker guidance.");
assert.equal(parseManualMarkingGuidance(JSON.stringify({ instructionStatus: "MISSING", warning: "Missing", routedAt: "not-a-date" })), null);

const workspace = read("app/work/mark/MarkWorkspace.tsx");
const groupedCard = read("app/work/GroupedWorkCard.tsx");
const taskCard = read("app/work/WorkTaskCardView.tsx");
const groupedQuick = read("components/work-card/GroupedQuickActions.tsx");
const taskQuick = read("components/work-card/WorkTaskQuickActions.tsx");
const seed = read("scripts/staging/seed.ts");
for (const copy of ["Review the product, marking instructions and quantity", "Open work", "Required quantity", "Assigned to me", "No active marking work", "Marking queue temporarily unavailable", "FeedbackBanner", "EmptyState"]) assert.match(workspace, new RegExp(copy));
assert.match(groupedCard, /card\.stage === "MARK" && \(routeCard\.selectableNextStages\?\.length \?\? 0\) <= 1/);
assert.match(groupedCard, /name="useRecommended" value="1"/);
assert.match(groupedCard, /WorkRouteActionButton card=\{routeCard\} label=\{completionLabel\}/, "Unresolved Mark keeps the existing Process Flow chooser.");
for (const source of [groupedCard, taskCard]) assert.match(source, /MarkingGuidance/);
for (const source of [groupedQuick, taskQuick]) assert.match(source, /MarkingDetails/);
assert.match(taskCard, /task\.stage === "MARK" \? "Marking Completed"/);
assert.match(groupedQuick, /card\.pendingQuantity > 1/);
assert.match(taskQuick, /model\.required - model\.completed > 1/);
assert.doesNotMatch(workspace, /PICK_MARK_PACK|PICK_MARK_ASSEMBLE_PACK/);
for (const fixture of ["stage4-c3b-manual", "stage4-c3b-problem", "stage4-c3b-gallery", "stage4-c3b-assigned-other", "stage4-order-mark-projection-failure"]) assert.match(seed, new RegExp(fixture));

const protectedHashes: Record<string, string> = {
  "src/lib/workflow/route-decision-policy.ts": "7e80762e3062d66b8c30491cf3decef6f3325009e946a66f94299df271a3b53e",
  "src/lib/workflow/route-selection.ts": "d7f465a9cfe7b92254ea2d6479eb238dfca25f3eff729a2ed6fc0ca3c517402f",
  "src/lib/workflow/grouped-transition.ts": "ac4c205be3bb2f774e215d752f4e19bd65a57ebbf9515bd67e0663632fddd49e",
  "src/lib/workflow/grouped-progress.ts": "3f53d7b582d950ab216a92c17d4dd5cf0d559483e99137a502b3b7ca13439c56",
  "src/lib/workflow/stage-transition.ts": "d104a70482a5d438885fd7f5df53bc5b2bd44de681bd0031d1bddc6139db3d2b",
  "src/lib/workflow/order-pack-scope.ts": "c216b0ea7d7ed33e95eff2e0f21abbf8133150fa6b41e5321ab3f0892dcc11cf",
  "src/lib/workflow/order-problems.ts": "d2f6c7f2fb570883c93b7733832a3fc5e088654cd9b91cee00e67715b4533314",
  "src/lib/workflow/task-store.ts": "5e686e2621e8b3ad193480f6663c7be094ad5c68df90c4eef14d912115bfbc8a",
};
for (const [file, expected] of Object.entries(protectedHashes)) assert.equal(createHash("sha256").update(read(file)).digest("hex"), expected, `${file} crossed the protected C3 UI boundary.`);

console.log("Phase 7.4C3 Mark experience contracts passed.");
