import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { marketplaceCapabilities } from "../src/lib/marketplace-capabilities";

assert.equal(marketplaceCapabilities("MEESHO").dailyOrders,false);
assert.equal(marketplaceCapabilities("AMAZON").dailyOrders,false);
assert.equal(marketplaceCapabilities("FLIPKART").dailyOrders,true);
assert.doesNotMatch(readFileSync("app/picker/[sku]/actions.ts","utf8"),/prisma\.(?:order|problemOrder)\.(?:update|updateMany|create)/);
assert.match(readFileSync("components/UniversalScannerPanel.tsx","utf8"),/workGroupKey/);
assert.doesNotMatch(readFileSync("app/work/ExactMemberSelection.tsx","utf8"),/selected\.slice\(\)\.sort\(\)\.join/);
const image=readFileSync("components/ProductImage.tsx","utf8"),legacyCard=readFileSync("app/work/WorkTaskCard.tsx","utf8"),routeChoice=readFileSync("components/RouteChoiceWithInstructionConfirmation.tsx","utf8");assert.match(image,/IntersectionObserver/);assert.match(image,/if \(!eligibleToLoad/);assert.match(legacyCard,/hasExplicitSavedRoute=\{provenance\?\.hasExplicitSavedRoute\}/);assert.match(routeChoice,/const override=hasExplicitSavedRoute/);assert.match(routeChoice,/reason==="Other"/);
assert.match(readFileSync("src/lib/workflow/work-group-projection.ts","utf8"),/return \{ active, projectedActive/);
assert.doesNotMatch(readFileSync("src/lib/workflow/work-group-projection.ts","utf8").split("export async function ensureWorkGroupProjection")[1]??"",/rebuildWorkGroupProjection\(/);
console.log("Phase 7.3.4 source hardening tests passed.");
