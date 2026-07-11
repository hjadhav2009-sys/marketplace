import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync,readFileSync,readdirSync,rmSync } from "node:fs";
import { join,resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { claimWorkTask, completeWorkTask, incrementWorkTaskProgress, reassignWorkTask, reportWorkTaskProblem, resolveWorkTaskProblem, setWorkTaskProgress } from "../src/lib/workflow/task-store";
import { getWorkerTaskQueue } from "../src/lib/workflow/queues";

const tmp=resolve(process.cwd(),".codex-tmp");mkdirSync(tmp,{recursive:true});const file=resolve(tmp,"workflow-worker.db");rmSync(file,{force:true});const raw=new DatabaseSync(file);raw.exec("PRAGMA foreign_keys=ON;");const root=resolve(process.cwd(),"prisma","migrations");for(const name of readdirSync(root,{withFileTypes:true}).filter((e)=>e.isDirectory()).map((e)=>e.name).sort())raw.exec(readFileSync(join(root,name,"migration.sql"),"utf8"));raw.close();const db=new PrismaClient({datasourceUrl:`file:${file.replace(/\\/g,"/")}`});
try{
 await db.account.createMany({data:[{id:"acct",name:"Fake",code:"FAKE",companyName:"Fake Co",marketplace:"FLIPKART",active:true},{id:"other-acct",name:"Other",code:"OTHER",companyName:"Fake Co",marketplace:"FLIPKART",active:true}]});
 await db.user.createMany({data:[
  {id:"owner",username:"owner",passwordHash:"fake",name:"Owner",role:"OWNER",active:true,accountId:"acct"},
  {id:"picker1",username:"picker1",passwordHash:"fake",name:"Picker One",role:"PICKER",active:true,accountId:"acct",canPick:true},
  {id:"picker2",username:"picker2",passwordHash:"fake",name:"Picker Two",role:"PICKER",active:true,accountId:"acct",canPick:true},
  {id:"packer",username:"packer",passwordHash:"fake",name:"Packer",role:"PACKER",active:true,accountId:"acct",canPack:true},
  {id:"marker",username:"marker",passwordHash:"fake",name:"Marker",role:"PACKER",active:true,accountId:"acct",canMark:true},
  {id:"manager",username:"manager",passwordHash:"fake",name:"Manager",role:"PACKER",active:true,accountId:"acct",canManageConsignments:true,canViewAllWork:true},
  {id:"inactive",username:"inactive",passwordHash:"fake",name:"Inactive",role:"PICKER",active:false,accountId:"acct",canPick:true},
  {id:"unassigned",username:"unassigned",passwordHash:"fake",name:"Unassigned",role:"PICKER",active:true,accountId:"other-acct",canPick:true}
  ,{id:"no-report",username:"no-report",passwordHash:"fake",name:"No Report",role:"PICKER",active:true,accountId:"acct",canPick:true,canReportProblem:false}
 ]});
 await db.marketplaceListing.create({data:{id:"listing",accountId:"acct",marketplace:"FLIPKART",sellerSkuId:"SKU-1",sku:"INTERNAL-1",fsn:"FSN-1",listingId:"LID-1",productTitle:"Fake Product"}});
 await db.marketplaceListingIdentifier.createMany({data:[["SELLER_SKU","SKU-1"],["FSN","FSN-1"],["LISTING_ID","LID-1"]].map(([identifierType,value])=>({accountId:"acct",marketplaceListingId:"listing",marketplace:"FLIPKART",identifierType:identifierType as "SELLER_SKU"|"FSN"|"LISTING_ID",rawValue:value,normalizedValue:value}))});
 await db.consignmentBatch.create({data:{id:"batch",accountId:"acct",marketplace:"FLIPKART",externalConsignmentNumber:"CN-1",displayName:"Fake Batch",status:"ACTIVE",sourceFileName:"fake.csv",sourceFileSha256:"sha"}});
 await db.consignmentLine.create({data:{id:"line",consignmentBatchId:"batch",accountId:"acct",rowNumber:2,requiredQuantity:10,matchStatus:"EXACT_SKU",marketplaceListingId:"listing",processRoute:"PICK_PACK",activated:true,productTitleSnapshot:"Fake Product",sellerSkuSnapshot:"SKU-1",fsnSnapshot:"FSN-1",listingIdSnapshot:"LID-1"}});
 await db.workTask.createMany({data:[{id:"pick",accountId:"acct",sourceType:"CONSIGNMENT",consignmentLineId:"line",stage:"PICK",sequenceNumber:1,requiredQuantity:10,status:"READY"},{id:"pack",accountId:"acct",sourceType:"CONSIGNMENT",consignmentLineId:"line",stage:"PACK",sequenceNumber:2,requiredQuantity:10,status:"LOCKED"}]});
 await assert.rejects(()=>claimWorkTask({taskId:"pick",accountId:"acct",actorUserId:"inactive"},db),/unavailable/i);
 await assert.rejects(()=>claimWorkTask({taskId:"pick",accountId:"acct",actorUserId:"unassigned"},db),/assigned/i);
 await assert.rejects(()=>claimWorkTask({taskId:"pick",accountId:"acct",actorUserId:"packer"},db),/permission/i);
 const claims=await Promise.allSettled([claimWorkTask({taskId:"pick",accountId:"acct",actorUserId:"picker1",clientRequestId:"claim-a"},db),claimWorkTask({taskId:"pick",accountId:"acct",actorUserId:"picker2",clientRequestId:"claim-b"},db)]);assert.equal(claims.filter((result)=>result.status==="fulfilled").length,1,"One concurrent claimant succeeds");const claimed=await db.workTask.findUniqueOrThrow({where:{id:"pick"}});assert.ok(["picker1","picker2"].includes(claimed.assignedUserId??""));const worker=claimed.assignedUserId!;
 const other=worker==="picker1"?"picker2":"picker1";await assert.rejects(()=>incrementWorkTaskProgress({taskId:"pick",accountId:"acct",actorUserId:other,expectedQuantity:0,increment:1},db),/taken/i);
 let result=await incrementWorkTaskProgress({taskId:"pick",accountId:"acct",actorUserId:worker,expectedQuantity:0,increment:1,clientRequestId:"inc-1"},db);assert.equal(result.completedQuantity,1);
 result=await incrementWorkTaskProgress({taskId:"pick",accountId:"acct",actorUserId:worker,expectedQuantity:1,increment:5,clientRequestId:"inc-5"},db);assert.equal(result.completedQuantity,6);
 await assert.rejects(()=>incrementWorkTaskProgress({taskId:"pick",accountId:"acct",actorUserId:worker,expectedQuantity:6,increment:5},db),/range/i);
 await assert.rejects(()=>setWorkTaskProgress({taskId:"pick",accountId:"acct",actorUserId:worker,expectedQuantity:5,targetQuantity:7},db),/refresh/i);
 const duplicate=await incrementWorkTaskProgress({taskId:"pick",accountId:"acct",actorUserId:worker,expectedQuantity:0,increment:1,clientRequestId:"inc-1"},db);assert.equal(duplicate.completedQuantity,1);assert.equal(duplicate.idempotent,true);
 await completeWorkTask({taskId:"pick",accountId:"acct",actorUserId:worker,expectedQuantity:6,clientRequestId:"complete-pick"},db);assert.equal((await db.workTask.findUniqueOrThrow({where:{id:"pack"}})).status,"READY");
 await assert.rejects(()=>incrementWorkTaskProgress({taskId:"pick",accountId:"acct",actorUserId:worker,expectedQuantity:10,increment:1},db),/current status|range/i);
 await reportWorkTaskProblem({taskId:"pack",accountId:"acct",actorUserId:"packer",expectedQuantity:0,reason:"PACKING_BLOCKED",note:"Fake blocked",clientRequestId:"problem-1"},db);let problem=await db.workTask.findUniqueOrThrow({where:{id:"pack"}});assert.equal(problem.status,"PROBLEM");assert.equal(problem.completedQuantity,0);assert.equal((await db.consignmentBatch.findUniqueOrThrow({where:{id:"batch"}})).status,"PROBLEM");
 await assert.rejects(()=>incrementWorkTaskProgress({taskId:"pack",accountId:"acct",actorUserId:"packer",expectedQuantity:0,increment:1},db),/current status/i);
 await resolveWorkTaskProblem({taskId:"pack",accountId:"acct",actorUserId:"manager",resolutionNote:"Fake issue resolved",clientRequestId:"resolve-1"},db);problem=await db.workTask.findUniqueOrThrow({where:{id:"pack"}});assert.equal(problem.status,"READY");assert.equal(problem.problemReason,"PACKING_BLOCKED","Problem history remains");
 await completeWorkTask({taskId:"pack",accountId:"acct",actorUserId:"packer",expectedQuantity:0,clientRequestId:"complete-pack"},db);assert.ok((await db.consignmentLine.findUniqueOrThrow({where:{id:"line"}})).completedAt);assert.equal((await db.consignmentBatch.findUniqueOrThrow({where:{id:"batch"}})).status,"COMPLETED");
 const active=await getWorkerTaskQueue({actorUserId:"packer",accountId:"acct",stage:"PACK",search:"SKU-1"},db);assert.equal(active.tasks.length,0,"Completed task is excluded from active exact search");const history=await getWorkerTaskQueue({actorUserId:"packer",accountId:"acct",stage:"PACK",search:"FSN-1",status:"completed"},db);assert.equal(history.tasks.length,1);
 const exactListing=await getWorkerTaskQueue({actorUserId:"owner",accountId:"acct",stage:"PACK",search:"LID-1",status:"completed"},db);assert.equal(exactListing.tasks.length,1);
 await db.consignmentBatch.create({data:{id:"batch-mark",accountId:"acct",marketplace:"FLIPKART",externalConsignmentNumber:"CN-2",displayName:"Marked Batch",status:"ACTIVE",sourceFileName:"fake-mark.csv",sourceFileSha256:"sha-mark"}});
 await db.consignmentLine.create({data:{id:"line-mark",consignmentBatchId:"batch-mark",accountId:"acct",rowNumber:2,requiredQuantity:2,matchStatus:"OWNER_SELECTED",marketplaceListingId:"listing",processRoute:"PICK_MARK_PACK",activated:true,productTitleSnapshot:"Fake Product",sellerSkuSnapshot:"SKU-1",fsnSnapshot:"FSN-1",listingIdSnapshot:"LID-1"}});
 await db.workTask.createMany({data:[{id:"pick-mark",accountId:"acct",sourceType:"CONSIGNMENT",consignmentLineId:"line-mark",stage:"PICK",sequenceNumber:1,requiredQuantity:2,status:"READY"},{id:"mark",accountId:"acct",sourceType:"CONSIGNMENT",consignmentLineId:"line-mark",stage:"MARK",sequenceNumber:2,requiredQuantity:2,status:"LOCKED"},{id:"pack-mark",accountId:"acct",sourceType:"CONSIGNMENT",consignmentLineId:"line-mark",stage:"PACK",sequenceNumber:3,requiredQuantity:2,status:"LOCKED"}]});
 await assert.rejects(()=>reassignWorkTask({taskId:"mark",accountId:"acct",actorUserId:"owner",assignedUserId:"picker1"},db),/stage permission/i);await reassignWorkTask({taskId:"mark",accountId:"acct",actorUserId:"owner",assignedUserId:"marker"},db);
 await assert.rejects(()=>reportWorkTaskProblem({taskId:"pick-mark",accountId:"acct",actorUserId:"no-report",expectedQuantity:0,reason:"OTHER"},db),/reporting permission/i);
 await completeWorkTask({taskId:"pick-mark",accountId:"acct",actorUserId:"owner",expectedQuantity:0,clientRequestId:"owner-pick"},db);const readyMark=await db.workTask.findUniqueOrThrow({where:{id:"mark"}});assert.equal(readyMark.status,"READY");assert.equal(readyMark.assignedUserId,"marker","Explicit future-stage assignment survives unlock");assert.equal((await db.workTask.findUniqueOrThrow({where:{id:"pack-mark"}})).status,"LOCKED");
 await assert.rejects(()=>claimWorkTask({taskId:"mark",accountId:"acct",actorUserId:"packer"},db),/permission/i);await completeWorkTask({taskId:"mark",accountId:"acct",actorUserId:"marker",expectedQuantity:0,clientRequestId:"mark-complete"},db);assert.equal((await db.workTask.findUniqueOrThrow({where:{id:"pack-mark"}})).status,"READY");
 await completeWorkTask({taskId:"pack-mark",accountId:"acct",actorUserId:"packer",expectedQuantity:0,clientRequestId:"pack-mark-complete"},db);assert.equal((await db.consignmentBatch.findUniqueOrThrow({where:{id:"batch-mark"}})).status,"COMPLETED");
 const multiple=await getWorkerTaskQueue({actorUserId:"owner",accountId:"acct",stage:"PACK",search:"SKU-1",status:"completed"},db);assert.equal(multiple.tasks.length,2,"Exact SKU can return multiple completed candidates without mutating either task");
 assert.equal(await db.workActionLog.count({where:{taskId:"pick",clientRequestId:"inc-1"}}),1);
}finally{await db.$disconnect();rmSync(file,{force:true});}
console.log("Workflow worker transaction and authorization tests passed.");
