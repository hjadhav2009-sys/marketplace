import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { assertAccountMarketplaceChangeAllowed, setAccountActiveSafely } from "../lib/account-lifecycle";
import { assertWorkerAccountAccess } from "../src/lib/workflow/worker-access";

const {db,cleanup}=createTempWorkflowDb("account-lifecycle");
try{
 await db.account.create({data:{id:"empty",name:"Empty",code:"EMPTY",marketplace:"FLIPKART"}});await assertAccountMarketplaceChangeAllowed("empty","AMAZON",db);
 await db.account.create({data:{id:"active",name:"Active",code:"ACTIVE",marketplace:"FLIPKART"}});await db.user.create({data:{id:"worker",username:"account-worker",passwordHash:"x",name:"Worker",role:"PICKER",accountId:"active",canPick:true}});await db.marketplaceListing.create({data:{id:"listing",accountId:"active",marketplace:"FLIPKART",sellerSkuId:"SKU",sku:"SKU"}});await assert.rejects(()=>assertAccountMarketplaceChangeAllowed("active","AMAZON",db),/MARKETPLACE_LOCKED/);
 await db.importJob.create({data:{id:"job",accountId:"active",createdByUserId:"worker",marketplace:"FLIPKART",importType:"FLIPKART_ORDER",fileName:"synthetic.csv",status:"RUNNING",stage:"PARSING",runnerId:"runner",leaseExpiresAt:new Date(Date.now()+60_000)}});await assert.rejects(()=>setAccountActiveSafely({accountId:"active",active:false},db),/CONFIRMATION_REQUIRED/);assert.equal((await db.account.findUniqueOrThrow({where:{id:"active"}})).active,true);
 await setAccountActiveSafely({accountId:"active",active:false,confirmation:"ACTIVE"},db);assert.equal((await db.account.findUniqueOrThrow({where:{id:"active"}})).active,false);const job=await db.importJob.findUniqueOrThrow({where:{id:"job"}});assert.ok(job.cancelRequestedAt);assert.equal(job.stage,"ACCOUNT_DEACTIVATED");await assert.rejects(()=>assertWorkerAccountAccess("worker","active",db),/inactive|unavailable|access/i);
 await setAccountActiveSafely({accountId:"active",active:true},db);assert.equal((await assertWorkerAccountAccess("worker","active",db)).account.id,"active");
}finally{await cleanup();}
console.log("Account marketplace immutability and deactivation safety tests passed.");
