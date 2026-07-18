import type { Account, Prisma, ProcessRoute, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";
import { maskOperationalKey } from "@/lib/import/issues";
import { setImportJobBatch, updateImportJobProgress } from "@/src/lib/import-jobs/store";
import { normalizeListingIdentifier, syncIdentifiersForImportedListings } from "@/src/lib/marking/identifiers";
import { createWorkRouteSnapshot } from "@/src/lib/workflow/dynamic-route";
import { createImmutableRouteProvenance } from "@/src/lib/workflow/route-provenance";
import { refreshAffectedWorkGroups } from "@/src/lib/workflow/work-group-projection";
import { buildFlipkartListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { findHeaderProfile, saveHeaderProfile } from "@/src/lib/imports/header-profiles";
import {
  chunkFlipkartListingRows,
  dedupeFlipkartListingRows,
  flipkartListingIsInactive,
  flipkartListingMasterData,
  sameFlipkartListingMaster
} from "./listing-master";
import {
  flipkartInternalOrderKey,
  parseFlipkartListingRows,
  parseFlipkartOrderRows,
  type FlipkartOrderLine,
  type FlipkartParseIssue,
  type FlipkartRawRow
} from "./parser";
import { dedupeFlipkartOrderRows, flipkartIssueRawContext, flipkartOrderMappingIssue } from "./review";

const FLIPKART_LISTING_CREATE_BATCH_SIZE = 100;
const FLIPKART_LISTING_UPDATE_BATCH_SIZE = 50;

type ExistingFlipkartOrder = {
  id: string;
  awb: string;
  sku: string;
  qty: number;
  orderNo: string;
  productDescription: string | null;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  shipmentId: string | null;
  orderItemId: string | null;
  fsn: string | null;
  trackingId: string | null;
};

function orderNotes(result: {
  parser: "flipkart-orders-xlsx";
  parsedRows: number;
  importableRows: number;
  heldRows: number;
  missingImageRows: number;
  alreadyImportedRows?: number;
  repeatedSourceRows?: number;
  conflictingRows?: number;
}) {
  return JSON.stringify({
    marketplace: "FLIPKART",
    ...result
  });
}

function sameOrder(existing: ExistingFlipkartOrder, order: FlipkartOrderLine, imageUrl: string | null) {
  return (
    existing.sku === normalizeSkuForMatching(order.sku) &&
    existing.qty === (order.quantity ?? 1) &&
    existing.orderNo === (order.orderId ?? order.shipmentId ?? existing.awb) &&
    (existing.productDescription ?? "") === (order.productTitle ?? "") &&
    (existing.city ?? "") === (order.city ?? "") &&
    (existing.state ?? "") === (order.state ?? "") &&
    (existing.imageUrl ?? "") === (imageUrl ?? "") &&
    (existing.shipmentId ?? "") === (order.shipmentId ?? "") &&
    (existing.orderItemId ?? "") === (order.orderItemId ?? "") &&
    (existing.fsn ?? "") === (order.fsn ?? "") &&
    (existing.trackingId ?? "") === (order.trackingId ?? "")
  );
}

async function writeIssues(batchId: string, issues: FlipkartParseIssue[]) {
  if (issues.length === 0) {
    return;
  }

  await prisma.importRowIssue.createMany({
    data: issues.map((issue) => {
      const context = flipkartIssueRawContext(issue.rawData);
      return {
        batchId,
        rowNumber: issue.rowNumber,
        issueType: issue.issueType,
        message: issue.message,
        rawData: null,
        safeDataJson: JSON.stringify({
          rowNumber: issue.rowNumber,
          sellerSku: context.sku ?? null,
          shipmentId: maskOperationalKey(context.shipmentId),
          orderItemId: maskOperationalKey(context.orderItemId),
          trackingId: maskOperationalKey(context.trackingId),
          issueCode: issue.issueType,
          ...(issue.safeData ?? {})
        }),
        severity: issue.severity ?? "WARNING",
        sourceType: issue.sourceType ?? null,
        sourceId: issue.sourceId ?? null
      };
    })
  });
}

export async function importFlipkartOrderRows(input: {
  rows: FlipkartRawRow[];
  fileName: string;
  account: Account;
  user: User;
  request?: RequestMeta;
  jobId?: string;
  runnerId?: string;
  assertLease?: () => Promise<void>;
}) {
  await input.assertLease?.();
  const parsed = parseFlipkartOrderRows(input.rows, input.fileName);
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.account.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "ORDER_LABEL",
      status: "UPLOADED",
      totalRows: input.rows.length,
      notes: orderNotes({
        parser: "flipkart-orders-xlsx",
        parsedRows: input.rows.length,
        importableRows: parsed.orders.length,
        heldRows: parsed.issues.length,
        missingImageRows: 0
      })
    }
  });
  if (input.jobId) {
    await setImportJobBatch(input.jobId, batch.id, input.runnerId);
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: 0,
      errorRows: parsed.issues.length,
      warningRows: 0
    }, input.runnerId);
  }
  const duplicateIssues: FlipkartParseIssue[] = [];
  const deduped = dedupeFlipkartOrderRows(parsed.orders);
  duplicateIssues.push(...deduped.duplicateIssues);
  const importableOrders = deduped.importableOrders;
  const internalKeys = importableOrders.map((order) => flipkartInternalOrderKey(order)).filter((key): key is string => Boolean(key));
  const orderSkus = Array.from(
    new Set(importableOrders.flatMap((order) => [order.sku, normalizeSkuForMatching(order.sku)].filter((sku): sku is string => Boolean(sku))))
  );
  const orderFsns=Array.from(new Set(importableOrders.map(order=>order.fsn).filter((value):value is string=>Boolean(value))));
  const normalizedOrderIdentifiers=[...new Set([...orderSkus.map(value=>normalizeListingIdentifier("SELLER_SKU",value)),...orderSkus.map(value=>normalizeListingIdentifier("INTERNAL_SKU",value)),...orderFsns.map(value=>normalizeListingIdentifier("FSN",value))].filter((value):value is string=>Boolean(value)))];
  const [existingOrders, listings] = await Promise.all([
    prisma.order.findMany({
      where: {
        accountId: input.account.id,
        awb: { in: internalKeys }
      },
      select: {
        id: true,
        batchId: true,
        awb: true,
        sku: true,
        qty: true,
        orderNo: true,
        productDescription: true,
        city: true,
        state: true,
        imageUrl: true,
        shipmentId: true,
        orderItemId: true,
        fsn: true,
        trackingId: true,
        workTasks:{select:{id:true,status:true,completedQuantity:true,assignedUserId:true,startedAt:true,stage:true}}
      }
    }),
    prisma.marketplaceListing.findMany({
      where: {
        accountId: input.account.id,
        marketplace: "FLIPKART",
        OR: [
          { sku: { in: orderSkus } },
          { sellerSkuId: { in: orderSkus } },
          { fsn: { in: orderFsns } },
          { identifiers: { some: { normalizedValue: { in: normalizedOrderIdentifiers }, active: true } } }
        ]
      },
      select: {
        id: true,
        sellerSkuId: true,
        sku: true,
        mainImageUrl: true,
        productTitle: true,
        fsn: true,
        listingId: true,
        liveBrand: true,
        liveCategory: true,
        identifiers:{where:{active:true},select:{identifierType:true,normalizedValue:true}},
        processRules: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, route: true, updatedAt: true, markingRequired: true, assemblyRequired: true, assemblyTitle: true, assemblyInstructions: true, assemblyImageUrl: true, markingAssetId: true, markingAsset: { select: { id: true, name: true, masterDesignId: true, material: true, markingPosition: true, markingWidthMm: true, markingHeightMm: true, powerSetting: true, speedSetting: true, frequencySetting: true, passes: true, instructions: true } } } }
      }
    })
  ]);
  const existingByKey = new Map(existingOrders.map((order) => [order.awb, order]));
  const candidateIndex=new Map<string,typeof listings>();const addCandidate=(type:string,normalized:string|null,listing:(typeof listings)[number])=>{if(!normalized)return;const key=`${type}:${normalized}`,values=candidateIndex.get(key)??[];if(!values.some(item=>item.id===listing.id))candidateIndex.set(key,[...values,listing]);};for(const listing of listings){addCandidate("SELLER_SKU",normalizeListingIdentifier("SELLER_SKU",listing.sellerSkuId),listing);addCandidate("INTERNAL_SKU",normalizeListingIdentifier("INTERNAL_SKU",listing.sku),listing);addCandidate("FSN",normalizeListingIdentifier("FSN",listing.fsn),listing);for(const identifier of listing.identifiers)addCandidate(identifier.identifierType,identifier.normalizedValue,listing);}
  const listingMatch=(order:FlipkartOrderLine)=>{const priorities=[["SELLER_SKU",order.sku],["INTERNAL_SKU",order.sku],["FSN",order.fsn]] as const;for(const[type,value]of priorities){const normalized=normalizeListingIdentifier(type,value),candidates=normalized?candidateIndex.get(`${type}:${normalized}`)??[]:[];if(candidates.length===1)return{listing:candidates[0],status:"EXACT_UNIQUE" as const};if(candidates.length>1)return{listing:null,status:"EXACT_MULTIPLE" as const,candidates};}return{listing:null,status:"NOT_FOUND" as const};};
  let createdRows = 0;
  let updatedRows = 0;
  let alreadyImportedRows = 0;
  let missingImageRows = 0;
  let processedRows = parsed.issues.length + duplicateIssues.length + deduped.repeatedSourceRows;
  const mappingIssues: FlipkartParseIssue[] = [];
  const pickTaskCandidates: Prisma.WorkTaskCreateManyInput[] = [];

  await writeIssues(batch.id, [...parsed.issues.map(issue=>({...issue,severity:"BLOCKING_ERROR" as const})), ...duplicateIssues]);
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      processedRows,
      duplicateRows: duplicateIssues.length + deduped.repeatedSourceRows,
      warningRows: 0,
      errorRows: parsed.issues.length + duplicateIssues.length
    }, input.runnerId);
  }

  for (const order of importableOrders) {
    await input.assertLease?.();
    const internalKey = flipkartInternalOrderKey(order);

    if (!internalKey) {
      continue;
    }

    const sku = normalizeSkuForMatching(order.sku);
    const matched=listingMatch(order),listing=matched.listing;
    const imageUrl = listing?.mainImageUrl ?? null;

    const mappingIssue = matched.status==="EXACT_MULTIPLE"?{rowNumber:order.rowNumber,issueType:"AMBIGUOUS_LISTING",severity:"BLOCKING_ERROR" as const,message:`Multiple account listings match Seller SKU or FSN for ${sku}; owner selection is required.`,rawData:order.rawData??{},safeData:{listingIds:matched.candidates.map(candidate=>candidate.id)}}:flipkartOrderMappingIssue(order, {
      listingFound: Boolean(listing),
      hasMainImage: Boolean(listing?.mainImageUrl)
    });

    if (mappingIssue?.issueType === "FLIPKART_LISTING_IMAGE_MISSING") missingImageRows += 1;

    const existing = existingByKey.get(internalKey);
    const orderData = {
      accountId: input.account.id,
      batchId: existing?.batchId ?? batch.id,
      marketplace: "FLIPKART",
      shipmentId: order.shipmentId ?? null,
      orderItemId: order.orderItemId ?? null,
      fsn: order.fsn ?? null,
      trackingId: order.trackingId ?? null,
      awb: internalKey,
      courier: null,
      sku,
      qty: order.quantity ?? 1,
      color: null,
      size: null,
      orderNo: order.orderId ?? order.shipmentId ?? internalKey,
      productDescription: order.productTitle ?? null,
      paymentType: "UNKNOWN" as const,
      city: order.city ?? null,
      state: order.state ?? null,
      imageUrl
    };

    let persistedOrderId: string,pendingOrderUpdate=false,unchangedExisting=false;
    if (!existing) {
      persistedOrderId=(await prisma.order.create({ data: orderData,select:{id:true} })).id;
      createdRows += 1;
    } else if (sameOrder(existing, order, imageUrl)) {
      persistedOrderId=existing.id;
      alreadyImportedRows += 1;
      unchangedExisting=true;
    } else {
      const operationalChanged=existing.batchId!==orderData.batchId||existing.sku!==orderData.sku||existing.qty!==orderData.qty||existing.trackingId!==orderData.trackingId||existing.shipmentId!==orderData.shipmentId||existing.orderItemId!==orderData.orderItemId;
      const workStarted=existing.workTasks.some(task=>task.status==="IN_PROGRESS"||task.status==="COMPLETED"||task.status==="PROBLEM"||task.completedQuantity>0||task.assignedUserId||task.startedAt);
      if(operationalChanged&&workStarted){persistedOrderId=existing.id;if(!existing.productDescription&&orderData.productDescription)await prisma.order.update({where:{id:existing.id},data:{productDescription:orderData.productDescription}});mappingIssues.push({rowNumber:order.rowNumber,issueType:"ACTIVE_WORK_IDENTITY_CONFLICT",severity:"BLOCKING_ERROR",message:"Order identity, SKU, Tracking ID or quantity changed after workflow started. Existing operational identity and immutable tasks were preserved; safe missing descriptive data was enriched for owner review.",rawData:order.rawData??{},sourceType:"ORDER",sourceId:existing.id});processedRows+=1;continue;}
      if(!operationalChanged&&workStarted){persistedOrderId=existing.id;const enrichment={...(!existing.productDescription&&orderData.productDescription?{productDescription:orderData.productDescription}:{}),...(!existing.imageUrl&&orderData.imageUrl?{imageUrl:orderData.imageUrl}:{})};if(Object.keys(enrichment).length){await prisma.order.update({where:{id:existing.id},data:enrichment});updatedRows+=1;}else alreadyImportedRows+=1;if(mappingIssue)mappingIssues.push({...mappingIssue,sourceType:"ORDER",sourceId:existing.id,safeData:{...(mappingIssue.safeData??{}),accountId:input.account.id,marketplace:"FLIPKART",sellerSku:sku,orderId:existing.id,fsn:order.fsn??null}});processedRows+=1;continue;}
      persistedOrderId=existing.id;
      pendingOrderUpdate=true;
      updatedRows += 1;
    }

    if (mappingIssue && !unchangedExisting) {
      mappingIssues.push({ ...mappingIssue, sourceType: "ORDER", sourceId: persistedOrderId, safeData: { ...(mappingIssue.safeData ?? {}), accountId: input.account.id, marketplace: "FLIPKART", sellerSku: sku, orderId: persistedOrderId, fsn: order.fsn ?? null } });
    }
    // Missing catalog identity is retained as an Order plus a resolvable issue,
    // but it must not enter an actionable worker queue until an owner links or
    // creates the listing.
    if (!listing) { processedRows += 1; continue; }

    const savedRule=listing.processRules[0]??null,route=(savedRule?.route??"PICK_PACK") as ProcessRoute,provenance=createImmutableRouteProvenance({route,rule:savedRule});
    pickTaskCandidates.push({accountId:input.account.id,sourceType:"ORDER",orderId:persistedOrderId,stage:"PICK",sequenceNumber:1,requiredQuantity:order.quantity??1,status:"READY",metadataJson:JSON.stringify({version:1,recommendedProcessRoute:route}),workCardSnapshotJson:JSON.stringify({version:2,productTitle:listing?.productTitle??order.productTitle??null,primaryImage:listing?.mainImageUrl??null,sellerSku:sku,operationalBarcode:order.trackingId??internalKey,marketplaceIdentifiers:{fsn:order.fsn??listing?.fsn??null,listingId:listing?.listingId??null,orderItemId:order.orderItemId??null,trackingId:order.trackingId??null},category:listing?.liveCategory??null,brand:listing?.liveBrand??null,variantIdentity:null,...provenance}),routeSnapshotJson:JSON.stringify({...createWorkRouteSnapshot({processRoute:route,currentStage:"PICK"}),...provenance})});
    const candidate=pickTaskCandidates[pickTaskCandidates.length-1];if(existing&&candidate&&pendingOrderUpdate){await prisma.$transaction(async tx=>{await tx.order.update({where:{id:existing.id},data:orderData});const tasks=await tx.workTask.updateMany({where:{orderId:existing.id,status:{in:["LOCKED","READY"]},completedQuantity:0,assignedUserId:null,startedAt:null},data:{requiredQuantity:candidate.requiredQuantity,workCardSnapshotJson:candidate.workCardSnapshotJson,routeSnapshotJson:candidate.routeSnapshotJson,version:{increment:1}}});if(tasks.count===0)throw new Error("Order workflow task is missing or changed; the reimport was rolled back for owner review.");const changed=await tx.workTask.findMany({where:{orderId:existing.id},select:{id:true}});await refreshAffectedWorkGroups({accountId:input.account.id,sourceType:"ORDER",stages:["PICK"],taskIds:changed.map(task=>task.id),orderIds:[existing.id]},tx);await tx.workChangeEvent.create({data:{accountId:input.account.id,eventType:"ORDER_IMPORT_REFRESHED",sourceType:"ORDER",stage:"PICK",entityId:existing.id}});});}

    processedRows += 1;
    if (input.jobId && processedRows % 500 === 0) {
      await updateImportJobProgress(input.jobId, {
        processedRows,
        createdRows,
        updatedRows,
        unchangedRows: alreadyImportedRows,
        duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
        warningRows: parsed.issues.length + duplicateIssues.length + missingImageRows,
        errorRows: parsed.issues.length,
        missingListingRows: mappingIssues.filter((issue) => issue.issueType === "MISSING_FLIPKART_LISTING_MAPPING").length,
        missingImageRows
      }, input.runnerId);
    }
  }

  const candidateOrderIds=pickTaskCandidates.flatMap(task=>task.orderId?[task.orderId]:[]),existingPicks=candidateOrderIds.length?await prisma.workTask.findMany({where:{orderId:{in:candidateOrderIds},stage:"PICK"},select:{orderId:true}}):[],existingPickOrderIds=new Set(existingPicks.flatMap(task=>task.orderId?[task.orderId]:[])),missingPicks=pickTaskCandidates.filter(task=>task.orderId&&!existingPickOrderIds.has(task.orderId));
  for(let index=0;index<missingPicks.length;index+=500){const chunk=missingPicks.slice(index,index+500),orderIds=chunk.flatMap(task=>task.orderId?[task.orderId]:[]);await prisma.$transaction(async tx=>{await tx.workTask.createMany({data:chunk});const tasks=await tx.workTask.findMany({where:{orderId:{in:orderIds},stage:"PICK"},select:{id:true}});await refreshAffectedWorkGroups({accountId:input.account.id,sourceType:"ORDER",stages:["PICK"],taskIds:tasks.map(task=>task.id),orderIds},tx);await tx.workChangeEvent.create({data:{accountId:input.account.id,eventType:"ORDER_IMPORT_CREATED",sourceType:"ORDER",stage:"PICK"}});});}

  await writeIssues(batch.id, mappingIssues);

  const identityConflictRows=mappingIssues.filter(issue=>issue.issueType==="ACTIVE_WORK_IDENTITY_CONFLICT").length;
  const duplicateConflictRows=duplicateIssues.filter(issue=>issue.issueType==="DUPLICATE_IDENTITY_CONFLICT").length;
  const blockingMappingRows=mappingIssues.filter(issue=>issue.severity==="BLOCKING_ERROR").length;
  const errorRows = parsed.issues.length+duplicateConflictRows+blockingMappingRows;
  const reviewRows = parsed.issues.length + duplicateIssues.length + mappingIssues.length;
  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: reviewRows > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
      alreadyImportedRows,
      repeatedSourceRows: deduped.repeatedSourceRows,
      informationRows: alreadyImportedRows + deduped.repeatedSourceRows,
      warningRows: missingImageRows,
      blockingErrorRows: errorRows,
      missingImageRows,
      skippedRows: alreadyImportedRows + deduped.repeatedSourceRows + duplicateIssues.length + parsed.issues.length + blockingMappingRows,
      errorRows,
      notes: orderNotes({
        parser: "flipkart-orders-xlsx",
        parsedRows: input.rows.length,
        importableRows: importableOrders.length,
        heldRows: errorRows,
        missingImageRows,
        alreadyImportedRows,
        repeatedSourceRows: deduped.repeatedSourceRows,
        conflictingRows: duplicateConflictRows + identityConflictRows
      })
    }
  });
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: input.rows.length,
      createdRows,
      updatedRows,
      unchangedRows: alreadyImportedRows,
      duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
      warningRows: reviewRows,
      errorRows,
      missingListingRows: mappingIssues.filter((issue) => issue.issueType === "MISSING_FLIPKART_LISTING_MAPPING").length,
      missingImageRows
    }, input.runnerId);
  }

  await recordAuditLog({
    userId: input.user.id,
    accountId: input.account.id,
    action: "FLIPKART_ORDER_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows,
      updatedRows,
      duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
      alreadyImportedRows,
      repeatedSourceRows: deduped.repeatedSourceRows,
      missingImageRows,
      errorRows
    },
    request: input.request
  });

  return updatedBatch;
}

export async function importFlipkartListingRows(input: {
  rows: FlipkartRawRow[];
  fileName: string;
  account: Account;
  user: User;
  request?: RequestMeta;
  jobId?: string;
  runnerId?: string;
  assertLease?: () => Promise<void>;
}) {
  await input.assertLease?.();
  const parsed = parseFlipkartListingRows(input.rows, input.fileName);
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.account.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "SKU_IMAGE",
      status: "UPLOADED",
      totalRows: input.rows.length,
      notes: JSON.stringify({
        marketplace: "FLIPKART",
        parser: "flipkart-listings-xlsx"
      })
    }
  });
  const sourceHeaders=Object.keys(input.rows[0]??{}),formSchema=buildFlipkartListingFormSchema(sourceHeaders);
  if(formSchema){const matched=await findHeaderProfile({accountId:input.account.id,marketplace:"FLIPKART",importPurpose:"PRODUCT_CATALOG",headers:sourceHeaders});const profile=matched.state==="MATCHED"?matched.profile:await saveHeaderProfile({actorUserId:input.user.id,accountId:input.account.id,marketplace:"FLIPKART",importPurpose:"PRODUCT_CATALOG",profileName:"Flipkart Main Listing Report",headers:sourceHeaders,mapping:Object.fromEntries(formSchema.fields.filter(field=>field.commonFieldTarget).map(field=>[field.canonicalKey,field.originalHeader])),requiredFields:["sellerSku"],optionalFields:formSchema.fields.filter(field=>field.canonicalKey!=="sellerSku").map(field=>field.canonicalKey),formSchema:formSchema as unknown as Record<string,unknown>,technicalHeaderFingerprint:formSchema.technicalHeaderFingerprint,humanHeaderFingerprint:formSchema.humanHeaderFingerprint,templateKind:formSchema.templateKind,fieldGroups:formSchema.groups});await prisma.uploadBatch.update({where:{id:batch.id},data:{fileProfileId:profile.id}});}
  if (input.jobId) {
    await setImportJobBatch(input.jobId, batch.id, input.runnerId);
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: 0,
      errorRows: parsed.issues.length,
      warningRows: parsed.issues.length
    }, input.runnerId);
  }
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let missingImageRows = 0;
  let inactiveListings = 0;
  const deduped = dedupeFlipkartListingRows(parsed.listings);
  const issues = [...parsed.issues, ...deduped.duplicateIssues];
  const importedAt = new Date();
  const listingDrafts = deduped.importableListings.map((listing) => ({
    listing,
    data: flipkartListingMasterData(listing)
  }));
  const missingImageIssues: FlipkartParseIssue[] = [];
  let processedRows = parsed.issues.length + deduped.duplicateIssues.length;

  await writeIssues(batch.id, issues);
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      processedRows,
      duplicateRows: deduped.duplicateIssues.length,
      warningRows: deduped.duplicateIssues.length,
      errorRows: parsed.issues.length
    }, input.runnerId);
  }

  for (const chunk of chunkFlipkartListingRows(listingDrafts)) {
    await input.assertLease?.();
    const listingSkus = Array.from(new Set(chunk.map((draft) => draft.data.sku).filter(Boolean)));
    const existingListings = await prisma.marketplaceListing.findMany({
      where: {
        accountId: input.account.id,
        marketplace: "FLIPKART",
        sku: { in: listingSkus }
      }
    });
    const existingBySku = new Map(existingListings.map((existingListing) => [normalizeSkuForMatching(existingListing.sku), existingListing]));
    const createRows: Prisma.MarketplaceListingCreateManyInput[] = [];
    const updateOperations: Prisma.PrismaPromise<unknown>[] = [];
    const unchangedListingIds: string[] = [];

    for (const { listing, data } of chunk) {
      const sku = data.sku;

      if (flipkartListingIsInactive(listing)) {
        inactiveListings += 1;
      }

      if (!data.mainImageUrl) {
        missingImageRows += 1;
        missingImageIssues.push({
          rowNumber: listing.rowNumber,
          issueType: "MISSING_IMAGE_URL",
          message: `No valid image URL found for Flipkart SKU ${sku}.`,
          rawData: listing.rawData
        });
      }

      const existing = existingBySku.get(sku);
      const listingData = {
        ...data,
        accountId: input.account.id,
        lastImportedAt: importedAt
      };

      if (!existing) {
        createRows.push(listingData);
      } else if (sameFlipkartListingMaster(existing, data)) {
        unchangedListingIds.push(existing.id);
      } else {
        updateOperations.push(prisma.marketplaceListing.update({
          where: { id: existing.id },
          data: listingData
        }));
      }
    }

    for (const createChunk of chunkFlipkartListingRows(createRows, FLIPKART_LISTING_CREATE_BATCH_SIZE)) {
      const result = await prisma.marketplaceListing.createMany({
        data: createChunk
      });
      createdRows += result.count;
    }

    for (const unchangedChunk of chunkFlipkartListingRows(unchangedListingIds, FLIPKART_LISTING_CREATE_BATCH_SIZE)) {
      const result = await prisma.marketplaceListing.updateMany({
        where: { id: { in: unchangedChunk } },
        data: { lastImportedAt: importedAt }
      });
      skippedRows += result.count;
    }

    for (const updateChunk of chunkFlipkartListingRows(updateOperations, FLIPKART_LISTING_UPDATE_BATCH_SIZE)) {
      const result = await prisma.$transaction(updateChunk);
      updatedRows += result.length;
    }

    processedRows += chunk.length;
    if (input.jobId) {
      await updateImportJobProgress(input.jobId, {
        processedRows,
        createdRows,
        updatedRows,
        unchangedRows: skippedRows,
        duplicateRows: deduped.duplicateIssues.length,
        warningRows: deduped.duplicateIssues.length + missingImageRows,
        errorRows: parsed.issues.length,
        missingImageRows
      }, input.runnerId);
    }
  }

  const identifierSync = await syncIdentifiersForImportedListings({ accountId: input.account.id, importedAt });
  await writeIssues(batch.id, missingImageIssues);

  const allIssues = [...issues, ...missingImageIssues];
  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: allIssues.length > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      duplicateRows: deduped.duplicateIssues.length,
      skippedRows,
      missingImageRows,
      errorRows: parsed.issues.length,
      notes: JSON.stringify({
        marketplace: "FLIPKART",
        parser: "flipkart-listings-xlsx",
        listingMaster: true,
        inactiveListings
      })
    }
  });
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: input.rows.length,
      createdRows,
      updatedRows,
      unchangedRows: skippedRows,
      duplicateRows: deduped.duplicateIssues.length,
      warningRows: deduped.duplicateIssues.length + missingImageRows,
      errorRows: parsed.issues.length,
      missingImageRows
    }, input.runnerId);
  }

  await recordAuditLog({
    userId: input.user.id,
    accountId: input.account.id,
    action: "FLIPKART_LISTING_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows,
      updatedRows,
      skippedRows,
      missingImageRows,
      inactiveListings,
      syncedIdentifiers: identifierSync.syncedIdentifiers,
      errorRows: allIssues.length
    },
    request: input.request
  });

  return updatedBatch;
}
