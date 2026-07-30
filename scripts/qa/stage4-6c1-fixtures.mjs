import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SYNTHETIC_FIXTURE_VERSION } from "./stage4-6c-semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRIVATE_ROOT = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging");
const DATABASE_PATH = path.join(PRIVATE_ROOT, "database", "staging.db");
const ENVIRONMENT_PATH = path.join(PRIVATE_ROOT, "runtime", "environment.json");
const RECEIPT_PATH = path.join(PRIVATE_ROOT, "reports", "stage4-6c1-fixtures.json");
const command = process.argv[2] ?? "verify";

function assertPrivatePath(candidate) {
  const resolved = path.resolve(candidate);
  const boundary = `${path.resolve(ROOT, ".codex-tmp")}${path.sep}`;
  if (!resolved.startsWith(boundary)) throw new Error(`Refusing non-private synthetic path: ${resolved}`);
}

function expectedRows(database) {
  return {
    assemblyReady: database.prepare(`
      SELECT id, stage, status, requiredQuantity, completedQuantity, problemReason
      FROM WorkTask WHERE id = 'stage3-order-assembly-ready-assemble'
    `).get(),
    assemblyPartial: database.prepare(`
      SELECT id, stage, status, requiredQuantity, completedQuantity, problemReason
      FROM WorkTask WHERE id = 'stage3-order-assembly-progress-assemble'
    `).get(),
    deletionPreview: database.prepare(`
      SELECT id, actionKind, state FROM DataDeletionJob WHERE id = 'stage4-delete-preview'
    `).get(),
    deletionQuarantine: database.prepare(`
      SELECT id, actionKind, state, totalFiles, totalBytes, purgeAfter
      FROM DataDeletionJob WHERE id = 'stage4-delete-quarantined'
    `).get(),
    deletionRestored: database.prepare(`
      SELECT id, actionKind, state FROM DataDeletionJob WHERE id = 'stage4-delete-completed'
    `).get(),
    deletionPurged: database.prepare(`
      SELECT id, actionKind, state FROM DataDeletionJob WHERE id = 'stage4-delete-purged'
    `).get(),
  };
}

function verifyRows(rows) {
  const failures = [];
  if (rows.assemblyReady?.stage !== "ASSEMBLE"
    || rows.assemblyReady?.status !== "READY"
    || rows.assemblyReady?.requiredQuantity <= 0
    || rows.assemblyReady?.completedQuantity !== 0
    || rows.assemblyReady?.problemReason != null) failures.push("ASSEMBLY_READY");
  if (rows.assemblyPartial?.stage !== "ASSEMBLE"
    || rows.assemblyPartial?.status !== "IN_PROGRESS"
    || rows.assemblyPartial?.completedQuantity <= 0
    || rows.assemblyPartial?.completedQuantity >= rows.assemblyPartial?.requiredQuantity
    || rows.assemblyPartial?.problemReason != null) failures.push("ASSEMBLY_PARTIAL");
  if (rows.deletionPreview?.actionKind !== "PURGE_QA_OPERATIONAL_DATA"
    || rows.deletionPreview?.state !== "PREVIEWED") failures.push("DATA_DELETE_PREVIEW");
  if (rows.deletionQuarantine?.actionKind !== "QUARANTINE_IMPORT_SOURCE_FILE"
    || rows.deletionQuarantine?.state !== "COMPLETED"
    || rows.deletionQuarantine?.totalFiles <= 0
    || Number(rows.deletionQuarantine?.purgeAfter) <= Date.now()) failures.push("DATA_QUARANTINED");
  if (rows.deletionRestored?.actionKind !== "RESTORE_QUARANTINED_FILES"
    || rows.deletionRestored?.state !== "COMPLETED") failures.push("DATA_RESTORED");
  if (rows.deletionPurged?.actionKind !== "PURGE_QUARANTINED_FILES"
    || rows.deletionPurged?.state !== "PURGED") failures.push("DATA_PURGED");
  return failures;
}

async function prepare() {
  assertPrivatePath(DATABASE_PATH);
  assertPrivatePath(ENVIRONMENT_PATH);
  assertPrivatePath(RECEIPT_PATH);
  if (!existsSync(DATABASE_PATH)) throw new Error("Synthetic staging database is missing.");
  const database = new DatabaseSync(DATABASE_PATH);
  const now = Date.now();
  try {
    database.exec("BEGIN IMMEDIATE");
    database.prepare(`
      UPDATE DataDeletionJob
      SET actionKind = 'QUARANTINE_IMPORT_SOURCE_FILE',
          state = 'COMPLETED',
          manifestJson = ?,
          quarantineRelativePath = 'stage4-delete-quarantined',
          totalFiles = 1,
          totalBytes = 22,
          purgeAfter = ?,
          completedAt = ?,
          updatedAt = ?
      WHERE id = 'stage4-delete-quarantined'
    `).run(
      JSON.stringify([{
        storageKind: "IMPORT_JOB",
        sourceRelativePath: "stage4-synthetic-import.csv",
        quarantineRelativePath: "0-stage4-synthetic-import.csv",
        size: 22,
      }]),
      now + 14 * 24 * 60 * 60 * 1000,
      now,
      now,
    );
    database.prepare(`
      INSERT INTO DataDeletionJob (
        id, accountId, actorUserId, actionKind, state, clientRequestId,
        requestFingerprint, scopeFingerprint, scopeJson, previewJson,
        totalFiles, totalBytes, completedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        actionKind = excluded.actionKind,
        state = excluded.state,
        totalFiles = excluded.totalFiles,
        totalBytes = excluded.totalBytes,
        completedAt = excluded.completedAt,
        updatedAt = excluded.updatedAt
    `).run(
      "stage4-delete-purged",
      "stage3-account-fk-01",
      "stage3-owner",
      "PURGE_QUARANTINED_FILES",
      "PURGED",
      "stage4-purged",
      "1".repeat(64),
      "2".repeat(64),
      JSON.stringify({ synthetic: true, deletionJobId: "stage4-delete-historical-source" }),
      JSON.stringify({ synthetic: true, affectedFiles: 1 }),
      1,
      22,
      now,
      now,
      now,
    );
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
  const rows = expectedRows(database);
  database.close();
  const failures = verifyRows(rows);
  if (failures.length) throw new Error(`Synthetic fixture preparation failed: ${failures.join(", ")}`);

  const environment = JSON.parse(await readFile(ENVIRONMENT_PATH, "utf8"));
  environment.seedVersion = SYNTHETIC_FIXTURE_VERSION;
  await writeFile(ENVIRONMENT_PATH, `${JSON.stringify(environment, null, 2)}\n`);
  await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify({
    schema: "Stage4_6C1SyntheticFixtureReceiptV1",
    fixtureVersion: SYNTHETIC_FIXTURE_VERSION,
    syntheticOnly: true,
    databasePath: path.relative(ROOT, DATABASE_PATH).replaceAll(path.sep, "/"),
    preparedAt: new Date().toISOString(),
    rows,
  }, null, 2)}\n`);
  return { status: "STAGE4_6C1_FIXTURES_PREPARED", fixtureVersion: SYNTHETIC_FIXTURE_VERSION, failures: [] };
}

function verify() {
  assertPrivatePath(DATABASE_PATH);
  if (!existsSync(DATABASE_PATH)) throw new Error("Synthetic staging database is missing.");
  const database = new DatabaseSync(DATABASE_PATH, { readOnly: true });
  const rows = expectedRows(database);
  database.close();
  const failures = verifyRows(rows);
  return {
    status: failures.length ? "STAGE4_6C1_FIXTURES_INVALID" : "STAGE4_6C1_FIXTURES_VERIFIED",
    fixtureVersion: SYNTHETIC_FIXTURE_VERSION,
    failures,
    rows,
  };
}

const result = command === "prepare" ? await prepare() : verify();
console.log(JSON.stringify(result, null, 2));
if (result.failures.length) process.exitCode = 2;
