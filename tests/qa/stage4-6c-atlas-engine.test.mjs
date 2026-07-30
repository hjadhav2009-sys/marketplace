import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  readSafeCheckpoint,
  writeSafeCheckpoint,
} from "../../scripts/qa/atlas-safe-checkpoint.mjs";
import {
  adoptLegacyAtlasEvidence,
  aggregateAtlas,
  createAtlasPlan,
  runAtlasShard,
  verifyEvidenceFile,
} from "../../scripts/qa/stage4-6c-atlas-engine.mjs";
import {
  evaluateSemanticContract,
  semanticPreflight,
} from "../../scripts/qa/stage4-6c-semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "stage4-6c-atlas-"));
const artifact = path.join(temporary, "evidence.png");
const artifactBytes = Buffer.from("synthetic atlas evidence");
await writeFile(artifact, artifactBytes);
const artifactHash = createHash("sha256").update(artifactBytes).digest("hex");

try {
  const preflight = await semanticPreflight(ROOT);
  assert.equal(preflight.passed, true);
  assert.equal(preflight.semanticContracts, 141);
  assert.equal(preflight.fixtureMappings, 141);
  for (const item of preflight.registry.values()) {
    assert.ok(item.requiredVisible.length > 0, `${item.id} needs a state-specific assertion`);
    assert.ok(Array.isArray(item.forbiddenVisible));
    assert.ok(Array.isArray(item.requiredActions));
    assert.ok(Array.isArray(item.forbiddenActions));
    assert.ok(item.fixtureIdentity);
    assert.ok(item.fixtureProbes.length > 0);
  }

  const missingFixtureDatabase = path.join(temporary, "missing-fixture.db");
  await copyFile(
    path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "database", "staging.db"),
    missingFixtureDatabase,
  );
  const fixtureDatabase = new DatabaseSync(missingFixtureDatabase);
  fixtureDatabase.prepare('DELETE FROM "ImportJob" WHERE "id" = ?').run("stage4-import-running");
  fixtureDatabase.close();
  const missingFixturePreflight = await semanticPreflight(ROOT, { databasePath: missingFixtureDatabase });
  assert.equal(missingFixturePreflight.passed, false);
  assert.match(missingFixturePreflight.failures.join(" "), /IMPORT_PROCESSING: missing synthetic record ImportJob\.id=stage4-import-running/);

  const missingContract = evaluateSemanticContract(undefined, {});
  assert.equal(missingContract.passed, false);
  assert.match(missingContract.failures.join(" "), /MISSING_EXPLICIT_SEMANTIC_CONTRACT/);

  const markCompleted = preflight.registry.get("MARK_COMPLETED");
  const wrongState = evaluateSemanticContract(markCompleted, {
    bodyText: "Marking READY. Marking Completed",
    actions: [{ label: "Marking Completed", disabled: false }],
    role: "MARKER",
    selectedAccount: "STAGE-FK-01",
    url: markCompleted.expectedUrl,
  });
  assert.equal(wrongState.passed, false);
  assert.match(wrongState.failures.join(" "), /REQUIRED_VISIBLE_MISSING|FORBIDDEN_VISIBLE_PRESENT|FORBIDDEN_ACTION_ENABLED/);

  const identity = {
    sourceSha: "synthetic-sha",
    buildId: "synthetic-build",
    syntheticSeed: "synthetic-seed",
    browserVersion: "synthetic-browser",
    nodeVersion: process.version,
  };
  const plan = await createAtlasPlan(ROOT, identity);
  assert.equal(plan.shardCount, 42);
  assert.equal(plan.entryCount, 846);
  assert.equal(plan.shards.every((shard) => shard.entryCount >= 15 && shard.entryCount <= 25), true);
  assert.equal(new Set(plan.shards.flatMap((shard) => shard.entries.map((entry) => entry.id))).size, 846);

  const legacyProgressPath = path.join(temporary, "legacy-progress.json");
  const legacyManifestPath = path.join(temporary, "legacy-manifest.json");
  const legacyShardRoot = path.join(temporary, "legacy-shards");
  const [legacyVerifiedEntry, legacyRecaptureEntry] = plan.shards[0].entries;
  await writeFile(legacyProgressPath, JSON.stringify({
    completed: {
      [legacyVerifiedEntry.id]: {
        fullPageMasterPath: artifact,
        fullPageCaptureStatus: "VERIFIED",
        fullPageSha256: artifactHash,
        fullPageFileBytes: artifactBytes.length,
      },
      [legacyRecaptureEntry.id]: {
        fullPageMasterPath: artifact,
        fullPageCaptureStatus: "VERIFIED",
        fullPageSha256: artifactHash,
        fullPageFileBytes: artifactBytes.length,
      },
    },
  }));
  await writeFile(legacyManifestPath, JSON.stringify({
    entries: [
      {
        id: legacyVerifiedEntry.id,
        status: "VERIFIED",
        semanticAssertionResult: { status: "PASSED" },
      },
      {
        id: legacyRecaptureEntry.id,
        status: "BLOCKED",
        semanticAssertionResult: { status: "BLOCKED" },
      },
    ],
  }));
  const adopted = await adoptLegacyAtlasEvidence({
    plan,
    root: ROOT,
    legacyProgressPath,
    legacyManifestPath,
    shardProgressRoot: legacyShardRoot,
  });
  assert.equal(adopted.capturedAndHashValid, 2);
  assert.equal(adopted.adoptedVerified, 1);
  assert.equal(adopted.retainedForSemanticRecapture, 1);
  assert.equal(adopted.uncaptured, 844);
  const adoptedProgress = await readSafeCheckpoint(path.join(legacyShardRoot, `${plan.shards[0].id}.progress.json`));
  assert.equal(adoptedProgress.entries[legacyVerifiedEntry.id].status, "VERIFIED");
  assert.equal(adoptedProgress.entries[legacyRecaptureEntry.id].status, "FAILED");
  assert.equal(adoptedProgress.entries[legacyRecaptureEntry.id].legacyEvidenceStatus, "CAPTURED_NEEDS_EXPLICIT_SEMANTIC_RECAPTURE");

  const checkpoint = path.join(temporary, "progress.json");
  let renameAttempts = 0;
  const first = await writeSafeCheckpoint(checkpoint, { value: 1 }, {
    onRenameAttempt(attempt) {
      renameAttempts = attempt;
      if (attempt < 3) {
        const error = new Error("synthetic antivirus lock");
        error.code = attempt === 1 ? "EPERM" : "EBUSY";
        throw error;
      }
    },
  });
  assert.equal(renameAttempts, 3);
  assert.deepEqual(await readSafeCheckpoint(checkpoint), { value: 1 });
  assert.equal(first.sha256.length, 64);

  let replaceAttempts = 0;
  await writeSafeCheckpoint(checkpoint, { value: 2 }, {
    onReplaceAttempt(attempt) {
      replaceAttempts = attempt;
      if (attempt < 2) {
        const error = new Error("synthetic indexer lock");
        error.code = "EPERM";
        throw error;
      }
    },
  });
  assert.ok(replaceAttempts >= 2 && replaceAttempts <= 7);
  assert.deepEqual(await readSafeCheckpoint(checkpoint), { value: 2 });

  const interrupted = path.join(temporary, "interrupted.json");
  await assert.rejects(
    writeSafeCheckpoint(interrupted, { durable: true }, {
      onPhase(phase) {
        if (phase === "VERSION_COMMITTED") throw new Error("synthetic process interruption");
      },
    }),
    /synthetic process interruption/,
  );
  assert.deepEqual(await readSafeCheckpoint(interrupted), { durable: true });

  await writeFile(checkpoint, "{corrupt");
  assert.deepEqual(await readSafeCheckpoint(checkpoint), { value: 2 }, "journaled immutable version must recover corrupt materialization");

  const invalidEvidence = {
    screenshotPath: artifact,
    screenshotSha256: "0".repeat(64),
    screenshotBytes: artifactBytes.length,
  };
  assert.equal(await verifyEvidenceFile(invalidEvidence), false);

  const shard = {
    id: "test-shard",
    entries: [
      { id: "ONE:360x800" },
      { id: "TWO:360x800" },
    ],
  };
  const shardProgress = path.join(temporary, "shard.progress.json");
  await writeSafeCheckpoint(shardProgress, {
    schema: "Stage4_6CAtlasShardProgressV1",
    shardId: shard.id,
    entries: {
      "ONE:360x800": {
        status: "VERIFIED",
        screenshotPath: artifact,
        screenshotSha256: artifactHash,
        screenshotBytes: artifactBytes.length,
      },
      "TWO:360x800": {
        status: "FAILED",
        error: "synthetic prior failure",
      },
    },
    journal: [],
  });
  let captures = 0;
  let starts = 0;
  let stops = 0;
  const resumed = await runAtlasShard({
    shard,
    progressPath: shardProgress,
    lifecycle: {
      async start() { starts += 1; return {}; },
      async stop() { stops += 1; },
    },
    async captureEntry(entry) {
      captures += 1;
      return {
        status: "VERIFIED",
        screenshotPath: artifact,
        screenshotSha256: artifactHash,
        screenshotBytes: artifactBytes.length,
        entryId: entry.id,
      };
    },
  });
  assert.equal(captures, 1, "resume must skip hash-verified entry and retry only failed entry");
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  assert.equal(resumed.summary.verified, 2);

  let cleanupAfterFailure = 0;
  await runAtlasShard({
    shard: { id: "cleanup-shard", entries: [{ id: "FAIL:360x800" }] },
    progressPath: path.join(temporary, "cleanup.progress.json"),
    lifecycle: {
      async start() { return {}; },
      async stop() { cleanupAfterFailure += 1; },
    },
    async captureEntry() { throw new Error("synthetic capture failure"); },
  });
  assert.equal(cleanupAfterFailure, 1, "owned runtime must stop in finally");

  const aggregateRoot = path.join(temporary, "aggregate");
  await mkdir(aggregateRoot, { recursive: true });
  for (const plannedShard of plan.shards) {
    const entries = Object.fromEntries(plannedShard.entries.map((entry) => [entry.id, {
      status: "VERIFIED",
      screenshotPath: artifact,
      screenshotSha256: artifactHash,
      screenshotBytes: artifactBytes.length,
    }]));
    await writeSafeCheckpoint(path.join(aggregateRoot, `${plannedShard.id}.progress.json`), {
      schema: "Stage4_6CAtlasShardProgressV1",
      shardId: plannedShard.id,
      entries,
      journal: [],
    });
  }
  await writeFile(path.join(aggregateRoot, "orphan.png"), Buffer.from("orphan"));
  const aggregate = await aggregateAtlas(plan, aggregateRoot);
  assert.equal(aggregate.required, 846);
  assert.equal(aggregate.verified, 846);
  assert.equal(aggregate.failed, 0);
  assert.equal(aggregate.missing, 0);
  assert.equal(aggregate.entries.length, 846);
  assert.equal(aggregate.entries.some((entry) => entry.id === "orphan.png"), false, "orphan screenshots must not enter aggregate");
  assert.equal(new Set(aggregate.entries.map((entry) => entry.result.screenshotSha256)).size, 1, "duplicate hashes remain traceable through every entry");

  console.log("Stage 4.6C Checkpoint A atlas-engine tests passed.");
} finally {
  const resolved = path.resolve(temporary);
  if (!resolved.startsWith(path.resolve(os.tmpdir()))) throw new Error("Refusing unsafe test cleanup.");
  await rm(resolved, { recursive: true, force: true });
}
