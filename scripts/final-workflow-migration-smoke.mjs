import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const temporaryRoot = resolve(root, ".codex-tmp");
const migrationsRoot = resolve(root, "prisma", "migrations");
const postgresMigrationsRoot = resolve(root, "prisma", "migrations-postgres");
const base = "20260717000400_final_workflow_correctness";
const latest = "20260718000500_projection_import_manual_catalog";
mkdirSync(temporaryRoot, { recursive: true });
const entries = readdirSync(migrationsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
assert.equal(entries.at(-1), latest, "Phase 7.3.6 catalog/import migration must remain the latest additive SQLite migration.");
const postgresEntries = readdirSync(postgresMigrationsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
assert.equal(postgresEntries.at(-1), latest, "Phase 7.3.6 catalog/import migration must remain the latest additive PostgreSQL migration.");
const phaseMigrations = entries.filter(name => name > base);
const postgresPhaseMigrations = postgresEntries.filter(name => name > base);
assert.deepEqual(postgresPhaseMigrations, phaseMigrations, "SQLite and PostgreSQL have the same post-final-workflow migration sequence.");
const apply = (database, name) => database.exec(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
const open = (name) => { const file = resolve(temporaryRoot, name); rmSync(file, { force: true }); const database = new DatabaseSync(file); database.exec("PRAGMA foreign_keys=ON;"); return { database, file }; };

const sorted = values => [...values].sort();
const phaseSql = phaseMigrations.map(name => readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8")).join("\n");
const postgresPhaseSql = postgresPhaseMigrations.map(name => readFileSync(join(postgresMigrationsRoot, name, "migration.sql"), "utf8")).join("\n");

function alteredColumns(sql) {
  const result = new Set();
  for (const statement of sql.matchAll(/ALTER TABLE "([^"]+)"([\s\S]*?);/g)) {
    for (const column of statement[2].matchAll(/ADD COLUMN "([^"]+)"/g)) result.add(`${statement[1]}.${column[1]}`);
  }
  return sorted(result);
}

function createdTables(sql) {
  const result = new Map();
  for (const table of sql.matchAll(/CREATE TABLE "([^"]+)"\s*\(([\s\S]*?)\n\);/g)) {
    result.set(table[1], sorted([...table[2].matchAll(/^\s*"([^"]+)"\s+/gm)].map(column => column[1])));
  }
  return [...result.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function createdIndexes(sql) {
  const result = new Set();
  for (const index of sql.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"\s*\(([^;]+)\);/g)) {
    const columns = [...index[4].matchAll(/"([^"]+)"/g)].map(column => column[1]).join(",");
    result.add(`${index[1] ? "UNIQUE" : "INDEX"}:${index[2]}:${index[3]}:${columns}`);
  }
  return sorted(result);
}

function foreignKeys(sql) {
  return sorted(new Set([...sql.matchAll(/CONSTRAINT\s+"([^"]+)"\s+FOREIGN KEY/g)].map(constraint => constraint[1])));
}

function createdTableBody(sql, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sql.match(new RegExp(`CREATE TABLE "${escaped}"\\s*\\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

assert.deepEqual(alteredColumns(postgresPhaseSql), alteredColumns(phaseSql), "Paired migrations add the same logical columns.");
assert.deepEqual(createdTables(postgresPhaseSql), createdTables(phaseSql), "Paired migrations create the same tables and logical columns.");
assert.deepEqual(createdIndexes(postgresPhaseSql), createdIndexes(phaseSql), "Paired migrations create the same named indexes and uniqueness constraints.");
assert.deepEqual(foreignKeys(postgresPhaseSql), foreignKeys(phaseSql), "Paired migrations create the same named foreign keys.");

for (const [table, key] of [["WorkProjectionState", "id"], ["SecurityThrottle", "keyHash"], ["MarketplaceListingAttribute", "id"]]) {
  assert.match(createdTableBody(phaseSql, table), new RegExp(`"${key}"[^\\n,]*PRIMARY KEY`), `SQLite ${table} keeps its primary key.`);
  assert.match(createdTableBody(postgresPhaseSql, table), new RegExp(`CONSTRAINT "${table}_pkey" PRIMARY KEY \\(\\"${key}\\"\\)`), `PostgreSQL ${table} keeps its primary key.`);
}

const essentialIndexNames = [
  "ProblemOrder_accountId_reportedById_clientRequestId_key",
  "ImportJob_status_leaseExpiresAt_idx",
  "WorkProjectionState_accountId_sourceType_stage_key",
  "WorkProjectionState_state_updatedAt_idx",
  "SecurityThrottle_scope_lastAttemptAt_idx",
  "SecurityThrottle_blockedUntil_idx",
  "ImportRowIssue_batchId_severity_resolved_idx",
  "ImportRowIssue_sourceType_sourceId_resolved_idx",
  "MarketplaceListingAttribute_marketplaceListingId_technicalKey_key",
  "MarketplaceListingAttribute_accountId_marketplace_technicalKey_idx",
  "MarketplaceListingAttribute_accountId_valueText_idx"
];
const sqlitePhaseIndexes = createdIndexes(phaseSql).join("\n");
const postgresPhaseIndexes = createdIndexes(postgresPhaseSql).join("\n");
for (const indexName of essentialIndexNames) {
  assert.match(sqlitePhaseIndexes, new RegExp(`:${indexName}:`), `SQLite migration retains essential index ${indexName}.`);
  assert.match(postgresPhaseIndexes, new RegExp(`:${indexName}:`), `PostgreSQL migration retains essential index ${indexName}.`);
}

for (const constraintName of [
  "WorkProjectionState_accountId_fkey",
  "MarketplaceListingAttribute_marketplaceListingId_fkey",
  "MarketplaceListingAttribute_accountId_fkey"
]) {
  assert.ok(foreignKeys(phaseSql).includes(constraintName), `SQLite migration retains essential foreign key ${constraintName}.`);
  assert.ok(foreignKeys(postgresPhaseSql).includes(constraintName), `PostgreSQL migration retains essential foreign key ${constraintName}.`);
}

for (const [field, role] of [["canPick", "PICKER"], ["canPack", "PACKER"]]) {
  assert.match(phaseSql, new RegExp(`UPDATE "User" SET "${field}" = 1 WHERE "role" = '${role}'`), `SQLite preserves ${role} permission behavior.`);
  assert.match(postgresPhaseSql, new RegExp(`UPDATE "User" SET "${field}" = TRUE WHERE "role" = '${role}'`), `PostgreSQL preserves ${role} permission behavior.`);
}

const sqliteSchema = readFileSync(resolve(root, "prisma", "schema.prisma"), "utf8");
const postgresSchema = readFileSync(resolve(root, "prisma", "schema.postgres.prisma"), "utf8");
const longGroupedStatusIndex = "WorkGroupProjection_account_stage_source_status_assignment_oldest_idx";
const postgresGroupedStatusIndex = "WorkGroupProjection_account_stage_source_status_assignment_olde";
assert.equal(longGroupedStatusIndex.length, 69, "The declared cross-provider grouped status index remains longer than PostgreSQL's identifier limit.");
assert.equal(postgresGroupedStatusIndex, longGroupedStatusIndex.slice(0, 63), "PostgreSQL schema maps the physical 63-byte truncated index name.");
const logicalSchemaSurface = schema => schema.slice(schema.indexOf("enum Role")).replace(/^\s*\/\/.*$/gm, "");
assert.equal(
  logicalSchemaSurface(postgresSchema).replace(postgresGroupedStatusIndex, longGroupedStatusIndex),
  logicalSchemaSurface(sqliteSchema),
  "SQLite and PostgreSQL Prisma schemas expose the same logical model surface apart from the documented PostgreSQL identifier truncation."
);

const phaseIndexMaps = [
  ["UploadBatch", ["fileProfileId"], "UploadBatch_fileProfileId_idx", "UploadBatch_fileProfileId_idx"],
  ["WorkGroupProjection", ["accountId", "stage", "sourceType", "status", "assignmentKey", "oldestWaitingAt"], longGroupedStatusIndex, postgresGroupedStatusIndex],
  ["WorkGroupProjection", ["accountId", "stage", "sourceType", "groupVersion"], "WorkGroupProjection_account_stage_source_version_idx", "WorkGroupProjection_account_stage_source_version_idx"],
  ["WorkGroupProjection", ["accountId", "stage", "sourceType", "assignedUserId", "oldestWaitingAt", "groupKey"], "WorkGroupProjection_assigned_pagination_idx", "WorkGroupProjection_assigned_pagination_idx"],
  ["WorkGroupProjection", ["accountId", "sellerSku", "stage"], "WorkGroupProjection_account_sku_stage_idx", "WorkGroupProjection_account_sku_stage_idx"]
];
const compact = value => value.replace(/\s+/g, "");
const allSqliteSql = entries.map(name => readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8")).join("\n");
const allPostgresSql = postgresEntries.map(name => readFileSync(join(postgresMigrationsRoot, name, "migration.sql"), "utf8")).join("\n");
for (const [model, fields, sqliteMapName, postgresMapName] of phaseIndexMaps) {
  const sqliteDeclaration = `@@index([${fields.join(", ")}], map: "${sqliteMapName}")`;
  const postgresDeclaration = `@@index([${fields.join(", ")}], map: "${postgresMapName}")`;
  assert.ok(sqliteSchema.includes(sqliteDeclaration), `SQLite schema maps ${sqliteMapName}.`);
  assert.ok(postgresSchema.includes(postgresDeclaration), `PostgreSQL schema maps physical index ${postgresMapName}.`);
  const migrationIndex = `CREATEINDEX"${sqliteMapName}"ON"${model}"("${fields.join('","')}")`;
  assert.ok(compact(allSqliteSql).includes(migrationIndex), `SQLite migration creates ${sqliteMapName}.`);
  assert.ok(compact(allPostgresSql).includes(migrationIndex), `PostgreSQL migration declares ${sqliteMapName}; PostgreSQL applies its 63-byte physical-name rule.`);
}

const fresh = open("final-workflow-fresh.db");
for (const entry of entries) apply(fresh.database, entry);
for (const table of ["WorkflowActionReceipt", "WorkRouteDecisionRejection", "WorkProjectionState", "SecurityThrottle", "MarketplaceListingAttribute"]) assert.ok(fresh.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table), `Fresh database creates ${table}.`);
fresh.database.close();

const existing = open("final-workflow-existing.db");
for (const entry of entries.filter(entry => entry <= base)) apply(existing.database, entry);
existing.database.exec(`
  INSERT INTO "Account" ("id","name","code","companyName","marketplace","active","createdAt","updatedAt") VALUES ('account','Synthetic','SYN','Synthetic','FLIPKART',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO "User" ("id","username","passwordHash","name","role","active","accountId","createdAt","updatedAt") VALUES ('owner','synthetic-owner','synthetic','Synthetic Owner','OWNER',true,'account',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO "User" ("id","username","passwordHash","name","role","active","accountId","createdAt","updatedAt") VALUES ('picker','synthetic-picker','synthetic','Synthetic Picker','PICKER',true,'account',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
`);
for(const migration of phaseMigrations)apply(existing.database,migration);
existing.database.exec("INSERT INTO WorkflowActionReceipt (id,accountId,actorUserId,requestKind,clientRequestId,requestFingerprint,sourceType,status,updatedAt) VALUES ('one','account','owner','GROUP_COMPLETE','request','fingerprint','ORDER','COMPLETED',CURRENT_TIMESTAMP)");
assert.throws(() => existing.database.exec("INSERT INTO WorkflowActionReceipt (id,accountId,actorUserId,requestKind,clientRequestId,requestFingerprint,sourceType,status,updatedAt) VALUES ('two','account','owner','GROUP_COMPLETE','request','other','ORDER','COMPLETED',CURRENT_TIMESTAMP)"), /UNIQUE/i, "Receipt replay key is unique on an upgraded database.");
assert.equal(existing.database.prepare("SELECT name FROM Account WHERE id='account'").get().name, "Synthetic", "Existing data survives the additive migration.");
assert.equal(existing.database.prepare("SELECT canPick FROM User WHERE id='picker'").get().canPick,1,"Existing Picker permission behavior survives the explicit-flag migration.");
assert.ok(existing.database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ImportJob_status_leaseExpiresAt_idx'").get(),"Lease claim index exists after upgrade.");
existing.database.close();

for (const table of ["WorkProjectionState", "SecurityThrottle", "MarketplaceListingAttribute"]) assert.match(postgresPhaseSql, new RegExp(`CREATE TABLE "${table}"`), `PostgreSQL migration includes ${table}.`);
for (const column of ["runnerId", "leaseExpiresAt", "fieldProvenanceJson", "interruptedStage", "safeDataJson", "formSchemaJson", "alreadyImportedRows"]) assert.match(postgresPhaseSql, new RegExp(`"${column}"`), `PostgreSQL migration includes ${column}.`);
assert.match(postgresPhaseSql, /ImportJob_status_leaseExpiresAt_idx/, "PostgreSQL migration includes lease claim index parity.");

// Prisma's full historical SQLite diff contains deliberate pre-Phase 7.3.6 drift:
// hand-authored CHECK/partial-index guards that Prisma cannot model and legacy short
// index names. Keep that stronger database behavior, but fail if this phase adds any
// new drift outside this exact reviewed allowlist.
const legacySqliteDriftAllowlist = new Set([
  "TABLE:ImportJob",
  "TABLE:MarketplaceListingIdentifier",
  "TABLE:MarkingAsset",
  "TABLE:MarkingAssetListingLink",
  "TABLE:ProductProcessRule",
  "INDEX:ConsignmentBatch_account_hash_idx",
  "INDEX:ConsignmentBatch_account_status_created_idx",
  "INDEX:ConsignmentBatch_account_marketplace_number_key",
  "INDEX:ConsignmentImportFile_sha_idx",
  "INDEX:ConsignmentImportFile_batch_type_idx",
  "INDEX:ConsignmentImportIssue_type_created_idx",
  "INDEX:ConsignmentImportIssue_line_idx",
  "INDEX:ConsignmentImportIssue_batch_severity_resolved_idx",
  "INDEX:ConsignmentLine_batch_completed_idx",
  "INDEX:ConsignmentLine_listing_idx",
  "INDEX:ConsignmentLine_batch_route_idx",
  "INDEX:ConsignmentLine_account_match_idx",
  "INDEX:ConsignmentLine_batch_row_key",
  "INDEX:MarkingAssetFile_asset_type_active_idx",
  "INDEX:MarkingAssetFile_asset_type_version_key",
  "INDEX:Order_sku_account_idx",
  "INDEX:Order_item_account_idx",
  "INDEX:Order_shipment_account_idx",
  "INDEX:Order_orderNo_account_idx",
  "INDEX:Order_tracking_account_idx",
  "INDEX:Order_awb_account_idx",
  "INDEX:WorkActionLog_task_request_idx",
  "INDEX:WorkActionLog_task_actor_kind_request_key",
  "INDEX:WorkActionLog_actor_created_idx",
  "INDEX:WorkActionLog_task_created_idx",
  "INDEX:WorkActionLog_account_created_idx",
  "INDEX:WorkTask_account_stage_status_completed_idx",
  "INDEX:WorkTask_line_stage_status_idx",
  "INDEX:WorkTask_account_assignee_stage_status_idx",
  "INDEX:WorkTask_account_source_stage_status_idx"
]);
const prismaCli = resolve(root, "node_modules", "prisma", "build", "index.js");
assert.ok(existsSync(prismaCli), "Prisma CLI is installed for migration drift inspection.");
const sqliteUrl = `file:${fresh.file.replaceAll("\\", "/")}`;
const drift = spawnSync(process.execPath, [prismaCli, "migrate", "diff", "--from-url", sqliteUrl, "--to-schema-datamodel", "prisma/schema.prisma"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, DATABASE_URL: sqliteUrl }
});
assert.equal(drift.status, 0, `Prisma migration drift inspection runs successfully.\n${drift.stderr}`);
const actualDrift = new Set();
for (const match of drift.stdout.matchAll(/Redefined table `([^`]+)`/g)) actualDrift.add(`TABLE:${match[1]}`);
for (const match of drift.stdout.matchAll(/Redefined index `([^`]+)`/g)) actualDrift.add(`INDEX:${match[1]}`);
for (const line of drift.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
  if (/^\[\*\] Changed the `[^`]+` table$/.test(line) || /^(?:\[\*\] )?Redefined (?:table|index) `/.test(line)) continue;
  if (/^\[[+\-\*]\]/.test(line)) actualDrift.add(`UNREVIEWED:${line}`);
}
assert.deepEqual(sorted(actualDrift), sorted(legacySqliteDriftAllowlist), "No Phase 7.3.6 schema/migration drift exists outside the reviewed legacy allowlist.");

rmSync(fresh.file, { force: true });
rmSync(existing.file, { force: true });
console.log("Final workflow migration smoke tests passed for fresh and existing-style SQLite plus static paired SQLite/PostgreSQL structure; PostgreSQL runtime was not exercised.");
