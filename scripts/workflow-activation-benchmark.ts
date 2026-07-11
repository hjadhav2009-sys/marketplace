import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { activateConsignmentBatch } from "../src/lib/workflow/task-store";

const tempRoot=resolve(process.cwd(),".codex-tmp");mkdirSync(tempRoot,{recursive:true});const file=resolve(tempRoot,"workflow-activation-benchmark.db");rmSync(file,{force:true});
const raw=new DatabaseSync(file);raw.exec("PRAGMA foreign_keys=ON;");const migrations=resolve(process.cwd(),"prisma","migrations");for(const name of readdirSync(migrations,{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort())raw.exec(readFileSync(join(migrations,name,"migration.sql"),"utf8"));raw.close();
const db=new PrismaClient({datasourceUrl:`file:${file.replace(/\\/g,"/")}`});
try{
 await db.account.create({data:{id:"bench-account",name:"Benchmark",code:"BENCH",companyName:"Fake Company",marketplace:"FLIPKART",active:true}});
 await db.user.create({data:{id:"bench-owner",username:"bench-owner",passwordHash:"fake",name:"Benchmark Owner",role:"OWNER",active:true,accountId:"bench-account"}});
 await db.marketplaceListing.create({data:{id:"bench-listing",accountId:"bench-account",marketplace:"FLIPKART",sellerSkuId:"BENCH-SKU",sku:"BENCH-SKU",productTitle:"Fake benchmark product"}});
 await db.productProcessRule.create({data:{id:"bench-rule",accountId:"bench-account",marketplaceListingId:"bench-listing",route:"PICK_PACK",active:true}});
 for(const size of [100,1000,10000]){
  const batchId=`bench-${size}`;await db.consignmentBatch.create({data:{id:batchId,accountId:"bench-account",marketplace:"FLIPKART",externalConsignmentNumber:`BENCH-${size}`,displayName:`Fake ${size} line benchmark`,status:"READY_TO_ACTIVATE",sourceFileName:"fake.csv",sourceFileSha256:`fake-${size}`,totalSourceRows:size,totalValidLines:size,totalRequiredQuantity:size,matchedLines:size,readyMadeLines:size}});
  for(let offset=0;offset<size;offset+=1000)await db.consignmentLine.createMany({data:Array.from({length:Math.min(1000,size-offset)},(_,index)=>({id:`${batchId}-line-${offset+index}`,consignmentBatchId:batchId,accountId:"bench-account",rowNumber:offset+index+2,requiredQuantity:1,matchStatus:"EXACT_SKU" as const,marketplaceListingId:"bench-listing",processRoute:"PICK_PACK" as const,processRuleId:"bench-rule"}))});
  const started=performance.now();const result=await activateConsignmentBatch({batchId,accountId:"bench-account",actorUserId:"bench-owner"},db);const elapsed=performance.now()-started;
  const taskCount=await db.workTask.count({where:{consignmentLine:{consignmentBatchId:batchId}}});if(taskCount!==size*2||result.taskCount!==taskCount)throw new Error(`Task count mismatch for ${size} lines.`);
  console.log(`${size} lines: ${elapsed.toFixed(0)} ms, ${taskCount} tasks`);
 }
}finally{await db.$disconnect();rmSync(file,{force:true});}
