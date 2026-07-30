import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  HOST,
  LOG_ROOT,
  PORT,
  REPORT_ROOT,
  ROOT,
  RUNTIME_ROOT,
  STAGING_ROOT,
  assertStagingPath,
  buildEnvironment,
  git,
  loadPrivateConfig,
  portOwner,
  sha256,
  status,
} from "../staging/core.mjs";
import {
  BROWSER_GATE_SCHEMA,
  parseBoundedMilliseconds,
  validateBrowserGateEvidence,
} from "./stage4-6b-browser-gate-core.mjs";

const require = createRequire(import.meta.url);
const START_TIMEOUT_MS = 120_000;
const TOTAL_TIMEOUT_MS = parseBoundedMilliseconds(
  process.env.STAGING_BROWSER_GATE_TIMEOUT_MS,
  45 * 60_000,
  { minimum: 60_000, maximum: 45 * 60_000, name: "STAGING_BROWSER_GATE_TIMEOUT_MS" },
);
const POLL_MS = 500;
const GATE_ROOT = assertStagingPath(path.join(REPORT_ROOT, "stage4-6b-browser-gate"));
const EVIDENCE_PATH = assertStagingPath(path.join(GATE_ROOT, "browser-evidence.json"));
const READY_PATH = assertStagingPath(path.join(GATE_ROOT, "ready.json"));
const RESULT_PATH = assertStagingPath(path.join(GATE_ROOT, "result.json"));
const GATE_RECEIPT_PATH = assertStagingPath(path.join(RUNTIME_ROOT, "browser-gate.json"));
const STDOUT_PATH = assertStagingPath(path.join(LOG_ROOT, "stage4-6b-browser-gate.out.log"));
const STDERR_PATH = assertStagingPath(path.join(LOG_ROOT, "stage4-6b-browser-gate.err.log"));
const BUILD_RECEIPT_PATH = assertStagingPath(path.join(REPORT_ROOT, "current-build.json"));
const BUILD_ID_PATH = path.join(ROOT, ".next", "BUILD_ID");
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const startedAt = Date.now();
const hardDeadline = startedAt + TOTAL_TIMEOUT_MS;
let interrupted = null;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = signal;
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rotateLog(filePath) {
  if (!existsSync(filePath)) return;
  const info = await stat(filePath);
  if (info.size < MAX_LOG_BYTES) return;
  await rm(`${filePath}.1`, { force: true });
  await writeFile(`${filePath}.1`, await readFile(filePath));
  await writeFile(filePath, "");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function tail(filePath, maxLines = 80) {
  if (!existsSync(filePath)) return [];
  return String(await readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean).slice(-maxLines);
}

function assertWithinDeadline() {
  if (interrupted) throw new Error(`Browser gate interrupted by ${interrupted}.`);
  if (Date.now() >= hardDeadline) throw new Error(`Browser gate exceeded the hard ${TOTAL_TIMEOUT_MS / 60_000}-minute timeout.`);
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    let json = null;
    try { json = await response.json(); } catch {}
    return { status: response.status, json };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitForExactHealth(expected, child) {
  const deadline = Math.min(Date.now() + START_TIMEOUT_MS, hardDeadline);
  while (Date.now() < deadline) {
    assertWithinDeadline();
    if (child.exitCode != null) throw new Error(`Owned staging child exited before health verification with code ${child.exitCode}.`);
    const [login, identity] = await Promise.all([
      fetchJson(`http://${HOST}:${PORT}/login`),
      fetchJson(`http://${HOST}:${PORT}/api/staging/identity`),
    ]);
    if (login.status === 200
      && identity.status === 200
      && identity.json?.environment === "PRIVATE_SYNTHETIC_STAGING"
      && identity.json?.pid === child.pid
      && identity.json?.sourceSha === expected.sourceSha
      && identity.json?.buildId === expected.buildId
      && identity.json?.commandFingerprint === expected.commandFingerprint
      && identity.json?.tokenSha256 === expected.tokenSha256) {
      return { loginStatus: login.status, identityStatus: identity.status, identity: identity.json };
    }
    await delay(POLL_MS);
  }
  throw new Error("Owned staging server did not reach exact-build health within 120 seconds.");
}

async function waitForEvidence(expected) {
  while (Date.now() < hardDeadline) {
    assertWithinDeadline();
    if (existsSync(EVIDENCE_PATH)) {
      const receipt = await readJson(EVIDENCE_PATH);
      const validation = validateBrowserGateEvidence(receipt, expected);
      if (!validation.valid) throw new Error(`Browser evidence failed validation: ${validation.failures.join(" ")}`);
      for (const screenshot of receipt.screenshots) {
        const absolute = path.resolve(ROOT, screenshot.path);
        if (!absolute.startsWith(`${path.resolve(ROOT, ".codex-tmp")}${path.sep}`)) throw new Error("Screenshot evidence escaped the ignored private root.");
        const bytes = await readFile(absolute);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (bytes.length !== screenshot.bytes || digest !== screenshot.sha256) throw new Error(`Screenshot evidence changed after capture: ${screenshot.path}`);
      }
      return receipt;
    }
    await delay(POLL_MS);
  }
  throw new Error("Browser evidence was not completed before the 45-minute hard timeout.");
}

async function stopOwnedChild(child) {
  if (!child || child.exitCode != null) return;
  try { child.kill("SIGTERM"); } catch {}
  let deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null && !await portOwner()) return;
    await delay(250);
  }
  if (process.platform === "win32") {
    const killed = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
    });
    if (killed.status !== 0 && child.exitCode == null) {
      throw new Error(`Owned browser-gate process could not be terminated: ${String(killed.stderr || killed.stdout).trim()}`);
    }
  } else {
    try { child.kill("SIGTERM"); } catch {}
  }
  deadline = Date.now() + 15_000;
  while (Date.now() < deadline && await portOwner()) await delay(250);
  if (await portOwner()) throw new Error("Owned browser-gate server did not release the private staging port.");
}

async function main() {
  await mkdir(GATE_ROOT, { recursive: true });
  await rm(EVIDENCE_PATH, { force: true });
  await rm(READY_PATH, { force: true });
  await rm(RESULT_PATH, { force: true });
  await rm(GATE_RECEIPT_PATH, { force: true });

  const lifecycle = await status();
  if (lifecycle.state !== "STOPPED") {
    throw new Error(`Browser gate requires stopped private staging; current state is ${lifecycle.state}. Use the verified staging:stop command first.`);
  }
  if (await portOwner()) throw new Error(`Port ${PORT} is occupied; refusing to start an owned browser-gate server.`);
  if (!existsSync(BUILD_RECEIPT_PATH) || !existsSync(BUILD_ID_PATH)) throw new Error("A matching reviewed staging build is required.");

  const buildReceipt = await readJson(BUILD_RECEIPT_PATH);
  const sourceSha = git(["rev-parse", "HEAD"]);
  const buildId = String(await readFile(BUILD_ID_PATH, "utf8")).trim();
  if (buildReceipt.sourceSha !== sourceSha || buildReceipt.buildId !== buildId) {
    throw new Error("The existing staging build does not match the current source HEAD. The browser gate will not rebuild automatically.");
  }

  const config = await loadPrivateConfig();
  const nextBin = require.resolve("next/dist/bin/next");
  const commandFingerprint = sha256([nextBin, "start", HOST, String(PORT)].join("\0"));
  const tokenSha256 = sha256(config.runtimeIdentityToken);
  const expected = { sourceSha, buildId, commandFingerprint, tokenSha256 };
  const env = buildEnvironment(config, expected);
  await rotateLog(STDOUT_PATH);
  await rotateLog(STDERR_PATH);
  const stdout = openSync(STDOUT_PATH, "a");
  const stderr = openSync(STDERR_PATH, "a");
  let child;
  try {
    child = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(PORT)], {
      cwd: ROOT,
      env,
      detached: false,
      stdio: ["ignore", stdout, stderr],
      windowsHide: true,
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }

  const gateToken = randomBytes(24).toString("base64url");
  const receipt = {
    schema: "Stage4_6BBrowserGateReceiptV1",
    environment: "PRIVATE_SYNTHETIC_STAGING",
    gatePid: process.pid,
    serverPid: child.pid,
    host: HOST,
    port: PORT,
    sourceSha,
    buildId,
    commandFingerprint,
    databaseRoot: path.relative(ROOT, STAGING_ROOT),
    evidencePath: path.relative(ROOT, EVIDENCE_PATH),
    gateTokenSha256: sha256(gateToken),
    startedAt: new Date().toISOString(),
    hardDeadline: new Date(hardDeadline).toISOString(),
  };
  await writeFile(GATE_RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });

  let finalResult;
  try {
    const health = await waitForExactHealth(expected, child);
    const ready = {
      schema: "Stage4_6BBrowserGateReadyV1",
      ...receipt,
      loginStatus: health.loginStatus,
      identityStatus: health.identityStatus,
      readyAt: new Date().toISOString(),
    };
    await writeFile(READY_PATH, `${JSON.stringify(ready, null, 2)}\n`);
    console.log(`STAGING_BROWSER_GATE_READY=${JSON.stringify({
      sourceSha,
      buildId,
      serverPid: child.pid,
      evidencePath: path.relative(ROOT, EVIDENCE_PATH),
      deadline: ready.hardDeadline,
    })}`);
    const evidence = await waitForEvidence(expected);
    finalResult = {
      status: "STAGE4_6B_BROWSER_GATE_PASSED",
      sourceSha,
      buildId,
      checkCount: evidence.checks.length,
      screenshotCount: evidence.screenshotCount,
      durationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    };
    await writeFile(RESULT_PATH, `${JSON.stringify(finalResult, null, 2)}\n`);
    console.log(JSON.stringify(finalResult, null, 2));
  } finally {
    await stopOwnedChild(child);
    await rm(GATE_RECEIPT_PATH, { force: true });
    await rm(READY_PATH, { force: true });
  }
  return finalResult;
}

try {
  await main();
} catch (error) {
  const failure = {
    status: "STAGE4_6B_BROWSER_GATE_FAILED",
    schema: BROWSER_GATE_SCHEMA,
    message: error instanceof Error ? error.message : String(error),
    stdoutTail: await tail(STDOUT_PATH),
    stderrTail: await tail(STDERR_PATH),
    durationMs: Date.now() - startedAt,
    failedAt: new Date().toISOString(),
  };
  await mkdir(GATE_ROOT, { recursive: true });
  await writeFile(RESULT_PATH, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}
