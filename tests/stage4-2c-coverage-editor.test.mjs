import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const seed = read("scripts/staging/seed.ts");
const runner = read("scripts/qa/stage4-2b-browser-audit.mjs");
const progress = read("components/ImportJobProgress.tsx");
const review = read("app/owner/consignments/[batchId]/review/page.tsx");
const studio = read("app/%5F%5Fqa/ui-audit/AuditStudio.tsx");
const live = read("app/%5F%5Fqa/design-lab/[area]/WorkCardLiveEditor.tsx");
const approval = read("app/api/qa/ui-audit/approved-designs/route.ts");
const login = read("app/login/page.tsx");
const shell = read("components/AppShell.tsx");
const mobileAccountMenu = read("components/MobileAccountMenu.tsx");
const workCard = read("app/work/GroupedWorkCard.tsx");

assert.match(seed, /stage4-missing-listing-issue/);
assert.match(seed, /sourceType:\s*"ORDER"/);
assert.match(seed, /stage4-synthetic-marking-asset/);
assert.match(seed, /progressJson:\s*suffix === "mapping"/);
assert.match(runner, /catalog\/missing\/stage4-missing-listing-issue/);
assert.match(runner, /return 2;/);

assert.match(progress, /initialJob\.updatedAt\.getTime\(\)/);
assert.match(progress, /setClockMs\(Date\.now\(\)\)/);
assert.doesNotMatch(progress, /importJobElapsedSeconds\(job\);/);

assert.match(review, /min-w-0/);
assert.match(review, /w-full min-w-0 rounded-md border/);
assert.match(review, /break-words text-lg font-black/);

for (const capability of ["Duplicate layer", "Group", "Ungroup", "Lock / unlock", "Align left", "Align top", "Export JSON", "Export PNG", "Approve Design", "Open linked Live Component"]) {
  assert.ok(studio.includes(capability), `Audit Studio is missing ${capability}`);
}
for (const control of ["Layout direction", "Grid columns", "Gap", "Padding", "Margin", "Image size", "Image aspect", "Typography", "Button layout", "Radius", "Card shadow", "Approve Design"]) {
  assert.ok(live.includes(control), `Live Component editor is missing ${control}`);
}
assert.match(approval, /STAGING_UI_AUDIT/);
assert.match(approval, /\.codex-tmp", "stage4-2c", "approved-designs/);
assert.match(approval, /ApprovedDesignSpecificationV1/);
assert.match(approval, /flag:\s*"wx"/);

assert.match(login, /max-w-md rounded-lg/);
assert.match(login, /\[&_button\]:w-full/);
assert.match(login, /\[&_button\]:rounded-full/);
assert.match(mobileAccountMenu, /Open account menu/);
assert.match(mobileAccountMenu, /Switch account/);
assert.match(shell, /MobileAccountMenu/);
assert.doesNotMatch(shell, /<MobileBottomNav/);
assert.match(workCard, /md:grid-cols-\[150px_minmax\(0,1fr\)_220px\]/);
assert.match(workCard, /xl:grid-cols-\[minmax\(200px,240px\)_minmax\(0,1fr\)_300px\]/);
assert.match(workCard, /flex flex-nowrap gap-1/);
assert.match(workCard, /md:max-w-\[220px\]/);
assert.match(workCard, /xl:max-w-\[300px\]/);

console.log("Stage 4.2C coverage and local visual-editor policy test passed.");
