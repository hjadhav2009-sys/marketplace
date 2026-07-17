import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { createImmutableRouteProvenance } from "../src/lib/workflow/route-provenance";
import { canonicalRouteFingerprint } from "../src/lib/workflow/work-group-projection";
import { aggregateWorkflowPrerequisites,deriveOrderWorkflowPrerequisites } from "../src/lib/workflow/workflow-prerequisites";
import { applyFallbackVersion,applyLiveBootstrap,applyLiveEvent,beginLiveReconnect,initialLiveWorkClientState } from "../src/lib/workflow/live-work-client-state";
import { beginWorkflowActionReceipt,completeWorkflowActionReceipt } from "../src/lib/workflow/workflow-action-receipt";
import { resolveRouteStageMetadata } from "../src/lib/workflow/route-selection";

const explicit=createImmutableRouteProvenance({route:"PICK_PACK",rule:{id:"rule",route:"PICK_PACK",updatedAt:new Date(1)}}),fallback=createImmutableRouteProvenance({route:"PICK_PACK",rule:null});
assert.notEqual(canonicalRouteFingerprint(null,null,JSON.stringify(explicit),"PICK"),canonicalRouteFingerprint(null,null,JSON.stringify(fallback),"PICK"),"Explicit and fallback provenance never group together.");
const volatileA={...explicit,routedByUserId:"a",routedAt:"2026-01-01",requestId:"one"},volatileB={...explicit,routedByUserId:"b",routedAt:"2026-02-01",requestId:"two"};
assert.equal(canonicalRouteFingerprint(null,null,JSON.stringify(volatileA),"PICK"),canonicalRouteFingerprint(null,null,JSON.stringify(volatileB),"PICK"),"Actor and timestamp noise is excluded.");

const route=JSON.stringify(createWorkRouteSnapshot({processRoute:"PICK_MARK_PACK",currentStage:"PACK"}));
const missingMark=deriveOrderWorkflowPrerequisites({id:"one",pickStatus:"PICKED",packStatus:"READY",status:"READY"},[{id:"pick",stage:"PICK",status:"COMPLETED",routeSnapshotJson:route},{id:"pack",stage:"PACK",status:"READY",routeSnapshotJson:route}]);
assert.equal(missingMark.stages.MARK.state,"MISSING");assert.equal(missingMark.packReady,false);assert.match(missingMark.blocker??"",/Marking/);
const ready=deriveOrderWorkflowPrerequisites({id:"one",pickStatus:"PICKED",packStatus:"READY",status:"READY"},[{id:"pick",stage:"PICK",status:"COMPLETED",routeSnapshotJson:route},{id:"mark",stage:"MARK",status:"COMPLETED",routeSnapshotJson:route},{id:"pack",stage:"PACK",status:"READY",routeSnapshotJson:route}]);
const packedSibling=deriveOrderWorkflowPrerequisites({id:"two",pickStatus:"PICKED",packStatus:"PACKED",status:"PACKED"},[{id:"pick2",stage:"PICK",status:"COMPLETED",routeSnapshotJson:route},{id:"mark2",stage:"MARK",status:"COMPLETED",routeSnapshotJson:route},{id:"pack2",stage:"PACK",status:"COMPLETED",routeSnapshotJson:route}]);
assert.equal(aggregateWorkflowPrerequisites([ready,packedSibling]).packReady,true,"Packed siblings remain in package prerequisite aggregation.");

let live=initialLiveWorkClientState();live=applyLiveBootstrap(live,10);let event=applyLiveEvent(live,10);assert.equal(event.accepted,false);event=applyLiveEvent(event.state,11);assert.equal(event.accepted,true);live=beginLiveReconnect(event.state);const fallbackVersion=applyFallbackVersion(live,13);assert.equal(fallbackVersion.changed,true);assert.equal(fallbackVersion.state.cursor,13);

const {db,cleanup}=createTempWorkflowDb("workflow-receipt");
try{await db.account.create({data:{id:"a",name:"A",code:"A",marketplace:"FLIPKART"}});await db.user.create({data:{id:"u",username:"receipt-owner",passwordHash:"x",name:"Owner",role:"OWNER"}});const input={accountId:"a",actorUserId:"u",requestKind:"GROUP_COMPLETE",clientRequestId:"same",requestFingerprint:"fingerprint",sourceType:"ORDER" as const,stage:"PACK" as const,originalGroupKey:"vanished"};await db.$transaction(async tx=>{const receipt=await beginWorkflowActionReceipt<{ok:boolean}>(tx,input);assert.equal(receipt.replay,null);await completeWorkflowActionReceipt(tx,receipt.receiptId,{ok:true});});const replay=await db.$transaction(tx=>beginWorkflowActionReceipt<{ok:boolean}>(tx,input));assert.deepEqual(replay.replay,{ok:true});await assert.rejects(()=>db.$transaction(tx=>beginWorkflowActionReceipt(tx,{...input,requestFingerprint:"collision"})),/different workflow action/);
 await db.uploadBatch.create({data:{id:"b",accountId:"a",fileName:"synthetic.csv"}});await db.order.create({data:{id:"o",accountId:"a",batchId:"b",marketplace:"FLIPKART",awb:"A",trackingId:"T",sku:"SKU",qty:1,orderNo:"O",productDescription:"Product"}});const saved=createImmutableRouteProvenance({route:"PICK_MARK_PACK",rule:{id:"old-rule",route:"PICK_MARK_PACK",markingRequired:true,markingAsset:{id:"old-asset",name:"Saved",powerSetting:50,instructions:"Saved instruction"}}});const resolved=await db.$transaction(tx=>resolveRouteStageMetadata(tx,{accountId:"a",actorUserId:"u",sourceType:"ORDER",sourceId:"o",route:"MARK",requestFingerprint:"route",workCardSnapshotJson:JSON.stringify({sellerSku:"SKU",...saved})}));assert.equal(JSON.parse(resolved.get("MARK")??"{}").powerSetting,50,"In-flight instructions remain the creation-time snapshot.");
}finally{await cleanup();}

const stageTransition=readFileSync(resolve("src/lib/workflow/stage-transition.ts"),"utf8"),routeSelection=readFileSync(resolve("src/lib/workflow/route-selection.ts"),"utf8"),bootstrap=readFileSync(resolve("app/api/work/live/bootstrap/route.ts"),"utf8"),packingDetail=readFileSync(resolve("app/packing/[awb]/page.tsx"),"utf8"),consignmentDetail=readFileSync(resolve("app/work/consignments/items/[taskId]/page.tsx"),"utf8"),scannerPanel=readFileSync(resolve("components/UniversalScannerPanel.tsx"),"utf8");
assert.match(stageTransition,/authoritative package packing service/);assert.doesNotMatch(stageTransition,/packStatus:\s*"PACKED"/);assert.doesNotMatch(routeSelection,/productProcessRule|marketplaceListingIdentifier/);assert.match(bootstrap,/getLiveWorkVersion/);assert.match(packingDetail,/resolveOrderShipmentWorkflowPrerequisites/);assert.match(consignmentDetail,/PACKED — read only/);assert.match(scannerPanel,/work\/consignments\/items/);
console.log("Final workflow correctness tests passed.");
