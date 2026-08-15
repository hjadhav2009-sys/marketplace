import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (await Promise.all([
  "../app/work/GroupedWorkCard.tsx",
  "../components/work-card/WorkCard.tsx",
  "../components/work-card/WorkCardSections.tsx",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");

assert.doesNotMatch(source, /onClickCapture[\s\S]*setProcessing/, "A click-capture render must not remove a form before its server action submits.");
assert.doesNotMatch(source, /if\s*\(processing\)[\s\S]*Processing group/, "Grouped actions must not replace the form before submission.");
assert.match(source, /<SubmitButton pendingText="Packing\.\.\."/, "Per-form pending feedback must remain available through useFormStatus.");
assert.match(source, /data-responsive-work-card/, "Work cards expose a stable responsive test boundary.");
assert.match(source, /grid-cols-2/, "Mobile actions remain in a bounded two-column grid.");
assert.match(source, />Details</, "Details remains an action inside the work card.");

console.log("Stage 4 grouped-work form submission regression passed.");
