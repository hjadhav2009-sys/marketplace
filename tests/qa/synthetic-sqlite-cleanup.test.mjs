import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  clearSyntheticSecurityThrottle,
  isSqliteContention,
} from "../../scripts/qa/synthetic-sqlite-cleanup.mjs";

const temporary = await mkdtemp(path.join(os.tmpdir(), "synthetic-throttle-cleanup-"));
const databasePath = path.join(temporary, "locked.db");
const missingTablePath = path.join(temporary, "missing-table.db");

function waitForLine(child, expected) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}.`)), 5_000);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (output.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!output.includes(expected)) reject(new Error(`Lock holder exited with ${code}: ${output}`));
    });
  });
}

try {
  const captureSource = await readFile(path.resolve("scripts/qa/stage4-5-capture.mjs"), "utf8");
  assert.match(captureSource, /synthetic-intentionally-wrong-password/);
  assert.match(captureSource, /assertOperationalSafetyUnchanged\(before\)/);
  assert.match(
    captureSource,
    /if \(scenarioId === "DATA_WRONG_PASSWORD"\)[\s\S]*?try \{[\s\S]*?\} finally \{[\s\S]*?clearSyntheticSecurityThrottle/,
    "Wrong-password throttle cleanup must remain in finally.",
  );

  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE SecurityThrottle (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL
    );
    INSERT INTO SecurityThrottle (id, scope) VALUES ('synthetic-lock-test', 'owner-data-reauth');
  `);
  database.close();

  const lockHolder = spawn(process.execPath, [
    "-e",
    `
      const { DatabaseSync } = require("node:sqlite");
      const database = new DatabaseSync(process.argv[1]);
      database.exec("BEGIN IMMEDIATE");
      process.stdout.write("LOCKED\\n");
      setTimeout(() => {
        database.exec("COMMIT");
        database.close();
        process.stdout.write("RELEASED\\n");
      }, 350);
    `,
    databasePath,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await waitForLine(lockHolder, "LOCKED");

  let retries = 0;
  const cleaned = await clearSyntheticSecurityThrottle({
    databasePath,
    scope: "owner-data-reauth",
    busyTimeoutMs: 40,
    retryDelayMs: 20,
    maximumElapsedMs: 2_000,
    onRetry() { retries += 1; },
  });
  assert.ok(retries >= 1, "The test must reproduce at least one SQLite contention retry.");
  assert.ok(cleaned.attempts >= 2);
  assert.equal(cleaned.changes, 1);

  const verification = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(
    verification.prepare("SELECT COUNT(*) AS count FROM SecurityThrottle WHERE scope = ?").get("owner-data-reauth").count,
    0,
  );
  verification.close();

  const repeated = await clearSyntheticSecurityThrottle({ databasePath, scope: "owner-data-reauth" });
  assert.equal(repeated.changes, 0, "Repeated cleanup is idempotent.");

  const missingTable = new DatabaseSync(missingTablePath);
  missingTable.close();
  let unrelatedRetries = 0;
  await assert.rejects(
    clearSyntheticSecurityThrottle({
      databasePath: missingTablePath,
      scope: "owner-data-reauth",
      onRetry() { unrelatedRetries += 1; },
    }),
    /no such table/i,
  );
  assert.equal(unrelatedRetries, 0, "Unrelated SQLite errors must not be retried.");
  assert.equal(isSqliteContention(new Error("no such table: SecurityThrottle")), false);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("Synthetic SQLite throttle cleanup contention tests passed.");
