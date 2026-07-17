import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { getLiveWorkEvents,getLiveWorkVersion,pruneLiveWorkEvents } from "../src/lib/workflow/live-work";
const {db,cleanup}=createTempWorkflowDb("live-work-load");
try{
 await db.account.create({data:{id:"a",name:"A",code:"A",marketplace:"FLIPKART"}});await db.workChangeEvent.createMany({data:Array.from({length:1200},(_,index)=>({accountId:"a",eventType:"GROUP_PROGRESS_SET",sourceType:"ORDER",stage:"PICK" as const,groupKey:"group-"+index,createdAt:index<100?new Date(0):new Date()}))});
 const initial=await getLiveWorkVersion({accountId:"a",stage:"PICK",sourceType:"ORDER"},db);
 for(const clientCount of [2,5,10,20]){const clients=await Promise.all(Array.from({length:clientCount},()=>getLiveWorkEvents({accountId:"a",stage:"PICK",sourceType:"ORDER",afterId:initial},db)));assert.ok(clients.every(events=>events.length===0));}
 const event=await db.workChangeEvent.create({data:{accountId:"a",eventType:"STAGE_COMPLETED",sourceType:"ORDER",stage:"PICK",groupKey:"visible-once"}});
 for(const clientCount of [2,5,10,20]){const updates=await Promise.all(Array.from({length:clientCount},()=>getLiveWorkEvents({accountId:"a",stage:"PICK",sourceType:"ORDER",afterId:initial},db)));assert.ok(updates.every(events=>events.length===1&&events[0].id===event.id));}
 assert.ok(await pruneLiveWorkEvents({accountId:"a",retentionHours:24,maxEvents:1000},db)>=100);assert.ok(await db.workChangeEvent.count({where:{accountId:"a"}})<=1000);
 const route=readFileSync(resolve("app/api/work/live/route.ts"),"utf8"),client=readFileSync(resolve("app/work/LiveWorkRefresh.tsx"),"utf8"),handler=client.slice(client.indexOf("events.onmessage"),client.indexOf("events.onopen"));assert.match(route,/stagePermissionField/);assert.match(route,/marketplaceCapabilityEnabled/);assert.match(route,/assertWorkerAccountAccess/);assert.match(route,/20000/);assert.match(route,/5000/);assert.doesNotMatch(handler,/router\.refresh/);assert.match(handler,/work-change/);assert.match(handler,/updateSummary/);assert.match(client,/work-summary-change/);assert.match(client,/30000/);assert.match(client,/scrollY/);assert.match(client,/\.focus\(\)/);
}finally{await cleanup();}
console.log("Live work 2/5/10/20-client load and retention tests passed.");
