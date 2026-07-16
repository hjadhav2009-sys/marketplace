import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { AMAZON_TECHNICAL_SIGNATURES, detectHeaderBand, findHeaderProfile, headerFingerprint, normalizeMarketplaceHeader, saveHeaderProfile } from "../src/lib/imports/header-profiles";
import { assertMarketplaceCapability, marketplaceCapabilities } from "../src/lib/marketplace-capabilities";

const root=resolve(process.cwd(),".codex-tmp");mkdirSync(root,{recursive:true});const file=resolve(root,"adaptive-import.db");rmSync(file,{force:true});const sqlite=new DatabaseSync(file);sqlite.exec("PRAGMA foreign_keys=ON;");for(const name of readdirSync(resolve("prisma/migrations"),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort())sqlite.exec(readFileSync(join("prisma/migrations",name,"migration.sql"),"utf8"));sqlite.close();const db=new PrismaClient({datasourceUrl:`file:${file.replace(/\\/g,"/")}`});
try{
 assert.equal(normalizeMarketplaceHeader("  Quantity_Sent  "),"quantity sent");assert.equal(headerFingerprint(["SKU","Qty"]),headerFingerprint(["ＳＫＵ","Qty"]));
 const rows=[["Instructions"],["Human SKU","Product Type","Item Name","Main Image"],["contribution_sku#1.value","product_type#1.value","item_name[en_IN]#1.value","main_product_image_locator[0]#1.media_location"],["SKU-1","KEYCHAIN","Fake","https://example.test/a.jpg"]];const detected=detectHeaderBand(rows,AMAZON_TECHNICAL_SIGNATURES);assert.equal(detected?.rowIndex,2,"Amazon technical row is detected independent of filename and sheet position");
 await db.account.create({data:{id:"account",name:"Adaptive",code:"AD",marketplace:"AMAZON"}});await db.user.create({data:{id:"owner",username:"adaptive-owner",passwordHash:"fake",name:"Owner",role:"OWNER",active:true}});
 const unknown=await findHeaderProfile({accountId:"account",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headers:detected!.originalHeaders},db);assert.equal(unknown.state,"NEEDS_MAPPING");
 await saveHeaderProfile({actorUserId:"owner",accountId:"account",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",profileName:"Amazon technical template",headers:detected!.originalHeaders,mapping:{sellerSku:"contribution_sku#1.value",productType:"product_type#1.value",title:"item_name[en_IN]#1.value",mainImageUrl:"main_product_image_locator[0]#1.media_location"},requiredFields:["sellerSku","productType"]},db);
 const matched=await findHeaderProfile({accountId:"account",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headers:detected!.originalHeaders},db);assert.equal(matched.state,"MATCHED");assert.equal(matched.mapping?.sellerSku,"contribution_sku#1.value");
 assert.equal(marketplaceCapabilities("AMAZON").dailyOrders,false);assert.throws(()=>assertMarketplaceCapability("AMAZON","dailyOrders"),/disabled/i);assert.doesNotThrow(()=>assertMarketplaceCapability("AMAZON","consignments"));
}finally{await db.$disconnect();rmSync(file,{force:true});}
console.log("Adaptive header profile and capability tests passed.");
