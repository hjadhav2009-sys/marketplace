import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { incrementWorkTaskProgress } from "../src/lib/workflow/task-store";

const root=resolve(process.cwd(),".codex-tmp");mkdirSync(root,{recursive:true});const file=resolve(root,"phase7-concurrency.db");rmSync(file,{force:true,maxRetries:5,retryDelay:100});const sqlite=new DatabaseSync(file);sqlite.exec("PRAGMA foreign_keys=ON;");for(const name of readdirSync(resolve(process.cwd(),"prisma/migrations"),{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort())sqlite.exec(readFileSync(join(process.cwd(),"prisma/migrations",name,"migration.sql"),"utf8"));sqlite.close();const db=new PrismaClient({datasourceUrl:`file:${file.replace(/\\/g,"/")}`});
try{
 await db.account.create({data:{id:"p7-account",name:"Phase 7 Concurrency",code:"P7-CONC",companyName:"Synthetic QA",marketplace:"FLIPKART",active:true}});
 await db.user.create({data:{id:"p7-picker",username:"p7-concurrency-picker",passwordHash:"fake",name:"Synthetic Picker",role:"PICKER",active:true,accountId:"p7-account",canPick:true}});
 await db.marketplaceListing.create({data:{id:"p7-listing",accountId:"p7-account",marketplace:"FLIPKART",sellerSkuId:"P7-SKU",sku:"P7-SKU"}});
 for(const level of [2,5,10,20]){
  const batchId=`p7-batch-${level}`,lineId=`p7-line-${level}`,taskId=`p7-task-${level}`;
  await db.consignmentBatch.create({data:{id:batchId,accountId:"p7-account",marketplace:"FLIPKART",externalConsignmentNumber:`P7-CN-${level}`,displayName:"Synthetic concurrency",status:"ACTIVE",sourceFileName:"synthetic.csv",sourceFileSha256:`sha-${level}`}});
  await db.consignmentLine.create({data:{id:lineId,consignmentBatchId:batchId,accountId:"p7-account",rowNumber:1,requiredQuantity:10,matchStatus:"EXACT_SKU",marketplaceListingId:"p7-listing",processRoute:"PICK_PACK",activated:true,sellerSkuSnapshot:"P7-SKU"}});
  await db.workTask.create({data:{id:taskId,accountId:"p7-account",sourceType:"CONSIGNMENT",consignmentLineId:lineId,stage:"PICK",sequenceNumber:1,requiredQuantity:10,status:"READY",assignedUserId:"p7-picker"}});
  const results=await Promise.allSettled(Array.from({length:level},async(_,index)=>{if(index>0)await new Promise((resolveDelay)=>setTimeout(resolveDelay,50));return incrementWorkTaskProgress({taskId,accountId:"p7-account",actorUserId:"p7-picker",expectedQuantity:0,increment:1,clientRequestId:`same-${level}`},db);}));
  assert.ok(results.some((result)=>result.status==="fulfilled"),`Concurrency ${level} has a successful mutation/replay`);
  for(const result of results)if(result.status==="rejected")assert.doesNotMatch(String(result.reason),/Prisma|P20\d\d|database is locked/i,"Raw database errors never reach workers");
  assert.equal((await db.workTask.findUniqueOrThrow({where:{id:taskId}})).completedQuantity,1,`Concurrency ${level} mutates once`);
  assert.equal(await db.workActionLog.count({where:{taskId,clientRequestId:`same-${level}`}}),1,`Concurrency ${level} records one action`);
 }
}finally{await db.$disconnect();rmSync(file,{force:true,maxRetries:5,retryDelay:100});}
console.log("Phase 7 controlled concurrency tests passed at levels 2, 5, 10, and 20.");
