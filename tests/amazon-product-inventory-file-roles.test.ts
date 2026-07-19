import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import ExcelJS from "exceljs";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture=createPhase736Database("amazon-product-inventory-file-roles"),jobPaths:string[]=[];
const{prisma}=await import("../lib/prisma");
const{createProductInventoryImportJob,confirmProductInventoryFileRoles,processProductInventoryJob}=await import("../src/lib/product-inventory/jobs");
const{IMPORT_JOB_STORAGE_DIR}=await import("../src/lib/import-jobs/runner");

const technical=["contribution_sku#1.value","product_type#1.value","item_name[marketplace_id=A21TJRUUN4KGV]#1.value","brand[language_tag=en_IN]#1.value","bullet_point[language_tag=en_IN]#1.value"];
const human=["Seller SKU","Product type","Item name","Brand","Bullet point"];
async function workbook(sku:string,title:string,brand=""){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet("Catalog Data");
 sheet.addRow(["Synthetic Amazon category template"]);sheet.addRow(human);sheet.addRow(technical);sheet.addRow([sku,"KEYCHAIN",title,brand,""]);
 return Buffer.from(await book.xlsx.writeBuffer());
}
const file=(body:Buffer,name:string)=>new File([Uint8Array.from(body).buffer],name,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});

try{
 const account=await prisma.account.create({data:{id:"role-account",name:"Synthetic Amazon",code:"ROLE-AMZ",marketplace:"AMAZON",active:true}});
 const owner=await prisma.user.create({data:{id:"role-owner",username:"role-owner",passwordHash:"synthetic",name:"Synthetic Owner",role:"OWNER"}});
 const worker=await prisma.user.create({data:{id:"role-worker",username:"role-worker",passwordHash:"synthetic",name:"Synthetic Worker",role:"PICKER"}});
 await prisma.marketplaceListing.create({data:{id:"role-listing",accountId:account.id,marketplace:"AMAZON",sellerSkuId:"ROLE-SKU-1",sku:"ROLE-SKU-1",productTitle:"Before role import"}});
 const files=[file(await workbook("ROLE-SKU-1","Role-selected title"),"identity.xlsx"),file(await workbook("ROLE-SKU-1","Role-selected title","Synthetic Brand"),"enrichment.xlsx"),file(await workbook("IGNORED-SKU","Must not import"),"reference.xlsx")];
 const job=await createProductInventoryImportJob({files,account,user:owner,requireRoleReview:true});if(job.filePath)jobPaths.push(job.filePath);
 assert.equal(job.status,"AWAITING_FILE_ROLES");
 const manifest=JSON.parse(job.manifestJson??"") as{entries:Array<{id:string;detectedRole?:string;selectedRole?:string}>};assert.equal(manifest.entries.length,3);assert.ok(manifest.entries.every(entry=>entry.selectedRole==="AUTO_DETECT"));
 await confirmProductInventoryFileRoles({jobId:job.id,accountId:account.id,actorUserId:owner.id,roles:{[manifest.entries[0].id]:"PRODUCT_CATALOG",[manifest.entries[1].id]:"SUPPORTING_ENRICHMENT",[manifest.entries[2].id]:"REFERENCE_IGNORE"}});
 assert.equal((await prisma.importJob.findUniqueOrThrow({where:{id:job.id}})).status,"QUEUED");
 await processProductInventoryJob(job.id);
 const finished=await prisma.importJob.findUniqueOrThrow({where:{id:job.id}});assert.match(finished.status,/^COMPLETED/);
 const finishedManifest=JSON.parse(finished.manifestJson??"") as{entries:Array<{selectedRole:string;status:string}>};assert.equal(finishedManifest.entries[2].selectedRole,"REFERENCE_IGNORE");assert.equal(finishedManifest.entries[2].status,"COMPLETED");
 assert.equal(await prisma.marketplaceListing.count({where:{accountId:account.id,sellerSkuId:"IGNORED-SKU"}}),0,"Reference / Ignore never creates a listing");
 assert.equal(await prisma.marketplaceListingAttribute.count({where:{marketplaceListingId:"role-listing"}}),0,"Blank optional technical fields create no attribute rows");
 await assert.rejects(()=>confirmProductInventoryFileRoles({jobId:job.id,accountId:account.id,actorUserId:owner.id,roles:{}}),/unavailable/i,"A completed review cannot be replayed with changed roles");

 const denied=await createProductInventoryImportJob({files:[file(await workbook("ROLE-SKU-1","Denied"),"denied.xlsx")],account,user:owner,requireRoleReview:true});if(denied.filePath)jobPaths.push(denied.filePath);const deniedManifest=JSON.parse(denied.manifestJson??"") as{entries:Array<{id:string}>};
 await assert.rejects(()=>confirmProductInventoryFileRoles({jobId:denied.id,accountId:account.id,actorUserId:worker.id,roles:{[deniedManifest.entries[0].id]:"PRODUCT_CATALOG"}}),/owner access/i);
 assert.equal((await prisma.importJob.findUniqueOrThrow({where:{id:denied.id}})).status,"AWAITING_FILE_ROLES");
}finally{
 await prisma.$disconnect();const storageRoot=resolve(IMPORT_JOB_STORAGE_DIR)+sep;for(const jobPath of jobPaths){const target=resolve(jobPath);if(target.startsWith(storageRoot))rmSync(target,{recursive:true,force:true});}fixture.cleanup();
}
console.log("Amazon Product Inventory multi-file role tests passed.");
