import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const studio = read("app/__qa/ui-audit/page.tsx");
const evidence = read("app/api/qa/ui-audit/evidence/route.ts");
const notes = read("app/api/qa/ui-audit/notes/route.ts");
const designIndex = read("app/__qa/design-lab/page.tsx");
const designArea = read("app/__qa/design-lab/[area]/page.tsx");
const runner = read("scripts/qa/stage4-2b-browser-audit.mjs");
const scenarios = read("scripts/qa/stage4-2b-scenarios.mjs");

for (const source of [studio, evidence, notes, designIndex, designArea]) {
  assert.match(source, /STAGING_UI_AUDIT/);
  assert.match(source, /STAGE3_SYNTHETIC_STAGING/);
}
assert.match(evidence, /\.codex-tmp.+stage4-2b.+screenshots/s);
assert.match(evidence, /path\.relative/);
assert.match(notes, /2_000_000/);
assert.doesNotMatch(notes, /prisma|DATABASE_URL/);
assert.match(runner, /playwright-core/);
assert.match(runner, /--resume/);
assert.match(runner, /context\.tracing/);
assert.match(runner, /requestfailed/);
assert.match(runner, /pageerror/);
assert.match(runner, /Math\.min\(4/);
assert.match(scenarios, /AUTH_DEFAULT/);
assert.match(scenarios, /DATA_PURGED/);
assert.match(scenarios, /PERMISSION_DENIED/);

console.log("Stage 4.2B audit tooling boundary tests passed.");

