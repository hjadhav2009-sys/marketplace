import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { completeSelectedGroupMembers,setGroupedProgress } from "../src/lib/workflow/grouped-progress";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";

const{db,cleanup}=createTempWorkflowDb("grouped-member-allocation");
try{
 await db.account.create({data:{id:"a",name:"A",code:"A",marketplace:"FLIPKART"}});await db.user.create({data:{id:"w",username:"allocation-worker",passwordHash:"x",name:"Worker",role:"PICKER",accountId:"a",canPick:true}});await db.uploadBatch.create({data:{id:"b",accountId:"a",fileName:"synthetic.csv"}});const route=JSON.stringify(createWorkRouteSnapshot({processRoute:"PICK_PACK",currentStage:"PICK"}));
 for(let index=0;index<3;index++){await db.order.create({data:{id:`o${index}`,accountId:"a",batchId:"b",marketplace:"FLIPKART",trackingId:`T${index}`,awb:`A${index}`,sku:"SAME-SKU",qty:index+3,orderNo:`O${index}`,orderItemId:`ITEM-${index}`}});await db.workTask.create({data:{id:`t${index}`,accountId:"a",sourceType:"ORDER",orderId:`o${index}`,stage:"PICK",sequenceNumber:1,requiredQuantity:index+3,status:"READY",routeSnapshotJson:route,workCardSnapshotJson:JSON.stringify({sellerSku:"SAME-SKU",productTitle:"Varied quantities"})}});}
 await rebuildWorkGroupProjection({accountId:"a",sourceType:"ORDER",stage:"PICK"},db);let cards=(await getGroupedWork({actorUserId:"w",accountId:"a",stage:"PICK",sourceType:"ORDER",includeMemberIds:true},db)).cards;assert.equal(cards.length,3,"Same SKU Orders remain three exact cards");assert.deepEqual(cards.map(card=>card.requiredQuantity).sort((a,b)=>a-b),[3,4,5]);
 const first=cards.find(card=>card.memberTaskIds.includes("t0"))!,other=cards.find(card=>card.memberTaskIds.includes("t1"))!;await setGroupedProgress({actorUserId:"w",selectedAccountId:"a",sourceType:"ORDER",stage:"PICK",groupKey:first.groupKey,expectedGroupVersion:first.groupVersion,targetCompletedQuantity:2,clientRequestId:"first-partial"},db);assert.equal((await db.workTask.findUniqueOrThrow({where:{id:"t0"}})).completedQuantity,2);assert.equal((await db.workTask.findUniqueOrThrow({where:{id:"t1"}})).completedQuantity,0,"Another exact Order is untouched");
 cards=(await getGroupedWork({actorUserId:"w",accountId:"a",stage:"PICK",sourceType:"ORDER",includeMemberIds:true},db)).cards;const refreshedFirst=cards.find(card=>card.memberTaskIds.includes("t0"))!;await assert.rejects(()=>completeSelectedGroupMembers({actorUserId:"w",selectedAccountId:"a",sourceType:"ORDER",stage:"PICK",groupKey:refreshedFirst.groupKey,expectedGroupVersion:refreshedFirst.groupVersion,selectedTaskIds:["t1"],useRecommendedNextStage:true,clientRequestId:"cross-exact-card"},db),/not eligible/);assert.equal((await db.workGroupProjection.findUniqueOrThrow({where:{groupKey:other.groupKey}})).groupVersion,other.groupVersion);
}finally{await cleanup();}
console.log("Exact-card varied quantity and isolation tests passed.");
