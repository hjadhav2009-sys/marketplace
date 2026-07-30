import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
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

async function identity() {
  const sourceSha = git(["rev-parse", "HEAD"]);
  const buildIdPath = path.join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(buildIdPath)) throw new Error("Create one exact staging build before planning atlas shards.");
  const buildId = String(await readFile(buildIdPath, "utf8")).trim();
  const environmentPath = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "runtime", "environment.json");
  const environment = JSON.parse(await readFile(environmentPath, "utf8"));
  return {
    sourceSha,
    buildId,
    syntheticSeed: environment.seedVersion,
    browserVersion: "150.0.7871.187",
    nodeVersion: process.version,
    semanticRegistryVersion: SEMANTIC_REGISTRY_VERSION,
    syntheticFixtureVersion: SYNTHETIC_FIXTURE_VERSION,
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
  };
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
const exactIdentity = await identity();
const locations = roots(exactIdentity.sourceSha);

if (cli.command === "plan") {
  const plan = await createAtlasPlan(ROOT, exactIdentity);
  const written = await writeAtlasPlan(plan, locations.planRoot);
  const adopted = await adoptLegacyAtlasEvidence({
    plan,
    root: ROOT,
    legacyProgressPath: path.join(ROOT, ".codex-tmp", "ui-state-atlas", "current", exactIdentity.sourceSha, "progress.json"),
    legacyManifestPath: path.join(ROOT, ".codex-tmp", "ui-state-atlas", "frozen", exactIdentity.sourceSha, "atlas-manifest.json"),
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
  const plan = await loadPlan(locations.planPath);
  const shard = plan.shards.find((item) => item.id === cli.shard);
  if (!shard) throw new Error(`Unknown shard ${cli.shard}.`);
  await mkdir(locations.progressRoot, { recursive: true });
  const progressPath = path.join(locations.progressRoot, `${shard.id}.progress.json`);
  const adapter = await createBrowserShardAdapter({
    identity: plan.identity,
    shardRoot: locations.progressRoot,
    force: cli.force,
  });
  const result = await runAtlasShard({
    shard,
    progressPath,
    captureEntry: adapter.captureEntry,
    lifecycle: adapter.lifecycle,
    force: cli.force,
  });
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.summary.verified !== result.summary.required) process.exitCode = 2;
} else if (cli.command === "verify-shard") {
  if (!cli.shard) throw new Error("Use --shard <viewport-batch-id>.");
  const plan = await loadPlan(locations.planPath);
  const shard = plan.shards.find((item) => item.id === cli.shard);
  if (!shard) throw new Error(`Unknown shard ${cli.shard}.`);
  const result = await verifyAtlasShard(shard, path.join(locations.progressRoot, `${shard.id}.progress.json`));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 2;
} else if (cli.command === "resume") {
  const plan = await loadPlan(locations.planPath);
  const pending = [];
  for (const shard of plan.shards) {
    const verification = await verifyAtlasShard(shard, path.join(locations.progressRoot, `${shard.id}.progress.json`));
    if (!verification.passed) pending.push({
      shard: shard.id,
      verified: verification.verified.length,
      failed: verification.failed.length,
      missing: verification.missing.length,
    });
  }
  console.log(JSON.stringify({ status: pending.length ? "ATLAS_RESUME_REQUIRED" : "ATLAS_ALL_SHARDS_VERIFIED", pending }, null, 2));
} else if (cli.command === "aggregate") {
  const plan = await loadPlan(locations.planPath);
  const aggregate = await aggregateAtlas(plan, locations.progressRoot);
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
