import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
  verifyAtlasShard,
  verifyEvidenceFile,
} from "../../scripts/qa/stage4-6c-atlas-engine.mjs";
import {
  assertAdapterIdentity,
  assertPlanRuntimeIdentity,
  createAtlasDualIdentity,
  shardIdentityRecord,
  verifyEvidenceIdentity,
} from "../../scripts/qa/stage4-6c-atlas-identity.mjs";
import {
  evaluateSemanticContract,
  SEMANTIC_REGISTRY_VERSION,
  semanticPreflight,
  SYNTHETIC_FIXTURE_VERSION,
} from "../../scripts/qa/stage4-6c-semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "stage4-6c-atlas-"));
const artifact = path.join(temporary, "evidence.png");
const artifactBytes = Buffer.from("synthetic atlas evidence");
await writeFile(artifact, artifactBytes);
const artifactHash = createHash("sha256").update(artifactBytes).digest("hex");

async function removeTemporaryDirectory(directory) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM"].includes(error?.code) || attempt === 8) throw error;
      await delay(100 * attempt);
    }
  }
}

try {
  const preflight = await semanticPreflight(ROOT);
  assert.equal(preflight.passed, true);
  assert.equal(preflight.semanticContracts, 141);
  assert.equal(preflight.fixtureMappings, 141);
  assert.equal(SEMANTIC_REGISTRY_VERSION, "stage4.6c3e-semantic-v3");
  assert.equal(SYNTHETIC_FIXTURE_VERSION, "phase-7.3.6-stage4.6c3e-batch02-fixtures-v3");
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

  const markReady = preflight.registry.get("MARK_READY");
  const markPartial = preflight.registry.get("MARK_PARTIAL");
  assert.match(markReady.expectedUrl, /^\/work\/groups\/MARK\//, "Mark READY resolves to an exact projection group.");
  assert.match(markPartial.expectedUrl, /^\/work\/groups\/MARK\//, "Mark PARTIAL resolves to an exact projection group.");
  assert.notEqual(markReady.expectedUrl, markPartial.expectedUrl, "READY and PARTIAL use different exact work groups.");

  const needsMapping = preflight.registry.get("IMPORT_NEEDS_MAPPING");
  assert.equal(evaluateSemanticContract(needsMapping, {
    bodyText: "Product Inventory Refresh. Status: NEEDS MAPPING. Current stage MAPPING. Map File Headers.",
    actions: [{ label: "Map File Headers", disabled: false }],
    role: "OWNER",
    selectedAccount: "STAGE-FK-01",
    url: needsMapping.expectedUrl,
  }).passed, true, "mapping contract requires the current job-page action rather than mapping-form actions");

  const validationError = preflight.registry.get("IMPORT_VALIDATION_ERROR");
  assert.equal(validationError.fixtureProbes[0].expected.status, "FAILED");
  assert.equal(validationError.fixtureProbes[0].expected.stage, "VALIDATING");
  assert.equal(validationError.fixtureProbes[0].expected.errorRows, 2);
  assert.equal(evaluateSemanticContract(validationError, {
    bodyText: "Product Inventory Refresh. Status: FAILED. Current stage VALIDATING. Blocking errors 2. Synthetic validation failed.",
    actions: [{ label: "View Blocking Errors", disabled: false }],
    role: "OWNER",
    selectedAccount: "STAGE-FK-01",
    url: validationError.expectedUrl,
  }).passed, true);

  const expired = preflight.registry.get("AUTH_EXPIRED");
  assert.equal(evaluateSemanticContract(expired, {
    bodyText: "Sign in. Your session expired. Sign in again to continue.",
    actions: [],
    role: "OWNER",
    selectedAccount: null,
    url: "/login?expired=1&next=%2Fdashboard",
  }).passed, true, "expired authentication accepts the safe login redirect");
  assert.match(evaluateSemanticContract(expired, {
    bodyText: "Sign in. Your session expired. Sign in again to continue.",
    actions: [],
    role: "OWNER",
    selectedAccount: null,
    url: "/login?next=%2Fdashboard",
  }).failures.join(" "), /QUERY_MISMATCH:expired/);

  const forbidden = preflight.registry.get("AUTH_FORBIDDEN");
  assert.equal(evaluateSemanticContract(forbidden, {
    bodyText: "You do not have permission to open this page",
    actions: [],
    role: "PICKER",
    selectedAccount: "STAGE-FK-01",
    url: "/access-denied",
  }).passed, true, "forbidden authentication accepts the genuine access-denied destination");

  const captureSource = await readFile(path.join(ROOT, "scripts", "qa", "stage4-5-capture.mjs"), "utf8");
  const adapterSource = await readFile(path.join(ROOT, "scripts", "qa", "stage4-6c-browser-shard-adapter.mjs"), "utf8");
  const cliSource = await readFile(path.join(ROOT, "scripts", "qa", "stage4-6c-atlas-cli.mjs"), "utf8");
  assert.match(captureSource, /if \(!semanticAssertion\.passed\) throw new Error/, "Screenshots begin only after semantic verification");
  assert.match(captureSource, /selectedAccountFromContext/, "Selected-account assertions use the browser cookie rather than the contract expectation");
  assert.match(captureSource, /selectSyntheticAccount\(page, "stage3-account-amz-01"\)/, "Amazon state selects the account through the real account form");
  assert.match(captureSource, /synthetic-intentionally-wrong-password/, "Wrong-password evidence submits a real rejected password");
  assert.match(captureSource, /assertOperationalSafetyUnchanged/, "Wrong-password evidence verifies protected records did not mutate");
  assert.match(captureSource, /settleForAssertions/, "Assertions wait for route hydration and stable layout");
  assert.match(captureSource, /process\.env\.ATLAS_RUNTIME_SHA/, "Capture children accept the frozen runtime identity");
  assert.match(captureSource, /process\.env\.ATLAS_RUNNER_SHA/, "Capture children accept the committed runner identity");
  assert.match(adapterSource, /env\.ATLAS_RUNTIME_SHA = identity\.runtimeSha/, "The shard adapter passes the frozen runtime SHA");
  assert.match(adapterSource, /env\.ATLAS_RUNNER_SHA = identity\.runnerSha/, "The shard adapter passes the committed runner SHA separately");
  assert.match(adapterSource, /sourceSha: identity\.runtimeSha/, "Server identity checks use the frozen runtime SHA");
  assert.match(cliSource, /roots\(exactIdentity\.runtimeSha\)/, "Plan lookup is keyed by runtime SHA rather than runner HEAD");
  assert.match(cliSource, /Supply --runtime-sha, --runtime-build-id, and --runner-sha/, "Ambiguous identity fails closed with explicit guidance");

  const missingIdentityRun = spawnSync(process.execPath, [
    path.join(ROOT, "scripts", "qa", "stage4-6c-atlas-cli.mjs"),
    "verify-shard",
    "--shard",
    "synthetic",
  ], { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.notEqual(missingIdentityRun.status, 0);
  assert.match(`${missingIdentityRun.stdout}\n${missingIdentityRun.stderr}`, /Atlas runtime identity is ambiguous/);

  const runtimeDiff = spawnSync("git", [
    "diff",
    "--name-only",
    "--",
    "app",
    "components",
    "src",
    "prisma",
    "middleware",
    "mobile-app",
  ], { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(runtimeDiff.status, 0);
  assert.equal(runtimeDiff.stdout.trim(), "", "dual-identity runner work must not modify runtime or mobile files");

  const sameShaIdentity = createAtlasDualIdentity({
    runtimeSha: "1".repeat(40),
    runtimeBuildId: "same-build",
    runnerSha: "1".repeat(40),
    runnerVersion: "runner-v1",
    semanticRegistryVersion: "semantic-v1",
    fixtureVersion: "fixture-v1",
    syntheticSeed: "seed-v1",
    browserVersion: "browser-v1",
    nodeVersion: "node-v1",
  });
  assert.equal(sameShaIdentity.runtimeSha, sameShaIdentity.runnerSha, "same runtime and runner SHA remains supported");

  const dualIdentity = createAtlasDualIdentity({
    runtimeSha: "2".repeat(40),
    runtimeBuildId: "runtime-build",
    runtimeTag: "synthetic-frozen-tag",
    runnerSha: "3".repeat(40),
    runnerVersion: "runner-v2",
    semanticRegistryVersion: "semantic-v2",
    fixtureVersion: "fixture-v2",
    syntheticSeed: "seed-v2",
    browserVersion: "browser-v2",
    nodeVersion: "node-v2",
  });
  assert.notEqual(dualIdentity.runtimeSha, dualIdentity.runnerSha, "newer QA runner is represented independently");
  assert.equal(dualIdentity.sourceSha, dualIdentity.runtimeSha, "compatibility source SHA remains the runtime SHA");
  assert.equal(dualIdentity.buildId, dualIdentity.runtimeBuildId, "compatibility BUILD_ID remains the runtime BUILD_ID");
  assert.deepEqual(assertPlanRuntimeIdentity({
    sourceSha: dualIdentity.runtimeSha,
    buildId: dualIdentity.runtimeBuildId,
  }, dualIdentity), {
    runtimeSha: dualIdentity.runtimeSha,
    runtimeBuildId: dualIdentity.runtimeBuildId,
    runtimeTag: null,
  });
  assert.throws(
    () => assertPlanRuntimeIdentity({ sourceSha: "4".repeat(40), buildId: dualIdentity.runtimeBuildId }, dualIdentity),
    /runtime SHA/,
  );
  assert.throws(
    () => assertPlanRuntimeIdentity({ sourceSha: dualIdentity.runtimeSha, buildId: "wrong-build" }, dualIdentity),
    /BUILD_ID/,
  );
  assert.equal(assertAdapterIdentity({
    currentRunnerSha: dualIdentity.runnerSha,
    currentBuildId: dualIdentity.runtimeBuildId,
    expected: dualIdentity,
  }), dualIdentity, "browser adapter validates runner HEAD separately from runtime BUILD_ID");
  assert.throws(
    () => assertAdapterIdentity({
      currentRunnerSha: "4".repeat(40),
      currentBuildId: dualIdentity.runtimeBuildId,
      expected: dualIdentity,
    }),
    /runner SHA/,
  );
  assert.throws(
    () => assertAdapterIdentity({
      currentRunnerSha: dualIdentity.runnerSha,
      currentBuildId: "wrong-build",
      expected: dualIdentity,
    }),
    /BUILD_ID/,
  );
  assert.equal(verifyEvidenceIdentity({
    runtimeSha: dualIdentity.runtimeSha,
    runtimeBuildId: dualIdentity.runtimeBuildId,
    runnerSha: dualIdentity.runnerSha,
  }, dualIdentity).passed, true);
  assert.deepEqual(verifyEvidenceIdentity({
    runtimeSha: "4".repeat(40),
    runtimeBuildId: dualIdentity.runtimeBuildId,
    runnerSha: dualIdentity.runnerSha,
  }, dualIdentity).failures, ["RUNTIME_SHA_MISMATCH"]);
  assert.deepEqual(verifyEvidenceIdentity({
    runtimeSha: dualIdentity.runtimeSha,
    runtimeBuildId: "wrong-build",
    runnerSha: dualIdentity.runnerSha,
  }, dualIdentity).failures, ["RUNTIME_BUILD_ID_MISMATCH"]);
  assert.deepEqual(verifyEvidenceIdentity({
    runtimeSha: dualIdentity.runtimeSha,
    runtimeBuildId: dualIdentity.runtimeBuildId,
    runnerSha: "4".repeat(40),
  }, dualIdentity).failures, ["RUNNER_SHA_MISMATCH"]);
  assert.deepEqual(verifyEvidenceIdentity({
    commitSha: dualIdentity.runtimeSha,
    buildId: dualIdentity.runtimeBuildId,
  }, dualIdentity).failures, ["RUNNER_SHA_MISSING"]);
  assert.equal(verifyEvidenceIdentity({
    commitSha: dualIdentity.runtimeSha,
    buildId: dualIdentity.runtimeBuildId,
  }, dualIdentity, { allowLegacyRunnerIdentity: true }).passed, true);

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
  const shardIdentity = shardIdentityRecord(dualIdentity, shard);
  await writeSafeCheckpoint(shardProgress, {
    schema: "Stage4_6CAtlasShardProgressV1",
    shardId: shard.id,
    identity: shardIdentity,
    entries: {
      "ONE:360x800": {
        ...shardIdentity,
        status: "VERIFIED",
        screenshotPath: artifact,
        screenshotSha256: artifactHash,
        screenshotBytes: artifactBytes.length,
      },
      "TWO:360x800": {
        ...shardIdentity,
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
        ...shardIdentity,
        status: "VERIFIED",
        screenshotPath: artifact,
        screenshotSha256: artifactHash,
        screenshotBytes: artifactBytes.length,
        entryId: entry.id,
      };
    },
    identity: dualIdentity,
  });
  assert.equal(captures, 1, "resume must skip hash-verified entry and retry only failed entry");
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  assert.equal(resumed.summary.verified, 2);
  const resumedResult = await readSafeCheckpoint(`${shardProgress}.result.json`);
  assert.equal(resumedResult.identity.runtimeSha, dualIdentity.runtimeSha);
  assert.equal(resumedResult.identity.runnerSha, dualIdentity.runnerSha);
  assert.equal(resumed.progress.journal.every((entry) =>
    entry.runtimeSha === dualIdentity.runtimeSha
    && entry.runtimeBuildId === dualIdentity.runtimeBuildId
    && entry.runnerSha === dualIdentity.runnerSha
    && entry.shardId === shard.id
  ), true, "every new shard journal event records both identities");

  const wrongIdentityProgress = path.join(temporary, "wrong-identity.progress.json");
  await writeSafeCheckpoint(wrongIdentityProgress, {
    schema: "Stage4_6CAtlasShardProgressV1",
    shardId: shard.id,
    entries: {
      "ONE:360x800": {
        ...shardIdentity,
        runtimeSha: "4".repeat(40),
        status: "VERIFIED",
        screenshotPath: artifact,
        screenshotSha256: artifactHash,
        screenshotBytes: artifactBytes.length,
      },
      "TWO:360x800": {
        ...shardIdentity,
        status: "VERIFIED",
        screenshotPath: artifact,
        screenshotSha256: artifactHash,
        screenshotBytes: artifactBytes.length,
      },
    },
    journal: [],
  });
  const wrongIdentityVerification = await verifyAtlasShard(shard, wrongIdentityProgress, { identity: dualIdentity });
  assert.equal(wrongIdentityVerification.passed, false);
  assert.match(wrongIdentityVerification.identityFailures.join(" "), /RUNTIME_SHA_MISMATCH/);

  const legacyProgress = path.join(temporary, "legacy-identity.progress.json");
  await writeSafeCheckpoint(legacyProgress, {
    schema: "Stage4_6CAtlasShardProgressV1",
    shardId: shard.id,
    entries: Object.fromEntries(shard.entries.map((entry) => [entry.id, {
      commitSha: dualIdentity.runtimeSha,
      buildId: dualIdentity.runtimeBuildId,
      status: "VERIFIED",
      screenshotPath: artifact,
      screenshotSha256: artifactHash,
      screenshotBytes: artifactBytes.length,
    }])),
    journal: [],
  });
  assert.equal((await verifyAtlasShard(shard, legacyProgress, { identity: dualIdentity })).passed, false, "missing runner identity is rejected by default");
  const legacyVerification = await verifyAtlasShard(shard, legacyProgress, {
    identity: dualIdentity,
    allowLegacyRunnerIdentity: true,
  });
  assert.equal(legacyVerification.passed, true, "explicit legacy verification preserves existing evidence without relabelling");
  assert.equal(legacyVerification.legacyRunnerIdentityEntries.length, shard.entries.length);

  let cleanupAfterFailure = 0;
  await runAtlasShard({
    shard: { id: "cleanup-shard", entries: [{ id: "FAIL:360x800" }] },
    progressPath: path.join(temporary, "cleanup.progress.json"),
    lifecycle: {
      async start() { return {}; },
      async stop() { cleanupAfterFailure += 1; },
    },
    async captureEntry() { throw new Error("synthetic capture failure"); },
    identity: dualIdentity,
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
  await removeTemporaryDirectory(resolved);
}
