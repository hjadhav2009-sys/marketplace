export const BROWSER_GATE_SCHEMA = "Stage4_6BBrowserEvidenceV1";

export const REQUIRED_BROWSER_GATE_VIEWPORTS = [
  "360x800",
  "390x844",
  "430x932",
  "768x1024",
  "1024x768",
  "1440x900",
];

export const REQUIRED_BROWSER_GATE_CATEGORIES = [
  "GLOBAL_SHELL",
  "WORKER_STATES",
  "ROUTE_INTERACTIONS",
  "SCANNER",
  "DATA_MANAGEMENT",
  "QUALITY",
];

function exactStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== "string")) return false;
  const normalized = [...new Set(actual)].sort();
  return normalized.length === expected.length
    && normalized.every((value, index) => value === [...expected].sort()[index]);
}

export function validateBrowserGateEvidence(receipt, expected) {
  const failures = [];
  if (!receipt || typeof receipt !== "object") failures.push("Evidence receipt is not an object.");
  if (receipt?.schema !== BROWSER_GATE_SCHEMA) failures.push("Evidence schema is invalid.");
  if (receipt?.syntheticOnly !== true) failures.push("Evidence is not marked synthetic-only.");
  if (receipt?.completed !== true) failures.push("Browser matrix is not marked complete.");
  if (receipt?.sourceSha !== expected.sourceSha) failures.push("Evidence source SHA does not match the running build.");
  if (receipt?.buildId !== expected.buildId) failures.push("Evidence BUILD_ID does not match the running build.");
  if (!exactStringSet(receipt?.viewports, REQUIRED_BROWSER_GATE_VIEWPORTS)) failures.push("Evidence does not cover all six exact viewports.");
  if (!exactStringSet(receipt?.categories, REQUIRED_BROWSER_GATE_CATEGORIES)) failures.push("Evidence does not cover every required category.");
  if (!Array.isArray(receipt?.checks) || receipt.checks.length < 24) failures.push("Evidence has fewer than 24 explicit browser checks.");
  if (Array.isArray(receipt?.checks)) {
    const invalidChecks = receipt.checks.filter((check) => !check
      || typeof check.id !== "string"
      || check.pass !== true
      || typeof check.viewport !== "string");
    if (invalidChecks.length) failures.push(`${invalidChecks.length} browser checks are missing an ID, viewport, or passing result.`);
  }
  if (!Number.isInteger(receipt?.screenshotCount) || receipt.screenshotCount < 6) failures.push("At least six matching-build screenshots are required.");
  if (!Array.isArray(receipt?.screenshots) || receipt.screenshots.length !== receipt?.screenshotCount) failures.push("Screenshot manifest count is inconsistent.");
  if (Array.isArray(receipt?.screenshots)) {
    const invalidScreenshots = receipt.screenshots.filter((item) => !item
      || typeof item.path !== "string"
      || typeof item.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(item.sha256)
      || !Number.isInteger(item.bytes)
      || item.bytes <= 0);
    if (invalidScreenshots.length) failures.push(`${invalidScreenshots.length} screenshots have invalid evidence metadata.`);
  }
  const unexpectedErrors = [
    ...(receipt?.consoleErrors ?? []),
    ...(receipt?.pageErrors ?? []),
    ...(receipt?.failedRequests ?? []),
    ...(receipt?.unexpectedResponses ?? []),
  ];
  if (unexpectedErrors.length) failures.push(`${unexpectedErrors.length} unexpected browser/runtime errors remain.`);
  if (receipt?.horizontalOverflowCount !== 0) failures.push("Horizontal overflow remains.");
  if (receipt?.smallControlCount !== 0) failures.push("Interactive controls smaller than 44px remain.");
  if (receipt?.destructiveActionsCompleted !== 0) failures.push("A destructive Data Management action was completed.");
  return { valid: failures.length === 0, failures };
}

export function parseBoundedMilliseconds(value, fallback, { minimum, maximum, name }) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum} milliseconds.`);
  }
  return parsed;
}
