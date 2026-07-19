import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { getGroupedWork,getGroupedWorkDetails } from "../src/lib/workflow/grouped-work";
import { setGroupedProgress } from "../src/lib/workflow/grouped-progress";
import { completeGroupedStage } from "../src/lib/workflow/grouped-transition";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";

const{db,cleanup}=createTempWorkflowDb("grouped-details-progress");
try{
 await db.account.create({data:{id:"a",name:"Account",code:"A",marketplace:"FLIPKART"}});await db.user.create({data:{id:"w",username:"partial-worker",passwordHash:"x",name:"Worker",role:"PICKER",accountId:"a",canPick:true}});await db.uploadBatch.create({data:{id:"b",accountId:"a",fileName:"synthetic.csv"}});
 await db.order.create({data:{id:"o",accountId:"a",batchId:"b",marketplace:"FLIPKART",awb:"AWB-ONE",trackingId:"TRACK-ONE",sku:"SKU",qty:10,orderNo:"ORDER-ONE",orderItemId:"ITEM-ONE",shipmentId:"SHIP-ONE"}});
 await db.workTask.create({data:{id:"t",accountId:"a",sourceType:"ORDER",orderId:"o",stage:"PICK",sequenceNumber:1,requiredQuantity:10,status:"READY",routeSnapshotJson:JSON.stringify(createWorkRouteSnapshot({processRoute:"PICK_PACK",currentStage:"PICK"})),workCardSnapshotJson:JSON.stringify({sellerSku:"SKU",productTitle:"Exact order product"})}});
 await rebuildWorkGroupProjection({accountId:"a",sourceType:"ORDER",stage:"PICK"},db);const card=(await getGroupedWork({actorUserId:"w",accountId:"a",stage:"PICK",sourceType:"ORDER",includeMemberIds:true},db)).cards[0],details=await getGroupedWorkDetails({actorUserId:"w",accountId:"a",stage:"PICK",sourceType:"ORDER",groupKey:card.groupKey},db);assert.equal(details.tasks.length,1,"Exact Order Details resolves one underlying record");assert.equal(card.requiredQuantity,10);
 await setGroupedProgress({actorUserId:"w",selectedAccountId:"a",sourceType:"ORDER",stage:"PICK",groupKey:card.groupKey,expectedGroupVersion:card.groupVersion,targetCompletedQuantity:4,clientRequestId:"partial-4"},db);const updated=(await getGroupedWork({actorUserId:"w",accountId:"a",stage:"PICK",sourceType:"ORDER",includeMemberIds:true},db)).cards[0];assert.equal(updated.completedQuantity,4);assert.equal(updated.pendingQuantity,6);const task=await db.workTask.findUniqueOrThrow({where:{id:"t"}});assert.equal(task.completedQuantity,4);assert.equal(task.status,"IN_PROGRESS");
 await assert.rejects(()=>setGroupedProgress({actorUserId:"w",selectedAccountId:"a",sourceType:"ORDER",stage:"PICK",groupKey:updated.groupKey,expectedGroupVersion:card.groupVersion,targetCompletedQuantity:5,clientRequestId:"stale"},db),/Work changed/);assert.equal((await db.workTask.findUniqueOrThrow({where:{id:"t"}})).completedQuantity,4);
 await completeGroupedStage({actorUserId:"w",selectedAccountId:"a",sourceType:"ORDER",stage:"PICK",groupKey:updated.groupKey,expectedGroupVersion:updated.groupVersion,useRecommendedNextStage:true,clientRequestId:"complete-rest"},db);assert.equal(await db.workTask.count({where:{orderId:"o",stage:"PACK",status:"READY"}}),1);assert.equal(await db.workTask.count({where:{orderId:"o"}}),2);
}finally{await cleanup();}
console.log("Exact Order Details and partial progress tests passed.");
