import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
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
import { readSafeCheckpoint } from "./atlas-safe-checkpoint.mjs";

const require = createRequire(import.meta.url);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForHealth(child, expected, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Shard server exited with code ${child.exitCode}.`);
    const [login, identity] = await Promise.all([
      fetchStatus(`http://${HOST}:${PORT}/login`),
      fetchStatus(`http://${HOST}:${PORT}/api/staging/identity`),
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
  throw new Error("Shard-owned server failed exact health verification in 120 seconds.");
}

async function stopOwnedProcess(child) {
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
  if (await portOwner()) throw new Error(`Shard-owned server did not release port ${PORT}.`);
}

function runProcess(command, args, {
  cwd,
  env,
  timeoutMs,
  logPath,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const write = (chunk) => appendFile(logPath, chunk).catch(() => {});
    child.stdout.on("data", write);
    child.stderr.on("data", write);
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      reject(new Error(`Capture subprocess exceeded ${timeoutMs} ms.`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Capture subprocess exited with code ${code}.`));
    });
  });
}

export async function createBrowserShardAdapter({
  identity,
  shardRoot,
  force = false,
} = {}) {
  if (!identity?.sourceSha || !identity?.buildId) throw new Error("Shard adapter requires exact source/build identity.");
  const currentSha = git(["rev-parse", "HEAD"]);
  const currentBuild = String(await readFile(path.join(ROOT, ".next", "BUILD_ID"), "utf8")).trim();
  if (currentSha !== identity.sourceSha || currentBuild !== identity.buildId) {
    throw new Error("Shard adapter source or BUILD_ID does not match the plan.");
  }
  if (await portOwner()) throw new Error(`Port ${PORT} is occupied before shard start.`);
  await mkdir(shardRoot, { recursive: true });
  const config = await loadPrivateConfig();
  const nextBin = require.resolve("next/dist/bin/next");
  const commandFingerprint = sha256([nextBin, "start", HOST, String(PORT)].join("\0"));
  const expected = {
    sourceSha: identity.sourceSha,
    buildId: identity.buildId,
    commandFingerprint,
    tokenSha256: sha256(config.runtimeIdentityToken),
  };
  const env = buildEnvironment(config, expected);

  return {
    lifecycle: {
      async start(shard) {
        const logPath = path.join(shardRoot, `${shard.id}.server.log`);
        await rm(logPath, { force: true });
        const child = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(PORT)], {
          cwd: ROOT,
          env,
          detached: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.on("data", (chunk) => appendFile(logPath, chunk).catch(() => {}));
        child.stderr.on("data", (chunk) => appendFile(logPath, chunk).catch(() => {}));
        await waitForHealth(child, expected);
        return { child, logPath };
      },
      async stop(server) {
        await stopOwnedProcess(server?.child);
      },
    },
    async captureEntry(entry, { remainingMs } = {}) {
      const logPath = path.join(shardRoot, `${entry.id.replaceAll(":", "__")}.capture.log`);
      await runProcess(process.execPath, [
        path.join(ROOT, "scripts", "qa", "stage4-5-capture.mjs"),
        "--state", entry.scenarioId,
        "--viewport", entry.viewport.id,
        "--resume",
        ...(force ? ["--force"] : []),
      ], {
        cwd: ROOT,
        env,
        timeoutMs: Math.max(1_000, Math.min(120_000, Number(remainingMs) || 120_000)),
        logPath,
      });
      const globalProgress = path.join(ROOT, ".codex-tmp", "ui-state-atlas", "current", identity.sourceSha, "progress.json");
      const progress = await readSafeCheckpoint(globalProgress, { completed: {} });
      const result = progress.completed?.[entry.id];
      if (!result) throw new Error(`Capture result ${entry.id} was not recorded.`);
      const screenshotPath = result.fullPageMasterPath
        ? path.join(ROOT, ...result.fullPageMasterPath.split("/"))
        : null;
      return {
        status: result.auditStatus === "VERIFIED"
          && result.fullPageCaptureStatus === "VERIFIED"
          && result.semanticAssertion?.passed === true
          ? "VERIFIED"
          : "FAILED",
        screenshotPath,
        screenshotSha256: result.fullPageSha256,
        screenshotBytes: result.fullPageFileBytes,
        semanticAssertion: result.semanticAssertion,
        consoleErrors: result.consoleErrors,
        pageErrors: result.pageErrors,
        failedRequests: result.failedRequests,
        errorResponses: result.errorResponses,
        smallControls: result.smallControls,
        inspection: result.inspection,
        source: result,
      };
    },
  };
}

export const browserShardAdapterInternals = {
  waitForHealth,
  stopOwnedProcess,
};
