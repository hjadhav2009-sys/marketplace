import assert from "node:assert/strict";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture=createPhase736Database("consignment-missing-listing-resolution");
const{prisma}=await import("../lib/prisma");
const{resolveConsignmentMissingListing}=await import("../src/lib/catalog/missing-listing-resolution");

try{
  await prisma.account.create({data:{id:"amazon",name:"Amazon",code:"AMZ",marketplace:"AMAZON"}});
  await prisma.user.create({data:{id:"owner",username:"phase736-consignment-resolution",passwordHash:"x",name:"Owner",role:"OWNER"}});
  const batch=await prisma.consignmentBatch.create({data:{id:"batch",accountId:"amazon",marketplace:"AMAZON",externalConsignmentNumber:"C-1",displayName:"Synthetic",sourceFileName:"synthetic.csv",sourceFileSha256:"a".repeat(64),status:"REVIEW_REQUIRED",totalSourceRows:1,totalValidLines:1,totalRequiredQuantity:7,unmatchedLines:1}});
  const line=await prisma.consignmentLine.create({data:{id:"line",consignmentBatchId:batch.id,accountId:"amazon",rowNumber:2,productNameSource:"Held Amazon product",sellerSkuSource:"AMZ-SKU-1",asinSource:"ASIN-1",fnskuSource:"FNSKU-1",requiredQuantity:7,matchStatus:"NOT_FOUND"}});
  await prisma.consignmentImportIssue.create({data:{consignmentBatchId:batch.id,consignmentLineId:line.id,rowNumber:line.rowNumber,issueType:"NOT_FOUND",severity:"ERROR",message:"Listing is missing."}});
  const input={actorUserId:"owner",accountId:"amazon",batchId:batch.id,lineId:line.id,clientRequestId:"consignment-resolve-1",action:"CREATE_FULL" as const,common:{productTitle:"Owner catalog title",images:["https://example.invalid/amazon.jpg"]},attributes:[{technicalKey:"bullet_point#1.value",displayLabel:"Bullet point",value:"Synthetic bullet",manualLocked:true}]};
  const result=await resolveConsignmentMissingListing(input);
  assert.equal(result.requiredQuantity,7);
  const resolvedLine=await prisma.consignmentLine.findUniqueOrThrow({where:{id:line.id}});
  assert.equal(resolvedLine.requiredQuantity,7,"Catalog resolution preserves Shipped/Quantity Sent");
  assert.equal(resolvedLine.marketplaceListingId,result.listingId);
  assert.equal(resolvedLine.activated,false,"Catalog resolution does not activate the Consignment");
  assert.equal(await prisma.workTask.count({where:{consignmentLineId:line.id}}),0,"No work is created before explicit activation");
  assert.equal(await prisma.consignmentImportIssue.count({where:{consignmentLineId:line.id,resolved:false}}),0);
  assert.equal(await prisma.marketplaceListingAttribute.count({where:{marketplaceListingId:result.listingId}}),1);
  assert.equal(await prisma.marketplaceListingIdentifier.count({where:{marketplaceListingId:result.listingId,identifierType:{in:["SELLER_SKU","ASIN","FNSKU"]}}}),3);
  const replay=await resolveConsignmentMissingListing(input);
  assert.equal(replay.listingId,result.listingId);
  assert.equal(await prisma.marketplaceListing.count({where:{accountId:"amazon",sellerSkuId:"AMZ-SKU-1"}}),1);
  await assert.rejects(()=>resolveConsignmentMissingListing({...input,common:{productTitle:"Changed replay"}}),/different payload/);
}finally{
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Consignment missing-listing full resolution tests passed.");
