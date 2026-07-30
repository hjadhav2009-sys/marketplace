export const ATLAS_DUAL_IDENTITY_SCHEMA = "Stage4_6CAtlasDualIdentityV1";
export const ATLAS_CAPTURE_ADAPTER_VERSION = "stage4.6c3b-dual-identity-v1";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const BUILD_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const TAG_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;

function bounded(value, pattern, label, { optional = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized && optional) return null;
  if (!pattern.test(normalized)) throw new Error(`Invalid ${label}.`);
  return normalized;
}

export function createAtlasDualIdentity({
  runtimeSha,
  runtimeBuildId,
  runtimeTag = null,
  runnerSha,
  runnerVersion,
  semanticRegistryVersion,
  fixtureVersion,
  syntheticSeed,
  browserVersion,
  nodeVersion,
  fixtures,
} = {}) {
  const normalized = {
    schema: ATLAS_DUAL_IDENTITY_SCHEMA,
    runtimeSha: bounded(runtimeSha, SHA_PATTERN, "runtime SHA"),
    runtimeBuildId: bounded(runtimeBuildId, BUILD_ID_PATTERN, "runtime BUILD_ID"),
    runtimeTag: bounded(runtimeTag, TAG_PATTERN, "runtime tag", { optional: true }),
    runnerSha: bounded(runnerSha, SHA_PATTERN, "runner SHA"),
    runnerVersion: bounded(runnerVersion, VERSION_PATTERN, "runner version"),
    semanticRegistryVersion: bounded(semanticRegistryVersion, VERSION_PATTERN, "semantic registry version"),
    fixtureVersion: bounded(fixtureVersion, VERSION_PATTERN, "fixture version"),
    captureAdapterVersion: ATLAS_CAPTURE_ADAPTER_VERSION,
    syntheticSeed: bounded(syntheticSeed, VERSION_PATTERN, "synthetic seed"),
    browserVersion: bounded(browserVersion, VERSION_PATTERN, "browser version"),
    nodeVersion: bounded(nodeVersion, VERSION_PATTERN, "Node version"),
    fixtures,
  };
  return {
    ...normalized,
    // Compatibility fields remain runtime-only. They must never contain runnerSha.
    sourceSha: normalized.runtimeSha,
    buildId: normalized.runtimeBuildId,
    syntheticFixtureVersion: normalized.fixtureVersion,
  };
}

export function runtimeIdentityFromPlan(identity = {}) {
  return {
    runtimeSha: identity.runtimeSha ?? identity.sourceSha ?? null,
    runtimeBuildId: identity.runtimeBuildId ?? identity.buildId ?? null,
    runtimeTag: identity.runtimeTag ?? null,
  };
}

export function assertPlanRuntimeIdentity(planIdentity, expected) {
  const actual = runtimeIdentityFromPlan(planIdentity);
  if (actual.runtimeSha !== expected.runtimeSha) throw new Error("Atlas plan runtime SHA does not match the explicit runtime SHA.");
  if (actual.runtimeBuildId !== expected.runtimeBuildId) throw new Error("Atlas plan BUILD_ID does not match the explicit runtime BUILD_ID.");
  return actual;
}

function evidenceValue(result, key, compatibilityKey) {
  return result?.[key]
    ?? result?.source?.[key]
    ?? result?.[compatibilityKey]
    ?? result?.source?.[compatibilityKey]
    ?? null;
}

export function verifyEvidenceIdentity(result, expected, {
  allowLegacyRunnerIdentity = false,
} = {}) {
  const actual = {
    runtimeSha: evidenceValue(result, "runtimeSha", "commitSha"),
    runtimeBuildId: evidenceValue(result, "runtimeBuildId", "buildId"),
    runnerSha: evidenceValue(result, "runnerSha", "runnerSha"),
  };
  const failures = [];
  if (actual.runtimeSha !== expected.runtimeSha) failures.push("RUNTIME_SHA_MISMATCH");
  if (actual.runtimeBuildId !== expected.runtimeBuildId) failures.push("RUNTIME_BUILD_ID_MISMATCH");
  if (!actual.runnerSha) {
    if (!allowLegacyRunnerIdentity) failures.push("RUNNER_SHA_MISSING");
  } else if (actual.runnerSha !== expected.runnerSha) {
    failures.push("RUNNER_SHA_MISMATCH");
  }
  return {
    passed: failures.length === 0,
    legacyRunnerIdentity: !actual.runnerSha,
    actual,
    failures,
  };
}

export function assertAdapterIdentity({
  currentRunnerSha,
  currentBuildId,
  expected,
} = {}) {
  if (currentRunnerSha !== expected?.runnerSha) {
    throw new Error("Shard adapter runner SHA does not match the committed QA runner.");
  }
  if (currentBuildId !== expected?.runtimeBuildId) {
    throw new Error("Shard adapter BUILD_ID does not match the frozen runtime.");
  }
  if (!expected?.runtimeSha || expected.runtimeSha === expected.runnerSha) return expected;
  return expected;
}

export function shardIdentityRecord(identity, shard) {
  return {
    runtimeSha: identity.runtimeSha,
    runtimeBuildId: identity.runtimeBuildId,
    runtimeTag: identity.runtimeTag ?? null,
    runnerSha: identity.runnerSha,
    semanticRegistryVersion: identity.semanticRegistryVersion,
    fixtureVersion: identity.fixtureVersion,
    runnerVersion: identity.runnerVersion,
    captureAdapterVersion: identity.captureAdapterVersion,
    shardId: shard.id,
    viewport: shard.viewport?.id ?? null,
  };
}

export const atlasIdentityInternals = {
  SHA_PATTERN,
  BUILD_ID_PATTERN,
  VERSION_PATTERN,
  TAG_PATTERN,
};
