import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scenarios = await import("../scripts/qa/stage4-5-scenarios.mjs");
assert.equal(scenarios.VIEWPORTS.length, 6);
assert.equal(new Set(scenarios.VIEWPORTS.map((row) => row.id)).size, 6);
assert.ok(scenarios.REQUIRED_SCENARIOS.length > 50);

const capture = await readFile(new URL("../scripts/qa/stage4-5-capture.mjs", import.meta.url), "utf8");
assert.match(capture, /fullPage:\s*true/);
assert.doesNotMatch(capture, /fullPage:\s*false/);
assert.match(capture, /evidenceType:\s*"FULL_PAGE"/);
assert.match(capture, /commitSha:\s*SOURCE_SHA/);
assert.match(capture, /buildId:\s*BUILD_ID/);
assert.match(capture, /scenarioVersion:\s*SCENARIO_VERSION/);

console.log("Stage 4.5 atlas policy tests passed.");
