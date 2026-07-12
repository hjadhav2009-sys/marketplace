import { performance } from "node:perf_hooks";
import { createPhase7ScaleDatabase, PHASE7_SCALE_PRESETS, type Phase7ScalePreset } from "./phase7-scale-data";
import { resolveUniversalWork } from "../src/lib/workflow/universal-resolver";

const preset = (process.argv[2] ?? process.env.PHASE7_SCALE_PRESET ?? "small") as Phase7ScalePreset;
if (!(preset in PHASE7_SCALE_PRESETS)) throw new Error("Preset must be small, medium, large, or full.");
const seeded = await createPhase7ScaleDatabase(preset);
const scenarios = [
  ["Exact AWB", "P7-AWB-1"], ["Tracking shipment", "P7-TRACK-GROUP"], ["Seller SKU", "P7-SELLER_SKU-28"],
  ["FSN", "P7-FSN-1"], ["Listing ID", "P7-LISTING_ID-2"], ["FNSKU registry", "P7-FNSKU-4"],
  ["Amazon snapshot FNSKU", "P7-FNSKU-1"], ["ASIN", "B000000001"], ["External ID", "P7-EXTERNAL-1"],
  ["Barcode", "8900000000001"], ["WorkTask ID", "p7-task-1"], ["Consignment number", "P7-CN-p7-account-0"],
  ["Duplicate marketplaces/accounts", "P7-DUPLICATE-CODE"], ["Assigned high cardinality", `p7-task-${seeded.config.tasks - 1}`],
  ["Completed only", "p7-task-3"], ["No result", "P7-NOT-FOUND"]
] as const;
const before = process.memoryUsage().heapUsed;
for (const [label, code] of scenarios) {
  const coldStart = performance.now(); const coldResult = await resolveUniversalWork({ actorUserId: "p7-owner", code }, seeded.db); const cold = performance.now() - coldStart;
  const warm: number[] = [];
  for (let index = 0; index < 10; index += 1) { const start = performance.now(); await resolveUniversalWork({ actorUserId: "p7-owner", code }, seeded.db); warm.push(performance.now() - start); }
  warm.sort((a,b)=>a-b); const percentile=(value:number)=>warm[Math.min(warm.length-1,Math.ceil(warm.length*value)-1)];
  console.log(JSON.stringify({ label, coldMs:Number(cold.toFixed(2)), warmP50Ms:Number(percentile(.5).toFixed(2)), warmP95Ms:Number(percentile(.95).toFixed(2)), warmMaxMs:Number(warm.at(-1)!.toFixed(2)), resultCount:coldResult.candidates.length, searchedAccountCount:coldResult.searchedAccountCount }));
}
console.log(JSON.stringify({ preset, databaseBytes: seeded.databaseBytes, heapBeforeBytes: before, heapAfterBytes: process.memoryUsage().heapUsed }));
await seeded.db.$disconnect();
