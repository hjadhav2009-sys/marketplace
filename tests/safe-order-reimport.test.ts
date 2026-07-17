import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root=resolve(process.cwd(),".codex-tmp");mkdirSync(root,{recursive:true});const file=resolve(root,"safe-order-reimport.db");rmSync(file,{force:true});const sqlite=new DatabaseSync(file);sqlite.exec("PRAGMA foreign_keys=ON;");for(const name of readdirSync(resolve("prisma/migrations"),{withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>item.name).sort())sqlite.exec(readFileSync(join("prisma/migrations",name,"migration.sql"),"utf8"));sqlite.close();
process.env.DATABASE_URL=`file:${file.replace(/\\/g,"/")}`;
const { prisma }=await import("../lib/prisma");
const { importFlipkartOrderRows }=await import("../src/lib/marketplaces/flipkart/import");

const row=(values:Record<string,string>={})=>({"Shipment ID":"SHIP-1","ORDER ITEM ID":"ITEM-1","Order Id":"ORDER-1",FSN:"FSN-1",SKU:"SKU-1",Product:"Initial title",Quantity:"1",City:"Synthetic City",State:"Synthetic State","Tracking ID":"TRACK-1",...values});
try{
 const account=await prisma.account.create({data:{id:"account",name:"Synthetic",code:"SYN",marketplace:"FLIPKART"}}),user=await prisma.user.create({data:{id:"owner",username:"safe-reimport-owner",passwordHash:"x",name:"Owner",role:"OWNER"}});
 await importFlipkartOrderRows({rows:[row()],fileName:"initial.csv",account,user});
 const order=await prisma.order.findUniqueOrThrow({where:{accountId_awb:{accountId:"account",awb:"FLIPKART:ORDER_ITEM:ITEM-1"}}}),pick=await prisma.workTask.findFirstOrThrow({where:{orderId:order.id,stage:"PICK"}});assert.equal(pick.requiredQuantity,1);
 await importFlipkartOrderRows({rows:[row({Quantity:"3",Product:"Refreshed title","Tracking ID":"TRACK-2"})],fileName:"untouched-refresh.csv",account,user});
 const refreshedOrder=await prisma.order.findUniqueOrThrow({where:{id:order.id}}),refreshedPick=await prisma.workTask.findUniqueOrThrow({where:{id:pick.id}});assert.equal(refreshedOrder.qty,3);assert.equal(refreshedOrder.trackingId,"TRACK-2");assert.equal(refreshedPick.requiredQuantity,3,"Untouched Order and task quantity update together");assert.match(refreshedPick.workCardSnapshotJson??"",/Refreshed title/);
 await prisma.workTask.update({where:{id:pick.id},data:{status:"IN_PROGRESS",completedQuantity:1,assignedUserId:user.id,startedByUserId:user.id,startedAt:new Date()}});
 await prisma.order.update({where:{id:order.id},data:{productDescription:null}});
 const conflictBatch=await importFlipkartOrderRows({rows:[row({Quantity:"5",SKU:"SKU-CHANGED",Product:"Safe descriptive enrichment","Tracking ID":"TRACK-CHANGED"})],fileName:"started-conflict.csv",account,user});
 const preservedOrder=await prisma.order.findUniqueOrThrow({where:{id:order.id}}),preservedPick=await prisma.workTask.findUniqueOrThrow({where:{id:pick.id}});assert.equal(preservedOrder.qty,3);assert.equal(preservedOrder.sku,"SKU-1");assert.equal(preservedOrder.trackingId,"TRACK-2");assert.equal(preservedOrder.productDescription,"Safe descriptive enrichment","Missing descriptive data may be enriched without changing active immutable work");assert.equal(preservedPick.requiredQuantity,3);assert.equal(await prisma.importRowIssue.count({where:{batchId:conflictBatch.id,issueType:"ACTIVE_WORK_IDENTITY_CONFLICT"}}),1);assert.ok(conflictBatch.errorRows>0,"Started operational changes remain blocking review issues");
 const untouched=await prisma.order.create({data:{id:"rollback-order",accountId:"account",batchId:conflictBatch.id,marketplace:"FLIPKART",awb:"FLIPKART:ORDER_ITEM:ITEM-ROLLBACK",shipmentId:"SHIP-ROLLBACK",orderItemId:"ITEM-ROLLBACK",sku:"ROLLBACK-SKU",qty:1,orderNo:"ROLLBACK"}});await assert.rejects(()=>importFlipkartOrderRows({rows:[row({"Shipment ID":"SHIP-ROLLBACK","ORDER ITEM ID":"ITEM-ROLLBACK",SKU:"ROLLBACK-CHANGED",Quantity:"4"})],fileName:"rollback.csv",account,user}),/rolled back/i);const rolledBack=await prisma.order.findUniqueOrThrow({where:{id:untouched.id}});assert.equal(rolledBack.sku,"ROLLBACK-SKU");assert.equal(rolledBack.qty,1);
}finally{await prisma.$disconnect();rmSync(file,{force:true});}
console.log("Safe untouched and started Flipkart Order reimport tests passed.");
