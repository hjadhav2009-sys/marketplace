import { createHash } from "node:crypto";
import type { IdentifierType, Marketplace, Prisma, PrismaClient, ProcessRoute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";
import { listingIdentifierRows, normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import { assertWorkerAccountAccess } from "@/src/lib/workflow/worker-access";
import { createWorkRouteSnapshot } from "@/src/lib/workflow/dynamic-route";
import { createImmutableRouteProvenance } from "@/src/lib/workflow/route-provenance";
import { refreshAffectedWorkGroups } from "@/src/lib/workflow/work-group-projection";
import { preferredFlipkartGallery } from "./dynamic-form-profiles";

type Client=PrismaClient;
type CommonFields={productTitle?:unknown;subCategory?:unknown;listingStatus?:unknown;mrp?:unknown;sellingPrice?:unknown;liveTitle?:unknown;brand?:unknown;category?:unknown;livePrice?:unknown;liveMrp?:unknown;productHighlights?:unknown;description?:unknown;specifications?:unknown;generatedProductUrl?:unknown;canonicalProductUrl?:unknown;images?:unknown[]};
type DynamicAttributeInput={technicalKey:string;displayLabel:string;value:unknown;sourceHeader?:string;manualLocked?:boolean};
type IdentifierInput={type:IdentifierType;value:unknown};

export type ResolveMissingListingInput={
  actorUserId:string;accountId:string;issueId:string;expectedIssueVersion:number;clientRequestId:string;
  action:"LINK_EXISTING"|"CREATE_MINIMAL"|"CREATE_FULL";listingId?:string;common?:CommonFields;identifiers?:IdentifierInput[];attributes?:DynamicAttributeInput[];manualLocked?:boolean;
};

const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text=(value:unknown,max:number)=>String(value??"").normalize("NFKC").trim().slice(0,max)||null;
const number=(value:unknown)=>{if(value===null||value===undefined||value==="")return null;const parsed=Number(value);if(!Number.isFinite(parsed)||parsed<0)throw new Error("Prices must be valid non-negative numbers.");return parsed;};
function safeUrl(value:unknown){const result=text(value,2048);if(!result)return null;let url:URL;try{url=new URL(result);}catch{throw new Error("Image and product URLs must be valid HTTP/HTTPS URLs.");}if(!["http:","https:"].includes(url.protocol))throw new Error("Image and product URLs must use HTTP or HTTPS.");return result;}
function safeJson(value:string|null){try{const parsed=JSON.parse(value??"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return{};}}

function commonListingData(common:CommonFields|undefined,manualLocked:boolean){
  const images=(common?.images??[]).map(safeUrl).filter((value):value is string=>Boolean(value)).slice(0,10),gallery=preferredFlipkartGallery(Object.fromEntries(images.map((value,index)=>[`imageUrl${index+1}`,value])));
  const data={productTitle:text(common?.productTitle,500),subCategory:text(common?.subCategory,240),listingStatus:text(common?.listingStatus,80)??"NEEDS_ENRICHMENT",mrp:number(common?.mrp),sellingPrice:number(common?.sellingPrice),liveTitle:text(common?.liveTitle,500),liveBrand:text(common?.brand,240),liveCategory:text(common?.category,240),livePrice:number(common?.livePrice),liveMrp:number(common?.liveMrp),productHighlights:text(common?.productHighlights,8000),description:text(common?.description,12000),allSpecifications:text(common?.specifications,12000),generatedDirectProductUrl:safeUrl(common?.generatedProductUrl),canonicalProductUrl:safeUrl(common?.canonicalProductUrl),mainImageUrl:gallery[0]??null,...Object.fromEntries(Array.from({length:10},(_,index)=>[`imageUrl${index+1}`,gallery[index]??null]))};
  const entered=Object.entries(data).filter(([,value])=>value!==null).map(([key])=>key);return{...data,fieldProvenanceJson:JSON.stringify(Object.fromEntries(entered.map(key=>[key,{sourceAuthority:"MANUAL_OWNER",updatedAt:new Date().toISOString()}]))),manualLocksJson:JSON.stringify(manualLocked?entered:[])};
}

async function syncIdentifiers(tx:Prisma.TransactionClient,listing:{id:string;accountId:string;marketplace:string;sellerSkuId:string;sku:string;fsn:string|null;listingId:string|null},extra:IdentifierInput[]){
  const marketplace=listing.marketplace as Marketplace,base=listingIdentifierRows({...listing,marketplace});
  const extras=extra.flatMap(item=>{const normalizedValue=normalizeListingIdentifier(item.type,item.value);if(!normalizedValue)return[];return[{accountId:listing.accountId,marketplaceListingId:listing.id,marketplace,identifierType:item.type,rawValue:String(item.value).trim(),normalizedValue,source:"MANUAL_OWNER",active:true}];});
  const rows=[...new Map([...base,...extras].map(row=>[`${row.identifierType}:${row.normalizedValue}`,row])).values()];
  for(const row of rows){const conflict=await tx.marketplaceListingIdentifier.findFirst({where:{accountId:listing.accountId,marketplace,identifierType:row.identifierType,normalizedValue:row.normalizedValue,active:true,marketplaceListingId:{not:listing.id}},select:{id:true}});if(conflict)throw new Error(`${row.identifierType} is already linked to another listing in this account.`);await tx.marketplaceListingIdentifier.upsert({where:{marketplaceListingId_identifierType_normalizedValue:{marketplaceListingId:listing.id,identifierType:row.identifierType,normalizedValue:row.normalizedValue}},create:row,update:{rawValue:row.rawValue,source:row.source,active:true}});}
}

async function releaseHeldOrder(tx:Prisma.TransactionClient,input:{accountId:string;actorUserId:string;orderId:string;listingId:string}){
  const [order,listing]=await Promise.all([
    tx.order.findFirst({where:{id:input.orderId,accountId:input.accountId},include:{workTasks:true}}),
    tx.marketplaceListing.findFirst({where:{id:input.listingId,accountId:input.accountId},include:{processRules:{where:{active:true},orderBy:{updatedAt:"desc"},take:1,include:{markingAsset:true}}}})
  ]);if(!order||!listing)throw new Error("Held Order or selected listing is unavailable.");
  const started=order.workTasks.some(task=>task.status==="IN_PROGRESS"||task.status==="COMPLETED"||task.status==="PROBLEM"||task.completedQuantity>0||task.assignedUserId||task.startedAt);if(started)throw new Error("Started work cannot receive a newly generated catalog snapshot automatically.");
  const savedRule=listing.processRules[0]??null,route=(savedRule?.route??"PICK_PACK") as ProcessRoute,provenance=createImmutableRouteProvenance({route,rule:savedRule});
  const workCardSnapshotJson=JSON.stringify({version:2,productTitle:listing.productTitle??order.productDescription??null,primaryImage:listing.mainImageUrl??null,sellerSku:listing.sellerSkuId,operationalBarcode:order.trackingId??order.awb,marketplaceIdentifiers:{fsn:listing.fsn??order.fsn,listingId:listing.listingId,orderItemId:order.orderItemId,trackingId:order.trackingId},category:listing.liveCategory,brand:listing.liveBrand,variantIdentity:null,...provenance}),routeSnapshotJson=JSON.stringify({...createWorkRouteSnapshot({processRoute:route,currentStage:"PICK"}),...provenance});
  const task=order.workTasks.find(item=>item.stage==="PICK")??await tx.workTask.create({data:{accountId:input.accountId,sourceType:"ORDER",orderId:order.id,stage:"PICK",sequenceNumber:1,requiredQuantity:order.qty,status:"READY",metadataJson:JSON.stringify({version:1,recommendedProcessRoute:route}),workCardSnapshotJson,routeSnapshotJson}});
  if(order.workTasks.some(item=>item.stage==="PICK"))await tx.workTask.update({where:{id:task.id},data:{requiredQuantity:order.qty,workCardSnapshotJson,routeSnapshotJson,metadataJson:JSON.stringify({version:1,recommendedProcessRoute:route}),version:{increment:1}}});
  await refreshAffectedWorkGroups({accountId:input.accountId,sourceType:"ORDER",stages:["PICK"],taskIds:[task.id],orderIds:[order.id]},tx);await tx.workChangeEvent.create({data:{accountId:input.accountId,eventType:"MISSING_LISTING_RESOLVED",sourceType:"ORDER",stage:"PICK",entityId:order.id}});return task.id;
}

export async function resolveMissingListing(input:ResolveMissingListingInput,client:Client=prisma){
  if(!input.clientRequestId.trim()||input.clientRequestId.length>160)throw new Error("A bounded client request ID is required.");const requestFingerprint=hash({...input,clientRequestId:undefined});
  return client.$transaction(async tx=>{
    const{user}=await assertWorkerAccountAccess(input.actorUserId,input.accountId,tx);if(user.role!=="OWNER"&&!user.canImportConsignments)throw new Error("Catalog issue management permission is required.");
    const prior=await tx.workflowActionReceipt.findUnique({where:{accountId_actorUserId_requestKind_clientRequestId:{accountId:input.accountId,actorUserId:user.id,requestKind:"MISSING_LISTING_RESOLUTION",clientRequestId:input.clientRequestId}}});if(prior){if(prior.requestFingerprint!==requestFingerprint)throw new Error("Request ID was already used with a different payload.");if(prior.status==="COMPLETED"&&prior.resultJson)return JSON.parse(prior.resultJson) as {listingId:string;taskId:string|null;idempotent:boolean};throw new Error("This listing resolution is already processing.");}
    const issue=await tx.importRowIssue.findFirst({where:{id:input.issueId,batch:{accountId:input.accountId},issueType:"MISSING_FLIPKART_LISTING_MAPPING"},include:{batch:{include:{account:true}}}});if(!issue)throw new Error("Missing-listing issue is unavailable.");if(issue.resolved)throw new Error("Missing-listing issue was already resolved; refresh the page.");if(issue.version!==input.expectedIssueVersion)throw new Error("Missing-listing issue changed; refresh before saving.");
    const safe=safeJson(issue.safeDataJson),sellerSku=normalizeSkuForMatching(typeof safe.sellerSku==="string"?safe.sellerSku:null);if(!sellerSku)throw new Error("The held source row has no valid Seller SKU identity.");const marketplace=issue.batch.account.marketplace;
    await tx.workflowActionReceipt.create({data:{accountId:input.accountId,actorUserId:user.id,requestKind:"MISSING_LISTING_RESOLUTION",clientRequestId:input.clientRequestId,requestFingerprint,sourceType:issue.sourceType==="CONSIGNMENT"?"CONSIGNMENT":"ORDER",status:"IN_PROGRESS"}});
    let listing;
    if(input.action==="LINK_EXISTING"){
      if(!input.listingId)throw new Error("Choose an existing listing.");listing=await tx.marketplaceListing.findFirst({where:{id:input.listingId,accountId:input.accountId,marketplace}});if(!listing)throw new Error("The selected listing is not available in this account and marketplace.");
    }else{
      const existing=await tx.marketplaceListing.findFirst({where:{accountId:input.accountId,marketplace,sellerSkuId:sellerSku}});if(existing)listing=existing;else listing=await tx.marketplaceListing.create({data:{accountId:input.accountId,marketplace,sellerSkuId:sellerSku,sku:sellerSku,fsn:text(safe.fsn,160),...commonListingData(input.action==="CREATE_MINIMAL"?undefined:input.common,input.manualLocked!==false)}});
      if(existing&&input.action==="CREATE_FULL")listing=await tx.marketplaceListing.update({where:{id:existing.id},data:commonListingData(input.common,input.manualLocked!==false)});
    }
    await syncIdentifiers(tx,listing,[{type:"SELLER_SKU",value:sellerSku},...(safe.fsn?[{type:"FSN" as const,value:safe.fsn}]:[]),...(input.identifiers??[])]);
    for(const attribute of (input.attributes??[]).slice(0,1000)){const technicalKey=text(attribute.technicalKey,500),displayLabel=text(attribute.displayLabel,500),valueText=text(attribute.value,4000);if(!technicalKey||!displayLabel||!valueText)continue;if(/[<>\u0000-\u001f]/.test(technicalKey))throw new Error("Dynamic attribute keys contain unsupported characters.");await tx.marketplaceListingAttribute.upsert({where:{marketplaceListingId_technicalKey:{marketplaceListingId:listing.id,technicalKey}},create:{marketplaceListingId:listing.id,accountId:input.accountId,marketplace,technicalKey,displayLabel,valueJson:JSON.stringify(attribute.value),valueText,sourceHeader:text(attribute.sourceHeader,500),sourceAuthority:"MANUAL_OWNER",manualLocked:attribute.manualLocked!==false,createdByUserId:user.id,updatedByUserId:user.id},update:{displayLabel,valueJson:JSON.stringify(attribute.value),valueText,sourceHeader:text(attribute.sourceHeader,500),sourceAuthority:"MANUAL_OWNER",manualLocked:attribute.manualLocked!==false,updatedByUserId:user.id}});}
    let taskId:string|null=null;if(issue.sourceType==="ORDER"&&issue.sourceId)taskId=await releaseHeldOrder(tx,{accountId:input.accountId,actorUserId:user.id,orderId:issue.sourceId,listingId:listing.id});
    const changed=await tx.importRowIssue.updateMany({where:{id:issue.id,resolved:false,version:input.expectedIssueVersion},data:{resolved:true,resolvedAt:new Date(),resolvedByUserId:user.id,resolutionAction:input.action,version:{increment:1}}});if(changed.count!==1)throw new Error("Missing-listing issue changed; refresh before saving.");
    await tx.auditLog.create({data:{userId:user.id,accountId:input.accountId,action:"MISSING_LISTING_RESOLVED",entityType:"ImportRowIssue",entityId:issue.id,metadata:JSON.stringify({action:input.action,listingId:listing.id,taskId})}});const result={listingId:listing.id,taskId,idempotent:false};await tx.workflowActionReceipt.update({where:{accountId_actorUserId_requestKind_clientRequestId:{accountId:input.accountId,actorUserId:user.id,requestKind:"MISSING_LISTING_RESOLUTION",clientRequestId:input.clientRequestId}},data:{status:"COMPLETED",resultJson:JSON.stringify(result),completedAt:new Date()}});return result;
  });
}
