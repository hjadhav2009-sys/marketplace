import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/work/GroupedWorkCard.tsx", import.meta.url), "utf8");

assert.doesNotMatch(source, /onClickCapture[\s\S]*setProcessing/, "A click-capture render must not remove a form before its server action submits.");
assert.doesNotMatch(source, /if\s*\(processing\)[\s\S]*Processing group/, "Grouped actions must not replace the form before submission.");
assert.match(source, /<SubmitButton pendingText="Processing\.\.\."/, "Per-form pending feedback must remain available through useFormStatus.");

console.log("Stage 4 grouped-work form submission regression passed.");
