import assert from "node:assert/strict";
import {
  BROWSER_GATE_SCHEMA,
  REQUIRED_BROWSER_GATE_CATEGORIES,
  REQUIRED_BROWSER_GATE_VIEWPORTS,
  parseBoundedMilliseconds,
  validateBrowserGateEvidence,
} from "../scripts/qa/stage4-6b-browser-gate-core.mjs";

let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

const expected = { sourceSha: "a".repeat(40), buildId: "build-id" };
const screenshots = REQUIRED_BROWSER_GATE_VIEWPORTS.map((viewport, index) => ({
  path: `.codex-tmp/stage4-6a-browser-evidence/${viewport}-${index}.png`,
  sha256: "b".repeat(64),
  bytes: 1024 + index,
}));
const checks = Array.from({ length: 24 }, (_, index) => ({
  id: `CHECK_${index + 1}`,
  viewport: REQUIRED_BROWSER_GATE_VIEWPORTS[index % REQUIRED_BROWSER_GATE_VIEWPORTS.length],
  pass: true,
}));
const valid = {
  schema: BROWSER_GATE_SCHEMA,
  syntheticOnly: true,
  completed: true,
  sourceSha: expected.sourceSha,
  buildId: expected.buildId,
  viewports: [...REQUIRED_BROWSER_GATE_VIEWPORTS],
  categories: [...REQUIRED_BROWSER_GATE_CATEGORIES],
  checks,
  screenshots,
  screenshotCount: screenshots.length,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  unexpectedResponses: [],
  horizontalOverflowCount: 0,
  smallControlCount: 0,
  destructiveActionsCompleted: 0,
};

check(validateBrowserGateEvidence(valid, expected).valid, "complete matching-build synthetic evidence should pass");
check(!validateBrowserGateEvidence({ ...valid, sourceSha: "c".repeat(40) }, expected).valid, "wrong source SHA should fail");
check(!validateBrowserGateEvidence({ ...valid, buildId: "old-build" }, expected).valid, "wrong build ID should fail");
check(!validateBrowserGateEvidence({ ...valid, viewports: valid.viewports.slice(1) }, expected).valid, "missing viewport should fail");
check(!validateBrowserGateEvidence({ ...valid, categories: valid.categories.slice(1) }, expected).valid, "missing category should fail");
check(!validateBrowserGateEvidence({ ...valid, checks: checks.slice(0, 23) }, expected).valid, "insufficient checks should fail");
check(!validateBrowserGateEvidence({ ...valid, consoleErrors: ["hydration mismatch"] }, expected).valid, "browser errors should fail");
check(!validateBrowserGateEvidence({ ...valid, horizontalOverflowCount: 1 }, expected).valid, "horizontal overflow should fail");
check(!validateBrowserGateEvidence({ ...valid, smallControlCount: 1 }, expected).valid, "small controls should fail");
check(!validateBrowserGateEvidence({ ...valid, destructiveActionsCompleted: 1 }, expected).valid, "destructive actions should fail");
check(parseBoundedMilliseconds(undefined, 10, { minimum: 1, maximum: 100, name: "test" }) === 10, "timeout fallback should be used");
check(parseBoundedMilliseconds("50", 10, { minimum: 1, maximum: 100, name: "test" }) === 50, "bounded timeout should parse");
assert.throws(() => parseBoundedMilliseconds("101", 10, { minimum: 1, maximum: 100, name: "test" }), /between 1 and 100/);
assertions += 1;

console.log(`Staging browser gate tests passed (${assertions} assertions).`);
