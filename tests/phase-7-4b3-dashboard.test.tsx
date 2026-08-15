import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { WorkStage } from "@prisma/client";
import { dashboardActions, dashboardImportTypeLabel, dashboardStage } from "../lib/dashboard";

const read = (file: string) => readFileSync(file, "utf8");
const page = read("app/dashboard/page.tsx");
const model = read("lib/dashboard.ts");
const loading = read("app/dashboard/loading.tsx");
const globals = read("app/globals.css");
const seed = read("scripts/staging/seed.ts");

assert.doesNotMatch(page, /import Flipkart files/i, "The Dashboard description is marketplace-neutral.");
assert.doesNotMatch(page, /latestListingImport|FLIPKART_LISTING_MASTER/, "The page does not hard-code Flipkart Listing Master as catalog history.");
assert.match(model, /FLIPKART_PRODUCT_INVENTORY[\s\S]*FLIPKART_LISTING_MASTER[\s\S]*AMAZON_PRODUCT_INVENTORY/, "The read model recognizes current marketplace catalog jobs.");

const flipkartActions = dashboardActions("FLIPKART");
const amazonActions = dashboardActions("AMAZON");
assert.ok(flipkartActions.imports.some((action) => action.href === "/owner/product-inventory/refresh"), "Product Inventory uses the current refresh route.");
assert.ok(flipkartActions.imports.some((action) => action.label === "Import Daily Orders"), "Flipkart receives its enabled Daily Orders action.");
assert.ok(!amazonActions.imports.some((action) => action.label === "Import Daily Orders"), "Amazon does not receive Daily Orders.");
assert.ok(flipkartActions.imports.some((action) => action.href === "/owner/consignments/new"), "Enabled Consignments receive the existing create route.");
assert.ok(dashboardActions("MYNTRA").imports.every((action) => !action.href.includes("consignments")), "Disabled Consignments are not rendered as actions.");
assert.ok(flipkartActions.imports.some((action) => action.href === "/owner/imports"), "Import History keeps its current destination.");

assert.match(page, /href=\{`\/owner\/imports\/\$\{job\.id\}`\}/, "Recent imports use current ImportJob detail URLs.");
assert.match(model, /getSmartStageSummary/, "Queue metrics reuse the existing smart-stage summary.");
for (const stage of ["PICK", "MARK", "ASSEMBLE", "PACK"] as WorkStage[]) assert.ok(model.includes(`"${stage}"`), `${stage} is represented in the stable four-stage model.`);

const source = (cardCount: number, itemCount: number, requiredQuantity: number, projectionUnavailable = false) => ({
  cardCount, itemCount, requiredQuantity, problems: 0, assignedToMe: 0, oldestWaitingAt: null, projectionUnavailable, projectionState: projectionUnavailable ? "STALE" : "READY",
});
const combined = dashboardStage("PICK", { ORDER: source(3, 5, 8), CONSIGNMENT: source(2, 4, 7) });
assert.deepEqual({ cards: combined.cardCount, items: combined.itemCount, units: combined.requiredQuantity }, { cards: 5, items: 9, units: 15 }, "Order and Consignment summaries combine without loading task rows.");
const unavailable = dashboardStage("PACK", { ORDER: source(0, 0, 0, true), CONSIGNMENT: source(2, 2, 2) });
assert.equal(unavailable.cardCount, null, "Unavailable projections never become a false zero.");
const amazonPick = dashboardStage("PICK", { ORDER: source(0, 0, 0), CONSIGNMENT: source(2, 3, 4) }, { dailyOrders: false, consignments: true });
assert.equal(amazonPick.href, "/work", "A marketplace without Daily Orders uses the source-neutral Work Hub destination.");
assert.equal(amazonPick.showOrders, false, "A disabled Order source is omitted from stage details.");
assert.equal(amazonPick.showConsignments, true, "The enabled Consignment source remains explicit.");
assert.match(model, /capabilities\.dailyOrders[\s\S]*prisma\.order\.count[\s\S]*Promise\.resolve\(null\)/, "Order-only today metrics are not queried for marketplaces without Daily Orders.");
assert.match(model, /capabilities\.dailyOrders[\s\S]*prisma\.problemOrder\.count[\s\S]*Promise\.resolve\(null\)/, "Order-only problem metrics are not queried for marketplaces without Daily Orders.");
assert.match(page, /data-dashboard-queue-value/, "Mobile exposes a queue value in the first operational pulse.");
assert.match(page, /data-dashboard-attention-cue/, "Mobile exposes an attention cue in the first operational pulse.");

assert.equal(dashboardImportTypeLabel({ marketplace: "AMAZON", importType: "AMAZON_PRODUCT_INVENTORY" }), "Amazon Product Catalog");
assert.equal(dashboardImportTypeLabel({ marketplace: "FLIPKART", importType: "FLIPKART_ORDER" }), "Flipkart Daily Orders");
assert.match(page, /StatusBadge value=\{job\.status\}/, "Current import status remains explicit text plus the shared marker.");
assert.doesNotMatch(page, /SubmitButton|<form|prisma\..*(create|update|delete)|startImport|completeWork/, "Dashboard wires no mutation or server action.");
assert.match(page, /min-w-0/);
assert.match(page, /minmax\(0,1fr\)/);
assert.match(page, /overflow-wrap:anywhere/);
assert.doesNotMatch(page + loading, /overflow-x-hidden/);
assert.doesNotMatch(globals, /html[^}]*overflow-x:\s*hidden|body[^}]*overflow-x:\s*hidden/, "B3 adds no global overflow masking.");
assert.match(page, /buttonStyles/, "Dashboard actions reuse the B1 action contract.");
assert.match(page, /Metric/);
assert.match(page, /Surface/);
assert.match(page, /FeedbackBanner/);
assert.match(page, /EmptyState/);
assert.match(seed, /stage4-import-amazon-completed/);
assert.match(seed, /attention-and-long-filename/);
assert.match(seed, /COMPLETED_WITH_WARNINGS/);
assert.doesNotMatch(loading, /animate-|transition/, "The loading geometry adds no decorative motion.");

console.log("Phase 7.4B3 Dashboard read-model and source invariants passed.");
