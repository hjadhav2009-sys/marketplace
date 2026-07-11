import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync,readFileSync,readdirSync,rmSync } from "node:fs";
import { join,resolve } from "node:path";
const root=process.cwd(),tmp=resolve(root,".codex-tmp"),migrations=resolve(root,"prisma","migrations"),latest="20260711000400_workflow_request_isolation";mkdirSync(tmp,{recursive:true});const entries=readdirSync(migrations,{withFileTypes:true}).filter((e)=>e.isDirectory()).map((e)=>e.name).sort();
function apply(db,name){db.exec(readFileSync(join(migrations,name,"migration.sql"),"utf8"));}function open(name){const file=resolve(tmp,name);rmSync(file,{force:true});const db=new DatabaseSync(file);db.exec("PRAGMA foreign_keys=ON;");return{db,file};}
const fresh=open("workflow-fresh.db");for(const name of entries)apply(fresh.db,name);assert.ok(fresh.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkActionLog'").get());fresh.db.close();
const old=open("workflow-existing.db");for(const name of entries.filter((name)=>name!==latest))apply(old.db,name);old.db.exec(`
INSERT INTO "Account" ("id","name","code","companyName","marketplace","active","createdAt","updatedAt") VALUES ('acct','Fake','FAKE','Fake Co','FLIPKART',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "User" ("id","username","passwordHash","name","role","active","createdAt","updatedAt") VALUES ('owner','fake-owner','fake','Fake Owner','OWNER',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "ConsignmentBatch" ("id","accountId","marketplace","externalConsignmentNumber","displayName","status","sourceFileName","sourceFileSha256","sourceUploadRelativePath","createdAt","updatedAt") VALUES ('batch','acct','FLIPKART','CN-1','Fake Batch','ACTIVE','fake.csv','sha','batch/source/fake.csv',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "ConsignmentLine" ("id","consignmentBatchId","accountId","rowNumber","requiredQuantity","matchStatus","activated","createdAt","updatedAt") VALUES ('line','batch','acct',2,5,'OWNER_SELECTED',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "WorkTask" ("id","accountId","sourceType","consignmentLineId","stage","sequenceNumber","requiredQuantity","completedQuantity","status","createdAt","updatedAt") VALUES ('pick','acct','CONSIGNMENT','line','PICK',1,5,0,'READY',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO WorkActionLog (id,accountId,taskId,actorUserId,action,clientRequestId,createdAt) VALUES ('log1','acct','pick','owner','TASK_CLAIMED','request-1',CURRENT_TIMESTAMP);
`);apply(old.db,latest);
assert.throws(()=>old.db.exec("INSERT INTO WorkTask (id,accountId,sourceType,consignmentLineId,stage,sequenceNumber,requiredQuantity,completedQuantity,status,createdAt,updatedAt) VALUES ('bad-complete','acct','CONSIGNMENT','line','PACK',2,5,5,'COMPLETED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"),/constraint/i);
old.db.exec("INSERT INTO WorkTask (id,accountId,sourceType,consignmentLineId,stage,sequenceNumber,requiredQuantity,completedQuantity,status,problemReason,createdAt,updatedAt) VALUES ('problem','acct','CONSIGNMENT','line','PACK',2,5,1,'PROBLEM','BLOCKED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
assert.throws(()=>old.db.exec("UPDATE WorkTask SET problemReason=NULL WHERE id='problem'"),/constraint/i);
assert.equal(old.db.prepare("SELECT requestKind FROM WorkActionLog WHERE id='log1'").get().requestKind,"CLAIM","Existing request logs are backfilled");
assert.throws(()=>old.db.exec("INSERT INTO WorkActionLog (id,accountId,taskId,actorUserId,action,requestKind,clientRequestId,createdAt) VALUES ('log2','acct','pick','owner','TASK_CLAIMED','CLAIM','request-1',CURRENT_TIMESTAMP)"),/UNIQUE/i);
assert.equal(old.db.prepare("SELECT status FROM WorkTask WHERE id='pick'").get().status,"READY","Existing task survives migration");
old.db.close();rmSync(fresh.file,{force:true});rmSync(old.file,{force:true});console.log("Workflow migration smoke tests passed.");
