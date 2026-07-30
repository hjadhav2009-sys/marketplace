import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importJobPage = readFileSync("app/owner/imports/[jobId]/page.tsx", "utf8");
const packPage = readFileSync("app/packing/[awb]/page.tsx", "utf8");

assert.match(
  importJobPage,
  /href=\{`\/owner\/imports\/\$\{job\.id\}\/mapping`\} className="inline-flex min-h-11 items-center[^"]*">Map File Headers<\/a>/,
  "Map File Headers keeps its destination and exposes a 44px interactive anchor.",
);
assert.match(
  packPage,
  /href="\/packing"[\s\S]{0,250}className="inline-flex min-h-11 items-center[^"]*"[\s\S]{0,80}>[\s\S]{0,40}Scan next/,
  "Scan next keeps scanner navigation and exposes a 44px interactive anchor.",
);
assert.match(
  packPage,
  /<summary className="min-h-11 cursor-pointer py-2[^"]*">Mark problem<\/summary>/,
  "Mark problem remains a native summary with a 44px interactive target.",
);
assert.doesNotMatch(
  packPage,
  /<summary[^>]*>\s*<(?:button|a)\b[^>]*>\s*Mark problem/i,
  "Mark problem does not contain a nested interactive control.",
);
assert.match(
  packPage,
  /resolveOrderShipmentWorkflowPrerequisites/,
  "The Packing page still uses the authoritative prerequisite resolver.",
);
assert.match(
  packPage,
  /reportProblemFromScanAction/,
  "The existing problem-reporting action remains wired.",
);

console.log("Stage 4.6C3D touch-target source checks passed.");
