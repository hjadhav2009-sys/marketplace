import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { VIEWPORTS } from "./stage4-5-scenarios.mjs";
import { readSafeCheckpoint, writeSafeCheckpoint } from "./atlas-safe-checkpoint.mjs";
import {
  shardIdentityRecord,
  verifyEvidenceIdentity,
} from "./stage4-6c-atlas-identity.mjs";
import { semanticPreflight } from "./stage4-6c-semantic-registry.mjs";

export const ATLAS_ENGINE_VERSION = "stage4.6c-sharded-v1";
export const SHARD_TIMEOUT_MS = 30 * 60_000;
export const EXPECTED_SCENARIOS = 141;
export const EXPECTED_ENTRIES = 846;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function balancedBatches(items, batchCount = 7) {
  if (items.length < batchCount) throw new Error("Not enough scenarios for deterministic batches.");
  const base = Math.floor(items.length / batchCount);
  const remainder = items.length % batchCount;
  const output = [];
  let offset = 0;
  for (let index = 0; index < batchCount; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    output.push(items.slice(offset, offset + size));
    offset += size;
  }
  return output;
}

export async function createAtlasPlan(root, identity) {
  const preflight = await semanticPreflight(root, identity.fixtures);
  if (!preflight.passed) throw new Error(`Semantic preflight failed: ${preflight.failures.join(" ")}`);
  const scenarios = [...preflight.registry.values()].sort((left, right) => left.id.localeCompare(right.id));
  if (scenarios.length !== EXPECTED_SCENARIOS) throw new Error(`Expected ${EXPECTED_SCENARIOS} scenarios.`);
  const batches = balancedBatches(scenarios, 7);
  if (batches.some((batch) => batch.length < 15 || batch.length > 25)) {
    throw new Error("Deterministic scenario batches must contain 15–25 scenarios.");
  }
  const shards = [];
  for (const viewport of VIEWPORTS) {
    batches.forEach((batch, batchIndex) => {
      const id = `${viewport.id}-batch-${String(batchIndex + 1).padStart(2, "0")}`;
      const entries = batch.map((scenario) => ({
        id: `${scenario.id}:${viewport.id}`,
        scenarioId: scenario.id,
        viewport,
        contract: scenario,
      }));
      shards.push({
        schema: "Stage4_6CAtlasShardV1",
        engineVersion: ATLAS_ENGINE_VERSION,
        identity,
        id,
        viewport,
        batch: batchIndex + 1,
        timeoutMs: SHARD_TIMEOUT_MS,
        entryCount: entries.length,
        entries,
      });
    });
  }
  const entryIds = shards.flatMap((shard) => shard.entries.map((entry) => entry.id));
  if (shards.length !== 42 || entryIds.length !== EXPECTED_ENTRIES || new Set(entryIds).size !== EXPECTED_ENTRIES) {
    throw new Error("Atlas plan did not produce 42 deterministic shards and 846 unique entries.");
  }
  return {
    schema: "Stage4_6CAtlasPlanV1",
    engineVersion: ATLAS_ENGINE_VERSION,
    identity,
    semanticContractCount: preflight.semanticContracts,
    fixtureMappingCount: preflight.fixtureMappings,
    scenarioCount: scenarios.length,
    viewportCount: VIEWPORTS.length,
    entryCount: entryIds.length,
    shardCount: shards.length,
    shards,
  };
}

export async function writeAtlasPlan(plan, planRoot) {
  await mkdir(planRoot, { recursive: true });
  const shardRoot = path.join(planRoot, "shards");
  await mkdir(shardRoot, { recursive: true });
  for (const shard of plan.shards) {
    await writeSafeCheckpoint(path.join(shardRoot, `${shard.id}.manifest.json`), shard);
  }
  await writeSafeCheckpoint(path.join(planRoot, "atlas-plan.json"), plan);
  return {
    planPath: path.join(planRoot, "atlas-plan.json"),
    shardRoot,
    shardCount: plan.shards.length,
  };
}

export async function adoptLegacyAtlasEvidence({
  plan,
  root,
  legacyProgressPath,
  legacyManifestPath,
  shardProgressRoot,
}) {
  const legacyProgress = await readJsonFile(legacyProgressPath, { completed: {} });
  const legacyManifest = await readJsonFile(legacyManifestPath, { entries: [] });
  const manifestById = new Map((legacyManifest.entries ?? []).map((entry) => [entry.id, entry]));
  const summary = {
    capturedAndHashValid: 0,
    adoptedVerified: 0,
    retainedForSemanticRecapture: 0,
    uncaptured: 0,
  };

  await mkdir(shardProgressRoot, { recursive: true });
  for (const shard of plan.shards) {
    const progressPath = path.join(shardProgressRoot, `${shard.id}.progress.json`);
    const progress = await readSafeCheckpoint(progressPath, {
      schema: "Stage4_6CAtlasShardProgressV1",
      shardId: shard.id,
      entries: {},
      journal: [],
    });
    for (const entry of shard.entries) {
      const current = progress.entries?.[entry.id];
      const prior = legacyProgress.completed?.[entry.id];
      if (!prior?.fullPageMasterPath || prior.fullPageCaptureStatus !== "VERIFIED") {
        summary.uncaptured += 1;
        continue;
      }
      const screenshotPath = path.isAbsolute(prior.fullPageMasterPath)
        ? prior.fullPageMasterPath
        : path.join(root, ...prior.fullPageMasterPath.split("/"));
      const evidence = {
        screenshotPath,
        screenshotSha256: prior.fullPageSha256,
        screenshotBytes: prior.fullPageFileBytes,
      };
      if (!await verifyEvidenceFile(evidence)) {
        summary.uncaptured += 1;
        continue;
      }
      summary.capturedAndHashValid += 1;
      const frozen = manifestById.get(entry.id);
      const semanticallyVerified = frozen?.status === "VERIFIED"
        && ["PASSED", "VERIFIED"].includes(frozen?.semanticAssertionResult?.status);
      if (semanticallyVerified) summary.adoptedVerified += 1;
      else summary.retainedForSemanticRecapture += 1;
      if (current && !current.adoptedFromFrozenEvidence) continue;
      if (current?.status === "VERIFIED" && await verifyEvidenceFile(current)) continue;
      progress.entries[entry.id] = {
        ...evidence,
        status: semanticallyVerified ? "VERIFIED" : "FAILED",
        adoptedFromFrozenEvidence: true,
        legacyEvidenceStatus: semanticallyVerified
          ? "FROZEN_SEMANTICALLY_VERIFIED"
          : "CAPTURED_NEEDS_EXPLICIT_SEMANTIC_RECAPTURE",
        semanticAssertion: frozen?.semanticAssertionResult ?? null,
        source: prior,
      };
      progress.journal.push({
        entryId: entry.id,
        event: semanticallyVerified ? "LEGACY_EVIDENCE_ADOPTED_VERIFIED" : "LEGACY_EVIDENCE_RETAINED_FOR_RECAPTURE",
        at: new Date().toISOString(),
      });
    }
    await writeSafeCheckpoint(progressPath, progress);
  }
  return summary;
}

export async function runAtlasShard({
  shard,
  progressPath,
  captureEntry,
  lifecycle,
  identity,
  force = false,
  timeoutMs = SHARD_TIMEOUT_MS,
  now = () => Date.now(),
}) {
  if (timeoutMs > SHARD_TIMEOUT_MS) throw new Error("No atlas shard may exceed 30 minutes.");
  if (!identity?.runtimeSha || !identity?.runtimeBuildId || !identity?.runnerSha) {
    throw new Error("Atlas shard execution requires explicit runtime and runner identities.");
  }
  const identityRecord = shardIdentityRecord(identity, shard);
  const progress = await readSafeCheckpoint(progressPath, {
    schema: "Stage4_6CAtlasShardProgressV1",
    shardId: shard.id,
    identity: identityRecord,
    entries: {},
    journal: [],
  });
  if (progress.shardId !== shard.id) throw new Error("Atlas progress belongs to a different shard.");
  if (progress.identity) {
    const progressIdentity = verifyEvidenceIdentity(progress.identity, identity);
    if (!progressIdentity.passed) {
      throw new Error(`Atlas progress identity mismatch: ${progressIdentity.failures.join(", ")}.`);
    }
  } else if (Object.keys(progress.entries ?? {}).length) {
    throw new Error("Existing atlas progress is missing runner identity; verify it explicitly instead of relabelling it.");
  } else {
    progress.identity = identityRecord;
  }
  const journalEvent = (entryId, event) => ({
    ...identityRecord,
    entryId,
    event,
    at: new Date().toISOString(),
  });
  const startedAt = now();
  let server;
  try {
    server = await lifecycle.start(shard);
    for (const entry of shard.entries) {
      const remainingMs = timeoutMs - (now() - startedAt);
      if (remainingMs <= 0) throw new Error(`Shard ${shard.id} exceeded its bounded timeout.`);
      const prior = progress.entries[entry.id];
      const priorIdentity = prior ? verifyEvidenceIdentity(prior, identity) : null;
      if (!force && prior?.status === "VERIFIED" && priorIdentity?.passed && await verifyEvidenceFile(prior)) {
        progress.journal.push(journalEvent(entry.id, "SKIPPED_HASH_VERIFIED"));
        continue;
      }
      progress.journal.push(journalEvent(entry.id, "CAPTURE_STARTED"));
      await writeSafeCheckpoint(progressPath, progress);
      try {
        const result = await captureEntry(entry, { server, prior, remainingMs });
        const resultIdentity = verifyEvidenceIdentity(result, identity);
        if (!resultIdentity.passed) {
          throw new Error(`Captured evidence identity mismatch: ${resultIdentity.failures.join(", ")}.`);
        }
        progress.entries[entry.id] = result;
        progress.journal.push(journalEvent(entry.id, result.status === "VERIFIED" ? "CAPTURE_VERIFIED" : "CAPTURE_FAILED"));
      } catch (error) {
        progress.entries[entry.id] = {
          ...identityRecord,
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date().toISOString(),
        };
        progress.journal.push(journalEvent(entry.id, "CAPTURE_FAILED"));
      }
      await writeSafeCheckpoint(progressPath, progress);
    }
  } finally {
    await lifecycle.stop(server);
  }
  const summary = shardSummary(shard, progress);
  await writeSafeCheckpoint(`${progressPath}.result.json`, {
    schema: "Stage4_6CAtlasShardResultV2",
    identity: identityRecord,
    summary,
    progress,
  });
  return { summary, progress };
}

export async function verifyAtlasShard(shard, progressPath, {
  identity = null,
  allowLegacyRunnerIdentity = false,
} = {}) {
  const progress = await readSafeCheckpoint(progressPath, null);
  if (!progress) {
    return {
      passed: false,
      identity: identity ? shardIdentityRecord(identity, shard) : null,
      missing: shard.entries.map((entry) => entry.id),
      failed: [],
      verified: [],
      identityFailures: [],
      legacyRunnerIdentityEntries: [],
    };
  }
  const missing = [];
  const failed = [];
  const verified = [];
  const identityFailures = [];
  const legacyRunnerIdentityEntries = [];
  if (identity && progress.identity) {
    const progressIdentity = verifyEvidenceIdentity(progress.identity, identity);
    if (!progressIdentity.passed) identityFailures.push(`PROGRESS:${progressIdentity.failures.join("+")}`);
  }
  for (const entry of shard.entries) {
    const result = progress.entries?.[entry.id];
    if (!result) missing.push(entry.id);
    else {
      const evidenceIdentity = identity
        ? verifyEvidenceIdentity(result, identity, { allowLegacyRunnerIdentity })
        : { passed: true, legacyRunnerIdentity: false, failures: [] };
      if (evidenceIdentity.legacyRunnerIdentity) legacyRunnerIdentityEntries.push(entry.id);
      if (!evidenceIdentity.passed) {
        failed.push(entry.id);
        identityFailures.push(`${entry.id}:${evidenceIdentity.failures.join("+")}`);
      } else if (result.status === "VERIFIED" && await verifyEvidenceFile(result)) {
        verified.push(entry.id);
      } else {
        failed.push(entry.id);
      }
    }
  }
  return {
    passed: missing.length === 0 && failed.length === 0 && identityFailures.length === 0,
    identity: identity ? shardIdentityRecord(identity, shard) : null,
    missing,
    failed,
    verified,
    identityFailures,
    legacyRunnerIdentityEntries,
  };
}

export async function aggregateAtlas(plan, shardProgressRoot, {
  identity = null,
  allowLegacyRunnerIdentityForShards = new Set(),
} = {}) {
  const entries = [];
  for (const shard of plan.shards) {
    const progressPath = path.join(shardProgressRoot, `${shard.id}.progress.json`);
    const verification = await verifyAtlasShard(shard, progressPath, {
      identity,
      allowLegacyRunnerIdentity: allowLegacyRunnerIdentityForShards.has(shard.id),
    });
    const progress = await readSafeCheckpoint(progressPath, { entries: {} });
    for (const planned of shard.entries) {
      const result = progress.entries?.[planned.id] ?? null;
      entries.push({
        ...planned,
        shardId: shard.id,
        result,
        aggregateStatus: verification.verified.includes(planned.id)
          ? "VERIFIED"
          : verification.failed.includes(planned.id) ? "FAILED" : "MISSING",
      });
    }
  }
  if (entries.length !== EXPECTED_ENTRIES || new Set(entries.map((entry) => entry.id)).size !== EXPECTED_ENTRIES) {
    throw new Error("Aggregate does not contain exactly 846 unique planned entries.");
  }
  const verified = entries.filter((entry) => entry.aggregateStatus === "VERIFIED").length;
  const failed = entries.filter((entry) => entry.aggregateStatus === "FAILED").length;
  const missing = entries.filter((entry) => entry.aggregateStatus === "MISSING").length;
  return {
    schema: "Stage4_6CAtlasAggregateV1",
    engineVersion: ATLAS_ENGINE_VERSION,
    identity: plan.identity,
    required: entries.length,
    verified,
    failed,
    missing,
    passed: verified === EXPECTED_ENTRIES && failed === 0 && missing === 0,
    entries,
  };
}

export function shardSummary(shard, progress) {
  const values = Object.values(progress.entries ?? {});
  return {
    shardId: shard.id,
    required: shard.entries.length,
    verified: values.filter((entry) => entry.status === "VERIFIED").length,
    failed: values.filter((entry) => entry.status === "FAILED").length,
    recorded: values.length,
  };
}

export async function verifyEvidenceFile(result) {
  if (!result?.screenshotPath || !result?.screenshotSha256 || !existsSync(result.screenshotPath)) return false;
  try {
    const info = await stat(result.screenshotPath);
    if (result.screenshotBytes != null && info.size !== result.screenshotBytes) return false;
    return sha256(await readFile(result.screenshotPath)) === result.screenshotSha256;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export const atlasEngineInternals = { balancedBatches, sha256 };
