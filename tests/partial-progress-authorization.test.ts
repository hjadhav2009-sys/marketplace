import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { setGroupedProgress } from "../src/lib/workflow/grouped-progress";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";

const{db,cleanup}=createTempWorkflowDb("partial-progress-authorization");
try{
 await db.account.createMany({data:[{id:"a",name:"A",code:"A",marketplace:"FLIPKART"},{id:"b",name:"B",code:"B",marketplace:"FLIPKART"}]});await db.user.create({data:{id:"w",username:"auth-worker",passwordHash:"x",name:"Worker",role:"PICKER",accountId:"a",canPick:true}});await db.uploadBatch.create({data:{id:"batch",accountId:"a",fileName:"synthetic.csv"}});
 await db.order.create({data:{id:"o",accountId:"a",batchId:"batch",marketplace:"FLIPKART",awb:"A",sku:"SKU",qty:2,orderNo:"O",orderItemId:"ITEM"}});await db.workTask.create({data:{id:"t",accountId:"a",sourceType:"ORDER",orderId:"o",stage:"PICK",sequenceNumber:1,requiredQuantity:2,status:"READY",workCardSnapshotJson:JSON.stringify({sellerSku:"SKU"})}});
 await rebuildWorkGroupProjection({accountId:"a",sourceType:"ORDER",stage:"PICK"},db);const card=(await getGroupedWork({actorUserId:"w",accountId:"a",stage:"PICK",sourceType:"ORDER"},db)).cards[0],request={actorUserId:"w",selectedAccountId:"a",sourceType:"ORDER" as const,stage:"PICK" as const,groupKey:card.groupKey,expectedGroupVersion:card.groupVersion,targetCompletedQuantity:1,clientRequestId:"known-request"};await setGroupedProgress(request,db);await db.user.update({where:{id:"w"},data:{accountId:"b"}});await assert.rejects(()=>setGroupedProgress(request,db),/not assigned/);assert.equal((await db.workTask.findUniqueOrThrow({where:{id:"t"}})).completedQuantity,1);
}finally{await cleanup();}
console.log("Partial progress authorization-before-replay tests passed.");
