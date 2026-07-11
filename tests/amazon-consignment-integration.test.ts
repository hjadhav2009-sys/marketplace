import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const tempRoot=resolve(process.cwd(),".codex-tmp");mkdirSync(tempRoot,{recursive:true});const databaseFile=resolve(tempRoot,"amazon-consignment-integration.db");const storageRoot=resolve(tempRoot,"amazon-consignment-storage");rmSync(databaseFile,{force:true});rmSync(storageRoot,{recursive:true,force:true});
const sqlite=new DatabaseSync(databaseFile);sqlite.exec("PRAGMA foreign_keys=ON;");for(const name of readdirSync(resolve(process.cwd(),"prisma/migrations"),{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort())sqlite.exec(readFileSync(join(process.cwd(),"prisma/migrations",name,"migration.sql"),"utf8"));sqlite.close();
process.env.DATABASE_URL=`file:${databaseFile.replace(/\\/g,"/")}`;process.env.CONSIGNMENT_IMPORT_ROOT=storageRoot;
const db=new PrismaClient({datasourceUrl:process.env.DATABASE_URL});
try {
 await db.account.create({data:{id:"amazon-account",name:"Fake Amazon",code:"AMZFAKE",companyName:"Fake Company",marketplace:"AMAZON",active:true}});
 await db.user.create({data:{id:"owner-amazon",username:"fake-amazon-owner",passwordHash:"fake-hash",name:"Fake Owner",role:"OWNER",active:true}});
 await db.marketplaceListing.create({data:{id:"amazon-listing",accountId:"amazon-account",marketplace:"AMAZON",sellerSkuId:"SKU-FAKE",sku:"SKU-FAKE",productTitle:"Existing title",mainImageUrl:"https://example.invalid/existing.png"}});
 await db.marketplaceListingIdentifier.createMany({data:[{accountId:"amazon-account",marketplaceListingId:"amazon-listing",marketplace:"AMAZON",identifierType:"SELLER_SKU",rawValue:"SKU-FAKE",normalizedValue:"SKU-FAKE"},{accountId:"amazon-account",marketplaceListingId:"amazon-listing",marketplace:"AMAZON",identifierType:"FNSKU",rawValue:"FNSKU-FAKE",normalizedValue:"FNSKU-FAKE"}]});
 await db.productProcessRule.create({data:{id:"amazon-rule",accountId:"amazon-account",marketplaceListingId:"amazon-listing",route:"PICK_PACK",active:true,createdByUserId:"owner-amazon",updatedByUserId:"owner-amazon"}});
 const shipment=new File(["Shipment ID,Shipment Name,Seller SKU,FNSKU,ASIN,Quantity,Destination\nSHIP-FAKE,Fake Shipment,SKU-FAKE,FNSKU-FAKE,B000FAKE01,2,FC-FAKE\n"],"shipment.csv",{type:"text/csv"});
 const listings=new File(["Seller SKU,ASIN,FNSKU,Item Name,Listing Status,Main Image URL\nSKU-FAKE,B000FAKE01,FNSKU-FAKE,Updated fake title,Active,https://example.invalid/listing.png\n"],"all-listings.csv",{type:"text/csv"});
 const catalog=new File(["Seller SKU,ASIN,Item Name,Category,Brand,Description,Main Image URL,Bullet Point 1\nSKU-FAKE,B000FAKE01,Enriched fake title,Fake Category,Fake Brand,Fake description,https://example.invalid/catalog.png,Fake feature\n"],"catalog.csv",{type:"text/csv"});
 const { importAmazonConsignmentDraft }=await import("../src/lib/consignments/amazon/import-service");const { activateConsignmentBatch }=await import("../src/lib/workflow/task-store");
 const imported=await importAmazonConsignmentDraft({accountId:"amazon-account",user:{id:"owner-amazon"},externalConsignmentNumber:"SHIP-FAKE",files:[shipment,listings,catalog]});
 assert.equal(imported.requiresMainSelection,false);assert.equal(await db.workTask.count(),0,"Preview never creates worker tasks");
 const batch=await db.consignmentBatch.findUniqueOrThrow({where:{id:imported.batchId}});assert.equal(batch.marketplace,"AMAZON");assert.equal(batch.status,"READY_TO_ACTIVATE");assert.equal(batch.totalRequiredQuantity,2);
 const line=await db.consignmentLine.findFirstOrThrow({where:{consignmentBatchId:batch.id}});assert.equal(line.matchStatus,"EXACT_FNSKU");assert.equal(line.marketplaceListingId,"amazon-listing");assert.equal(line.processRoute,"PICK_PACK");
 const updatedListing=await db.marketplaceListing.findUniqueOrThrow({where:{id:"amazon-listing"},include:{identifiers:true}});assert.equal(updatedListing.productTitle,"Enriched fake title");assert.equal(updatedListing.liveCategory,"Fake Category");assert.ok(updatedListing.identifiers.some((identifier)=>identifier.identifierType==="ASIN"&&identifier.normalizedValue==="B000FAKE01"));
 const activation=await activateConsignmentBatch({batchId:batch.id,accountId:"amazon-account",actorUserId:"owner-amazon"},db);assert.equal(activation.activated,true);const tasks=await db.workTask.findMany({where:{consignmentLineId:line.id},orderBy:{sequenceNumber:"asc"}});assert.deepEqual(tasks.map((task)=>[task.stage,task.status]),[["PICK","READY"],["PACK","LOCKED"]]);
 const activated=await db.consignmentLine.findUniqueOrThrow({where:{id:line.id}});assert.equal(activated.asinSnapshot,"B000FAKE01");assert.equal(activated.fnskuSnapshot,"FNSKU-FAKE");assert.ok(activated.catalogSnapshotJson?.includes("Fake Category"));
 await db.marketplaceListing.update({where:{id:"amazon-listing"},data:{productTitle:"Changed after activation",mainImageUrl:"https://example.invalid/changed.png"}});const immutable=await db.consignmentLine.findUniqueOrThrow({where:{id:line.id}});assert.notEqual(immutable.productTitleSnapshot,"Changed after activation");assert.equal(immutable.catalogSnapshotJson,activated.catalogSnapshotJson,"Activated catalog snapshot remains immutable");
 const replay=await activateConsignmentBatch({batchId:batch.id,accountId:"amazon-account",actorUserId:"owner-amazon"},db);assert.equal(replay.alreadyActive,true);assert.equal(await db.workTask.count({where:{consignmentLineId:line.id}}),2);
} finally { const { prisma }=await import("../lib/prisma");await prisma.$disconnect();await db.$disconnect();rmSync(databaseFile,{force:true});rmSync(storageRoot,{recursive:true,force:true}); }
console.log("Amazon import preview, enrichment, activation, and snapshot integration tests passed.");
