import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(root, ".codex-tmp", `stage3-test-lifecycle-${process.pid}`);
const testPort = 33_000 + (process.pid % 1_000);
process.env.STAGE3_STAGING_ROOT = testRoot;
process.env.STAGE3_STAGING_PORT = String(testPort);
const core = await import("../scripts/staging/core.mjs");

const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const buildId = readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
const buildReceipt = { sourceSha, buildId, routeCount: 0, database: "SYNTHETIC_ONLY", createdAt: new Date().toISOString() };
const readReceipt = () => JSON.parse(readFileSync(core.PID_PATH, "utf8"));
const writeReceipt = (value) => writeFile(core.PID_PATH, `${JSON.stringify(value, null, 2)}\n`);

await rm(testRoot, { recursive: true, force: true });
try {
  await core.prepare({ confirmation: core.PREPARE_PHRASE });
  await mkdir(core.REPORT_ROOT, { recursive: true });
  await writeFile(path.join(core.REPORT_ROOT, "current-build.json"), `${JSON.stringify(buildReceipt, null, 2)}\n`);

  const simultaneousStartedAt = Date.now();
  const simultaneous = await Promise.allSettled([core.start(), core.start()]);
  assert.ok(Date.now() - simultaneousStartedAt < 120_000, "Start must return within 120 seconds.");
  assert.equal(simultaneous.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(simultaneous.filter((item) => item.status === "rejected").length, 1);
  assert.match(String(simultaneous.find((item) => item.status === "rejected").reason), /STAGING_START_ALREADY_IN_PROGRESS/);

  const first = await core.health();
  assert.equal(first.state, "RUNNING");
  assert.equal(first.healthy, true);
  assert.equal(first.loginStatus, 200);
  assert.equal(first.identityStatus, 200);
  assert.ok(core.pidExists(first.pid), "Server must remain alive after Start returns.");

  const repeated = await core.start();
  assert.equal(repeated.status, "STAGING_ALREADY_RUNNING");
  assert.equal(repeated.pid, first.pid, "Repeated Start must not create another server.");

  const goodReceipt = readReceipt();
  await writeReceipt({ ...goodReceipt, sourceSha: "0".repeat(40) });
  assert.equal((await core.status()).state, "MISMATCHED", "Incorrect source SHA must be rejected.");
  await writeReceipt(goodReceipt);
  await writeReceipt({ ...goodReceipt, buildId: "incorrect-build-id" });
  assert.equal((await core.status()).state, "MISMATCHED", "Incorrect BUILD_ID must be rejected.");
  await writeReceipt(goodReceipt);

  const restarted = await core.restart();
  assert.equal(restarted.before, "RUNNING");
  assert.equal(restarted.after, "RUNNING");
  const afterRestart = await core.health();
  assert.notEqual(afterRestart.pid, first.pid, "Restart must perform one verified stop and one new start.");

  await core.stop();
  assert.equal((await core.status()).state, "STOPPED");
  assert.equal(existsSync(core.PID_PATH), false);

  await writeFile(core.SERVER_STDOUT_PATH, "x".repeat((5 * 1024 * 1024) + 1));
  const rotatedStart = await core.start();
  assert.equal(rotatedStart.status, "RUNNING");
  assert.equal(existsSync(`${core.SERVER_STDOUT_PATH}.1`), true, "Oversized logs must rotate before launch.");
  await core.stop();

  const staleReceipt = { ...goodReceipt, pid: 999_999_991, serverPid: 999_999_991, startedAt: new Date(0).toISOString() };
  await writeReceipt(staleReceipt);
  const staleRecovered = await core.start();
  assert.equal(staleRecovered.status, "RUNNING", "A dead stale receipt must be repaired safely.");
  assert.notEqual(staleRecovered.pid, staleReceipt.pid);
  await core.stop();

  const unrelated = net.createServer();
  await new Promise((resolve, reject) => unrelated.once("error", reject).listen(testPort, core.HOST, resolve));
  await assert.rejects(() => core.start(), /STAGING_SERVER_MISMATCHED/);
  assert.equal(unrelated.listening, true, "An unrelated port owner must not be killed.");
  await new Promise((resolve) => unrelated.close(resolve));
  assert.equal(existsSync(core.PID_PATH), false);

  process.env.STAGE3_TEST_FAIL_CHILD_START = "true";
  await assert.rejects(() => core.start(), /exited before becoming healthy|did not become healthy/);
  delete process.env.STAGE3_TEST_FAIL_CHILD_START;
  assert.equal(existsSync(core.PID_PATH), false, "Failed startup must remove its own receipt.");
  assert.equal(existsSync(core.START_LOCK_PATH), false, "Failed startup must release its lock.");
  assert.equal(await core.portOwner(), false);

  const finalStart = await core.start();
  assert.equal(finalStart.status, "RUNNING");
  const finalPid = finalStart.pid;
  const stopped = await core.stop();
  assert.equal(stopped.pid, finalPid);
  assert.equal(core.pidExists(finalPid), false, "Stop must remove only the verified staging process.");
  assert.equal((await core.status()).state, "STOPPED");
} finally {
  delete process.env.STAGE3_TEST_FAIL_CHILD_START;
  try { await core.stop(); } catch {}
  await rm(testRoot, { recursive: true, force: true });
}

console.log("Stage 4.6B staging lifecycle process tests passed.");
