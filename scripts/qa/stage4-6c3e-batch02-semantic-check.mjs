import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  HOST,
  PORT,
  ROOT,
  buildEnvironment,
  git,
  loadPrivateConfig,
  portOwner,
  sha256,
} from "../staging/core.mjs";
import { readSafeCheckpoint, writeSafeCheckpoint } from "./atlas-safe-checkpoint.mjs";

const require = createRequire(import.meta.url);
const BASE = `http://${HOST}:${PORT}`;
const OUTPUT_ROOT = path.join(ROOT, ".codex-tmp", "stage4-6c3e");
const PREFLIGHT_PATH = path.join(ROOT, ".codex-tmp", "stage4-6c1", "semantic-preflight.json");
const RUNTIME_SHA = "b15fd367068c6bda754b9ffd7aab46a03b22b322";
const RUNTIME_BUILD_ID = "si6GMY3CKc6-Bc0XwtVVd";
const HISTORICAL_RUNTIME_SHA = "70265f9a1b6e2fb9b702bef88feded586b031bfa";
const FAILED_STATES = [
  "DATA_WRONG_PASSWORD",
  "IMPORT_AMAZON_THREE_ROLE",
  "IMPORT_CANCELLED",
  "IMPORT_COMPLETED",
  "IMPORT_MULTI_FILE",
  "IMPORT_NEEDS_MAPPING",
  "IMPORT_ONE_FILE",
  "IMPORT_UPLOAD_EMPTY",
  "IMPORT_VALIDATION_ERROR",
  "MARK_COMPLETED",
  "MARK_PARTIAL",
  "MARK_READY",
  "OWNER_EMPTY_ACCOUNT",
  "PACK_ASSEMBLY_LOCKED",
];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
    let json = null;
    try { json = await response.json(); } catch {}
    return { status: response.status, json };
  } catch {
    return { status: null, json: null };
  }
}

async function waitForServer(child, expected) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Bounded semantic server exited with code ${child.exitCode}.`);
    const [login, identity] = await Promise.all([
      fetchStatus(`${BASE}/login`),
      fetchStatus(`${BASE}/api/staging/identity`),
    ]);
    if (login.status === 200
      && identity.status === 200
      && identity.json?.sourceSha === expected.sourceSha
      && identity.json?.buildId === expected.buildId
      && identity.json?.pid === child.pid
      && identity.json?.commandFingerprint === expected.commandFingerprint
      && identity.json?.tokenSha256 === expected.tokenSha256) return identity.json;
    await delay(500);
  }
  throw new Error("Bounded semantic server failed exact health verification.");
}

async function stopOwnedServer(child) {
  if (!child || child.exitCode != null) return;
  try { child.kill("SIGTERM"); } catch {}
  let deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!await portOwner()) return;
    await delay(250);
  }
  if (process.platform === "win32" && await portOwner()) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
    });
  }
  deadline = Date.now() + 15_000;
  while (Date.now() < deadline && await portOwner()) await delay(250);
  assert.equal(Boolean(await portOwner()), false, `Port ${PORT} must be closed after the bounded semantic check.`);
}

function runCapture(viewports, environment, logChunks) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(ROOT, "scripts", "qa", "stage4-5-capture.mjs"),
      "--semantic-only",
      "--viewports",
      viewports,
      "--states",
      FAILED_STATES.join(","),
    ], {
      cwd: ROOT,
      env: environment,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      reject(new Error("Batch 02 semantic capture exceeded 20 minutes."));
    }, 20 * 60_000);
    child.stdout.on("data", (chunk) => logChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => logChunks.push(String(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Batch 02 semantic capture exited with code ${code}.`));
    });
  });
}

const mode = process.argv.includes("--widths") ? "widths" : "preflight";
const requestedViewports = mode === "widths" ? "360x800,1440x900" : "360x800";
const expectedJobs = mode === "widths" ? FAILED_STATES.length * 2 : FAILED_STATES.length;
assert.equal(Boolean(await portOwner()), false, `Port ${PORT} must be closed before the bounded semantic check.`);
assert.equal(String(await readFile(path.join(ROOT, ".next", "BUILD_ID"), "utf8")).trim(), RUNTIME_BUILD_ID);
assert.equal(git(["rev-parse", RUNTIME_SHA]), RUNTIME_SHA);

await mkdir(OUTPUT_ROOT, { recursive: true });
await writeSafeCheckpoint(path.join(ROOT, ".codex-tmp", "ui-state-atlas", "historical", "HISTORICAL_PRE_C3D_RUNTIME_EVIDENCE.json"), {
  schema: "Stage4_6C3EHistoricalEvidenceLabelV1",
  label: "HISTORICAL_PRE_C3D_RUNTIME_EVIDENCE",
  runtimeSha: HISTORICAL_RUNTIME_SHA,
  currentRuntimeSha: RUNTIME_SHA,
  preservedPaths: [
    `.codex-tmp/ui-state-atlas/current/${HISTORICAL_RUNTIME_SHA}`,
    ".codex-tmp/ui-state-atlas/historical",
  ],
  disposition: "PRESERVED_NOT_REUSED_AS_CURRENT_RUNTIME_EVIDENCE",
  labelledAt: new Date().toISOString(),
});

const config = await loadPrivateConfig();
const nextBin = require.resolve("next/dist/bin/next");
const commandFingerprint = sha256([nextBin, "start", HOST, String(PORT)].join("\0"));
const expected = {
  sourceSha: RUNTIME_SHA,
  buildId: RUNTIME_BUILD_ID,
  commandFingerprint,
  tokenSha256: sha256(config.runtimeIdentityToken),
};
const environment = buildEnvironment(config, expected);
environment.ATLAS_RUNTIME_SHA = RUNTIME_SHA;
environment.ATLAS_RUNTIME_BUILD_ID = RUNTIME_BUILD_ID;
environment.ATLAS_RUNNER_SHA = git(["rev-parse", "HEAD"]);
environment.ATLAS_SOURCE_SHA = RUNTIME_SHA;
environment.ATLAS_BRANCH = git(["branch", "--show-current"]);
const serverLog = [];
const captureLog = [];
const child = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(PORT)], {
  cwd: ROOT,
  env: environment,
  detached: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
child.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

try {
  const identity = await waitForServer(child, expected);
  await runCapture(requestedViewports, environment, captureLog);
  const result = await readSafeCheckpoint(PREFLIGHT_PATH, null);
  assert.ok(result, "Semantic preflight result is missing.");
  assert.equal(result.summary.requestedJobs, expectedJobs);
  assert.equal(result.summary.semanticVerified, expectedJobs);
  assert.equal(result.summary.broken, 0);
  assert.equal(result.results.length, expectedJobs);
  assert.equal(result.results.every((item) => item.semanticAssertion?.passed === true), true);
  const outputPath = path.join(OUTPUT_ROOT, `batch02-${mode}.json`);
  await writeSafeCheckpoint(outputPath, {
    schema: "Stage4_6C3EBatch02SemanticCheckV1",
    mode,
    runtimeSha: RUNTIME_SHA,
    runtimeBuildId: RUNTIME_BUILD_ID,
    runnerSha: git(["rev-parse", "HEAD"]),
    identity,
    requestedStates: FAILED_STATES,
    requestedViewports: requestedViewports.split(","),
    summary: result.summary,
    results: result.results,
    verifiedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify({
    status: mode === "widths"
      ? "STAGE4_6C3E_AFFECTED_WIDTHS_VERIFIED"
      : "STAGE4_6C3E_SEMANTIC_PREFLIGHT_VERIFIED",
    mode,
    requested: expectedJobs,
    verified: result.summary.semanticVerified,
    broken: result.summary.broken,
    outputPath: path.relative(ROOT, outputPath).replaceAll("\\", "/"),
  }, null, 2));
} catch (error) {
  await writeSafeCheckpoint(path.join(OUTPUT_ROOT, `batch02-${mode}-failure.json`), {
    schema: "Stage4_6C3EBatch02SemanticFailureV1",
    mode,
    runtimeSha: RUNTIME_SHA,
    runtimeBuildId: RUNTIME_BUILD_ID,
    error: error instanceof Error ? error.message : String(error),
    captureLog,
    serverLog,
    failedAt: new Date().toISOString(),
  });
  throw error;
} finally {
  await stopOwnedServer(child);
  await rm(path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "runtime", "server.json"), { force: true });
  await rm(path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "runtime", "ready.json"), { force: true });
  await rm(path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "runtime", "start.lock.json"), { force: true });
}
