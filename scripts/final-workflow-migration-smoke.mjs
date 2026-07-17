import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const temporaryRoot = resolve(root, ".codex-tmp");
const migrationsRoot = resolve(root, "prisma", "migrations");
const base = "20260717000400_final_workflow_correctness";
const latest = "20260718000400_security_throttle";
mkdirSync(temporaryRoot, { recursive: true });
const entries = readdirSync(migrationsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
assert.equal(entries.at(-1), latest, "Phase 7.3.4 security migration must remain the latest additive SQLite migration.");
const phaseMigrations=entries.filter(name=>name>base);
const apply = (database, name) => database.exec(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
const open = (name) => { const file = resolve(temporaryRoot, name); rmSync(file, { force: true }); const database = new DatabaseSync(file); database.exec("PRAGMA foreign_keys=ON;"); return { database, file }; };

const fresh = open("final-workflow-fresh.db");
for (const entry of entries) apply(fresh.database, entry);
for (const table of ["WorkflowActionReceipt", "WorkRouteDecisionRejection", "WorkProjectionState", "SecurityThrottle"]) assert.ok(fresh.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table), `Fresh database creates ${table}.`);
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

const postgresSql = phaseMigrations.map(name=>readFileSync(resolve(root,"prisma","migrations-postgres",name,"migration.sql"),"utf8")).join("\n");
for (const table of ["WorkProjectionState", "SecurityThrottle"]) assert.match(postgresSql, new RegExp(`CREATE TABLE "${table}"`), `PostgreSQL migration includes ${table}.`);
for(const column of ["runnerId","leaseExpiresAt","fieldProvenanceJson","interruptedStage"])assert.match(postgresSql,new RegExp(`"${column}"`),`PostgreSQL migration includes ${column}.`);
assert.match(postgresSql,/ImportJob_status_leaseExpiresAt_idx/,"PostgreSQL migration includes lease claim index parity.");

rmSync(fresh.file, { force: true });
rmSync(existing.file, { force: true });
console.log("Final workflow migration smoke tests passed for fresh SQLite, existing-style SQLite, and PostgreSQL SQL parity.");
