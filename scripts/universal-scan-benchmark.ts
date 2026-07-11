import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), ".codex-tmp");
mkdirSync(root, { recursive: true });
const file = resolve(root, "universal-scan-benchmark.db");
rmSync(file, { force: true, maxRetries: 5, retryDelay: 100 });
const db = new DatabaseSync(file);
db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=OFF;
CREATE TABLE Identifier(id INTEGER PRIMARY KEY,accountId TEXT NOT NULL,identifierType TEXT NOT NULL,normalizedValue TEXT NOT NULL);
CREATE INDEX Identifier_type_value_account_idx ON Identifier(identifierType,normalizedValue,accountId);
CREATE TABLE ActiveOrder(id INTEGER PRIMARY KEY,accountId TEXT NOT NULL,awb TEXT,trackingId TEXT,status TEXT);
CREATE INDEX ActiveOrder_awb_account_idx ON ActiveOrder(awb,accountId);
CREATE INDEX ActiveOrder_tracking_account_idx ON ActiveOrder(trackingId,accountId);
CREATE TABLE ActiveTask(id INTEGER PRIMARY KEY,accountId TEXT NOT NULL,stage TEXT NOT NULL,status TEXT NOT NULL,code TEXT NOT NULL);
CREATE INDEX ActiveTask_code_status_stage_account_idx ON ActiveTask(code,status,stage,accountId);`);

const insert = db.prepare("INSERT INTO Identifier(accountId,identifierType,normalizedValue) VALUES (?,?,?)");
const insertOrder = db.prepare("INSERT INTO ActiveOrder(accountId,awb,trackingId,status) VALUES (?,?,?,?)");
const insertTask = db.prepare("INSERT INTO ActiveTask(accountId,stage,status,code) VALUES (?,?,?,?)");
db.exec("BEGIN");
for (let index = 0; index < 800_000; index += 1) {
  const account = `acct-${index % 20}`;
  insert.run(account, index % 5 === 0 ? "BARCODE" : "SELLER_SKU", `CODE-${String(index).padStart(7, "0")}`);
  if (index < 2_000) insertOrder.run(account, `AWB-${index}`, `TRACK-${index}`, index % 7 ? "READY" : "PACKED");
  if (index < 3_000) insertTask.run(account, ["PICK", "MARK", "PACK"][index % 3], index % 11 ? "READY" : "COMPLETED", `CODE-${String(index * 13).padStart(7, "0")}`);
}
db.exec("COMMIT");

const lookup = db.prepare(`SELECT accountId FROM Identifier WHERE identifierType=? AND normalizedValue=? AND accountId IN (${Array.from({ length: 20 }, () => "?").join(",")}) LIMIT 25`);
const accounts = Array.from({ length: 20 }, (_, index) => `acct-${index}`);
function measure(label: string, value: string) {
  const coldStart = performance.now();
  lookup.all("SELLER_SKU", value, ...accounts);
  const cold = performance.now() - coldStart;
  let total = 0;
  for (let index = 0; index < 100; index += 1) {
    const start = performance.now();
    lookup.all("SELLER_SKU", value, ...accounts);
    total += performance.now() - start;
  }
  console.log(`${label}: cold ${cold.toFixed(3)} ms, warm avg ${(total / 100).toFixed(3)} ms`);
}
measure("100,000-row target", "CODE-0099999");
measure("800,000-row target", "CODE-0799999");
measure("No result", "CODE-NOT-FOUND");
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT accountId FROM Identifier WHERE identifierType=? AND normalizedValue=? AND accountId IN (?,?) LIMIT 25").all("SELLER_SKU", "CODE-0799999", "acct-1", "acct-2") as Array<{ detail: string }>;
console.log("Query plan:", plan.map((row) => row.detail).join(" | "));
db.close();
rmSync(file, { force: true, maxRetries: 5, retryDelay: 100 });
