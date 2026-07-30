import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { git } from "../staging/core.mjs";
import { readSafeCheckpoint, writeSafeCheckpoint } from "./atlas-safe-checkpoint.mjs";
import {
  adoptLegacyAtlasEvidence,
  aggregateAtlas,
  createAtlasPlan,
  runAtlasShard,
  verifyAtlasShard,
  writeAtlasPlan,
} from "./stage4-6c-atlas-engine.mjs";
import { createBrowserShardAdapter } from "./stage4-6c-browser-shard-adapter.mjs";
import {
  assertPlanRuntimeIdentity,
  createAtlasDualIdentity,
} from "./stage4-6c-atlas-identity.mjs";
import { CAPTURE_RUNNER_VERSION } from "./stage4-5-scenarios.mjs";
import {
  SEMANTIC_REGISTRY_VERSION,
  SYNTHETIC_FIXTURE_VERSION,
} from "./stage4-6c-semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function options(argv) {
  const parsed = { command: argv[0] ?? "plan", force: false };
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--force") parsed.force = true;
    else if (value.startsWith("--")) parsed[value.slice(2)] = argv[++index];
  }
  return parsed;
}

async function availableRuntimePlans() {
  const root = path.join(ROOT, ".codex-tmp", "ui-state-atlas", "plans");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[0-9a-f]{40}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function explicitOption(cli, name, environmentName) {
  return String(cli[name] ?? process.env[environmentName] ?? "").trim();
}

async function identity(cli) {
  const runtimeSha = explicitOption(cli, "runtime-sha", "ATLAS_RUNTIME_SHA");
  const runtimeBuildId = explicitOption(cli, "runtime-build-id", "ATLAS_RUNTIME_BUILD_ID");
  const runnerSha = explicitOption(cli, "runner-sha", "ATLAS_RUNNER_SHA");
  if (!runtimeSha || !runtimeBuildId || !runnerSha) {
    const available = await availableRuntimePlans();
    throw new Error(
      "Atlas runtime identity is ambiguous. Supply --runtime-sha, --runtime-build-id, and --runner-sha. "
      + `Available runtime plans: ${available.length ? available.join(", ") : "none"}.`,
    );
  }
  const currentRunnerSha = git(["rev-parse", "HEAD"]);
  if (runnerSha !== currentRunnerSha) throw new Error("Explicit runner SHA does not match current committed HEAD.");
  if (git(["status", "--porcelain"])) throw new Error("Atlas runner worktree must be clean.");
  const buildIdPath = path.join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(buildIdPath)) throw new Error("Create one exact staging build before planning atlas shards.");
  const buildId = String(await readFile(buildIdPath, "utf8")).trim();
  if (runtimeBuildId !== buildId) throw new Error("Explicit runtime BUILD_ID does not match the existing production build.");
  git(["cat-file", "-e", `${runtimeSha}^{commit}`]);
  git(["cat-file", "-e", `${runnerSha}^{commit}`]);
  if (git(["merge-base", runtimeSha, runnerSha]) !== runtimeSha) {
    throw new Error("Frozen runtime SHA must equal or be an ancestor of the QA runner SHA.");
  }
  const allowedRunnerPaths = [
    /^docs\/qa\//,
    /^scripts\/qa\//,
    /^tests\/qa\//,
    /^package\.json$/,
    /^scripts\/staging\/(?:core\.mjs|seed\.ts)$/,
    /^tests\/staging\.test\.mjs$/,
  ];
  const disallowed = git(["diff", "--name-only", `${runtimeSha}..${runnerSha}`])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !allowedRunnerPaths.some((pattern) => pattern.test(file)));
  if (disallowed.length) {
    throw new Error(`Runtime application changes exist after the frozen runtime SHA: ${disallowed.join(", ")}`);
  }
  const runtimeTag = explicitOption(cli, "runtime-tag", "ATLAS_RUNTIME_TAG") || null;
  if (runtimeTag && git(["rev-list", "-n", "1", runtimeTag]) !== runtimeSha) {
    throw new Error("Explicit runtime tag does not resolve to the frozen runtime SHA.");
  }
  const environmentPath = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "runtime", "environment.json");
  const environment = JSON.parse(await readFile(environmentPath, "utf8"));
  return createAtlasDualIdentity({
    runtimeSha,
    runtimeBuildId,
    runtimeTag,
    runnerSha,
    runnerVersion: CAPTURE_RUNNER_VERSION,
    semanticRegistryVersion: SEMANTIC_REGISTRY_VERSION,
    fixtureVersion: SYNTHETIC_FIXTURE_VERSION,
    syntheticSeed: environment.seedVersion,
    browserVersion: "150.0.7871.187",
    nodeVersion: process.version,
    fixtures: {
      credentialRoles: [
        "Synthetic Owner",
        "Synthetic Picker A",
        "Synthetic Marker",
        "Synthetic Assembler",
        "Synthetic Packer A",
        "Synthetic View-All Worker",
      ],
      accountCodes: ["STAGE-FK-01", "STAGE-AMZ-01"],
    },
  });
}

function roots(sourceSha) {
  const planRoot = path.join(ROOT, ".codex-tmp", "ui-state-atlas", "plans", sourceSha);
  return {
    planRoot,
    planPath: path.join(planRoot, "atlas-plan.json"),
    manifestRoot: path.join(planRoot, "shards"),
    progressRoot: path.join(planRoot, "progress"),
    aggregatePath: path.join(planRoot, "atlas-aggregate.json"),
  };
}

async function loadPlan(planPath) {
  const plan = await readSafeCheckpoint(planPath, null);
  if (!plan) throw new Error("Atlas plan is missing. Run atlas:plan first.");
  return plan;
}

const cli = options(process.argv.slice(2));
const exactIdentity = await identity(cli);
const locations = roots(exactIdentity.runtimeSha);

async function loadMatchingPlan() {
  const plan = await loadPlan(locations.planPath);
  assertPlanRuntimeIdentity(plan.identity, exactIdentity);
  return plan;
}

function isPreservedLegacyFirstShard(plan, shard) {
  return !plan.identity?.runnerSha && shard.id === "360x800-batch-01";
}

if (cli.command === "plan") {
  const plan = await createAtlasPlan(ROOT, exactIdentity);
  const written = await writeAtlasPlan(plan, locations.planRoot);
  const adopted = await adoptLegacyAtlasEvidence({
    plan,
    root: ROOT,
    legacyProgressPath: path.join(ROOT, ".codex-tmp", "ui-state-atlas", "current", exactIdentity.runtimeSha, "progress.json"),
    legacyManifestPath: path.join(ROOT, ".codex-tmp", "ui-state-atlas", "frozen", exactIdentity.runtimeSha, "atlas-manifest.json"),
    shardProgressRoot: locations.progressRoot,
  });
  console.log(JSON.stringify({
    status: "ATLAS_PLAN_READY",
    ...written,
    semanticContracts: plan.semanticContractCount,
    fixtureMappings: plan.fixtureMappingCount,
    scenarios: plan.scenarioCount,
    entries: plan.entryCount,
    legacyEvidence: adopted,
  }, null, 2));
} else if (cli.command === "run-shard") {
  if (!cli.shard) throw new Error("Use --shard <viewport-batch-id>.");
  const plan = await loadMatchingPlan();
  const shard = plan.shards.find((item) => item.id === cli.shard);
  if (!shard) throw new Error(`Unknown shard ${cli.shard}.`);
  await mkdir(locations.progressRoot, { recursive: true });
  const progressPath = path.join(locations.progressRoot, `${shard.id}.progress.json`);
  const adapter = await createBrowserShardAdapter({
    identity: exactIdentity,
    shardRoot: locations.progressRoot,
    force: cli.force,
  });
  const result = await runAtlasShard({
    shard,
    progressPath,
    captureEntry: adapter.captureEntry,
    lifecycle: adapter.lifecycle,
    force: cli.force,
    identity: exactIdentity,
  });
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.summary.verified !== result.summary.required) process.exitCode = 2;
} else if (cli.command === "verify-shard") {
  if (!cli.shard) throw new Error("Use --shard <viewport-batch-id>.");
  const plan = await loadMatchingPlan();
  const shard = plan.shards.find((item) => item.id === cli.shard);
  if (!shard) throw new Error(`Unknown shard ${cli.shard}.`);
  const progressPath = path.join(locations.progressRoot, `${shard.id}.progress.json`);
  const result = await verifyAtlasShard(shard, progressPath, {
    identity: exactIdentity,
    allowLegacyRunnerIdentity: isPreservedLegacyFirstShard(plan, shard),
  });
  const receiptPath = `${progressPath}.verification.${exactIdentity.runnerSha}.json`;
  await writeSafeCheckpoint(receiptPath, {
    schema: "Stage4_6CAtlasShardVerificationV1",
    identity: exactIdentity,
    shardId: shard.id,
    viewport: shard.viewport?.id ?? null,
    result,
    verifiedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 2;
} else if (cli.command === "resume") {
  const plan = await loadMatchingPlan();
  const pending = [];
  for (const shard of plan.shards) {
    const verification = await verifyAtlasShard(
      shard,
      path.join(locations.progressRoot, `${shard.id}.progress.json`),
      {
        identity: exactIdentity,
        allowLegacyRunnerIdentity: isPreservedLegacyFirstShard(plan, shard),
      },
    );
    if (!verification.passed) pending.push({
      shard: shard.id,
      verified: verification.verified.length,
      failed: verification.failed.length,
      missing: verification.missing.length,
    });
  }
  console.log(JSON.stringify({ status: pending.length ? "ATLAS_RESUME_REQUIRED" : "ATLAS_ALL_SHARDS_VERIFIED", pending }, null, 2));
} else if (cli.command === "aggregate") {
  const plan = await loadMatchingPlan();
  const aggregate = await aggregateAtlas(plan, locations.progressRoot, {
    identity: exactIdentity,
    allowLegacyRunnerIdentityForShards: new Set(["360x800-batch-01"]),
  });
  await writeSafeCheckpoint(locations.aggregatePath, aggregate);
  console.log(JSON.stringify({
    status: aggregate.passed ? "ATLAS_AGGREGATE_VERIFIED" : "ATLAS_AGGREGATE_INCOMPLETE",
    required: aggregate.required,
    verified: aggregate.verified,
    failed: aggregate.failed,
    missing: aggregate.missing,
    aggregatePath: locations.aggregatePath,
  }, null, 2));
  if (!aggregate.passed) process.exitCode = 2;
} else {
  throw new Error(`Unknown atlas command ${cli.command}.`);
}
