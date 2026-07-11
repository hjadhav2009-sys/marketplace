import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root=process.cwd(); const tempRoot=resolve(root,".codex-tmp"); const migrationsRoot=resolve(root,"prisma","migrations"); const latest="20260711000200_flipkart_consignment_activation"; mkdirSync(tempRoot,{recursive:true});
const entries=readdirSync(migrationsRoot,{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort();
function apply(db,name){db.exec(readFileSync(join(migrationsRoot,name,"migration.sql"),"utf8"));}
function open(name){const file=resolve(tempRoot,name);rmSync(file,{force:true});const db=new DatabaseSync(file);db.exec("PRAGMA foreign_keys=ON;");return{db,file};}
function seedBase(db){
 db.exec(`
 INSERT INTO "Account" ("id","name","code","companyName","marketplace","active","createdAt","updatedAt") VALUES ('acct_fake','Fake Account','FAKE','Test Company','FLIPKART',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "User" ("id","username","passwordHash","name","role","active","createdAt","updatedAt") VALUES ('user_fake','fake-user','fake-hash','Fake Owner','OWNER',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "MarketplaceListing" ("id","accountId","marketplace","sellerSkuId","sku","fsn","listingId","createdAt","updatedAt") VALUES ('listing_fake','acct_fake','FLIPKART','SKU-FAKE','SKU-FAKE','FSN-FAKE','LID-FAKE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "UploadBatch" ("id","accountId","filename","createdAt","updatedAt") VALUES ('upload_fake','acct_fake','fake.csv',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "Order" ("id","accountId","uploadBatchId","awb","sku","quantity","orderNumber","createdAt","updatedAt") VALUES ('order_fake','acct_fake','upload_fake','FAKE-AWB','SKU-FAKE',1,'FAKE-ORDER',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 `);
}
const fresh=open("consignment-fresh-smoke.db"); for(const name of entries)apply(fresh.db,name); for(const table of ["ConsignmentBatch","ConsignmentLine","ConsignmentImportFile","ConsignmentImportIssue"])assert.ok(fresh.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table),`Fresh migration creates ${table}`); fresh.db.close();

const existing=open("consignment-existing-smoke.db"); for(const name of entries.filter((name)=>name!==latest))apply(existing.db,name); seedBase(existing.db); apply(existing.db,latest);
existing.db.exec(`
 INSERT INTO "ConsignmentBatch" ("id","accountId","marketplace","externalConsignmentNumber","displayName","sourceFileName","sourceFileSha256","status","createdAt","updatedAt") VALUES ('batch_fake','acct_fake','FLIPKART','CN-FAKE','Fake Consignment','fake.csv','fake-sha','READY_TO_ACTIVATE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "ConsignmentLine" ("id","consignmentBatchId","accountId","rowNumber","requiredQuantity","matchStatus","createdAt","updatedAt") VALUES ('line_fake','batch_fake','acct_fake',2,5,'EXACT_SKU',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
`);
const task=(overrides="")=>`INSERT INTO "WorkTask" ("id","accountId","sourceType","orderId","consignmentLineId","stage","sequenceNumber","requiredQuantity","completedQuantity","status","createdAt","updatedAt") VALUES (${overrides});`;
assert.throws(()=>existing.db.exec(task("'bad_order','acct_fake','ORDER',NULL,NULL,'PICK',1,1,0,'READY',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP")),/constraint/i,"ORDER task without order is rejected");
assert.throws(()=>existing.db.exec(task("'bad_line','acct_fake','CONSIGNMENT',NULL,NULL,'PICK',1,1,0,'READY',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP")),/constraint/i,"CONSIGNMENT task without line is rejected");
assert.throws(()=>existing.db.exec(task("'bad_both','acct_fake','CONSIGNMENT','order_fake','line_fake','PICK',1,1,0,'READY',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP")),/constraint/i,"Task with both sources is rejected");
assert.throws(()=>existing.db.exec(task("'bad_qty','acct_fake','CONSIGNMENT',NULL,'line_fake','PICK',1,0,0,'READY',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP")),/constraint/i,"Zero required quantity is rejected");
assert.throws(()=>existing.db.exec(task("'bad_complete','acct_fake','CONSIGNMENT',NULL,'line_fake','PICK',1,5,6,'READY',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP")),/constraint/i,"Over-completion is rejected");
existing.db.exec(task("'task_pick','acct_fake','CONSIGNMENT',NULL,'line_fake','PICK',1,5,0,'READY',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP"));
assert.throws(()=>existing.db.exec(task("'task_pick_again','acct_fake','CONSIGNMENT',NULL,'line_fake','PICK',2,5,0,'LOCKED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP")),/UNIQUE/i,"Duplicate source stage is rejected");
assert.throws(()=>existing.db.exec(task("'task_same_sequence','acct_fake','CONSIGNMENT',NULL,'line_fake','PACK',1,5,0,'LOCKED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP")),/UNIQUE/i,"Duplicate source sequence is rejected");
const order=existing.db.prepare("SELECT pickStatus,packStatus FROM 'Order' WHERE id='order_fake'").get();assert.equal(order.pickStatus,"READY");assert.equal(order.packStatus,"READY");
assert.equal(existing.db.prepare("SELECT count(*) count FROM WorkTask WHERE orderId IS NOT NULL").get().count,0,"No old Order task was created");
const permissions=existing.db.prepare("SELECT canViewConsignments,canImportConsignments,canManageConsignments FROM User WHERE id='user_fake'").get();assert.deepEqual([...Object.values(permissions)],[0,0,0],"Existing users receive safe permission defaults");
existing.db.close(); rmSync(fresh.file,{force:true});rmSync(existing.file,{force:true}); console.log("Consignment migration smoke tests passed for fresh and existing-style SQLite databases.");
