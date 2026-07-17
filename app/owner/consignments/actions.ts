"use server";

import { ProcessRoute } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth";
import { requireConsignmentAccess } from "@/lib/consignment-auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { requireWorkPermission } from "@/lib/work-permissions";
import { importFlipkartConsignmentDraft } from "@/src/lib/consignments/import-service";
import { importAmazonConsignmentDraft } from "@/src/lib/consignments/amazon/import-service";
import { requireAmazonShipmentCandidate } from "@/src/lib/consignments/amazon/candidate-policy";
import { validateStoredAmazonReparseManifest } from "@/src/lib/consignments/amazon/limits";
import { resolveExistingConsignmentPath } from "@/src/lib/consignments/storage";
import { setActiveProcessRule } from "@/src/lib/marking/process-rules";
import { activateConsignmentBatch, validateConsignmentActivation } from "@/src/lib/workflow/task-store";

function value(formData: FormData, name: string, max = 500) {
  return String(formData.get(name) ?? "").normalize("NFKC").trim().slice(0, max);
}

async function refreshReviewState(batchId: string, accountId: string) {
  const batch = await prisma.consignmentBatch.findFirst({ where: { id: batchId, accountId }, select: { status: true } });
  if (!batch || ["ACTIVE", "COMPLETED", "CANCELLED"].includes(batch.status)) return;
  const [validation, lines] = await Promise.all([
    validateConsignmentActivation(batchId, accountId),
    prisma.consignmentLine.findMany({ where: { consignmentBatchId: batchId, accountId }, select: { requiredQuantity: true, marketplaceListingId: true, matchStatus: true, processRoute: true } })
  ]);
  await prisma.consignmentBatch.update({ where: { id: batchId }, data: {
    status: validation.problems.length ? "REVIEW_REQUIRED" : "READY_TO_ACTIVATE",
    totalValidLines: lines.length,
    totalRequiredQuantity: lines.reduce((sum, line) => sum + line.requiredQuantity, 0),
    matchedLines: lines.filter((line) => line.marketplaceListingId).length,
    unmatchedLines: lines.filter((line) => line.matchStatus === "NOT_FOUND").length,
    ambiguousLines: lines.filter((line) => line.matchStatus === "EXACT_MULTIPLE").length,
    conflictLines: lines.filter((line) => line.matchStatus === "IDENTIFIER_CONFLICT").length,
    markingLines: lines.filter((line) => line.processRoute === "PICK_MARK_PACK").length,
    readyMadeLines: lines.filter((line) => line.processRoute === "PICK_PACK").length
  } });
}

export async function uploadConsignmentAction(formData: FormData) {
  const user = await requireConsignmentAccess("import");
  const account = await requireAccount(user);
  const files = formData.getAll("file").filter((item): item is File => item instanceof File && item.size > 0);
  const file = files[0];
  if (!file) redirect("/owner/consignments/new?error=file");
  try {
    const common = {
      accountId: account.id,
      user,
      externalConsignmentNumber: value(formData, "externalConsignmentNumber", 100),
      displayName: value(formData, "displayName", 160),
      destinationText: value(formData, "destinationText", 500),
      request: await getRequestMeta()
    };
    const result = account.marketplace === "AMAZON" ? await importAmazonConsignmentDraft({ ...common, files }) : await importFlipkartConsignmentDraft({ ...common, file });
    if("mappingJobId" in result&&result.mappingJobId)redirect(`/owner/imports/${result.mappingJobId}/mapping`);
    redirect(`/owner/consignments/${result.batchId}/review`);
  } catch (error) {
    redirect(`/owner/consignments/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Import failed.")}`);
  }
}

async function reparseFromManagedFile(input: { batchId: string; fileName: string; managedRelativePath: string; user: Awaited<ReturnType<typeof requireWorkPermission>>; accountId: string }) {
  const batch = await prisma.consignmentBatch.findFirst({ where: { id: input.batchId, accountId: input.accountId, status: { in: ["DRAFT", "PARSING", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "FAILED"] } } });
  if (!batch) throw new Error("Draft consignment is not available for reparse.");
  const data = await readFile(await resolveExistingConsignmentPath(input.managedRelativePath));
  const file = new File([data], input.fileName);
  const common = { accountId: input.accountId, user: input.user, externalConsignmentNumber: batch.externalConsignmentNumber, displayName: batch.displayName, destinationText: batch.destinationText ?? undefined, existingBatchId: batch.id, request: await getRequestMeta() };
  return batch.marketplace === "AMAZON" ? importAmazonConsignmentDraft({ ...common, files: [file] }) : importFlipkartConsignmentDraft({ ...common, file });
}

async function reparseAmazonStoredBatch(input:{batchId:string;accountId:string;user:Awaited<ReturnType<typeof requireWorkPermission>>;selectedCandidate?:{fileId:string;tableName:string}}){
  const batch=await prisma.consignmentBatch.findFirst({where:{id:input.batchId,accountId:input.accountId,marketplace:"AMAZON",status:{in:["DRAFT","PARSING","REVIEW_REQUIRED","READY_TO_ACTIVATE","FAILED"]}}});if(!batch)throw new Error("Amazon draft is unavailable for reparse.");
  const stored=await prisma.consignmentImportFile.findMany({where:{consignmentBatchId:batch.id,managedRelativePath:{not:null},supersededAt:null},orderBy:[{createdAt:"asc"},{id:"asc"}]});validateStoredAmazonReparseManifest(stored);const files:File[]=[];const storedFileIds:string[]=[];
  for(const item of stored){if(!item.managedRelativePath)continue;const data=await readFile(await resolveExistingConsignmentPath(item.managedRelativePath));files.push(new File([data],item.originalFileName));storedFileIds.push(item.id);}
  if(!files.length)throw new Error("Stored Amazon source files are unavailable.");
  return importAmazonConsignmentDraft({accountId:input.accountId,user:input.user,externalConsignmentNumber:batch.externalConsignmentNumber,displayName:batch.displayName,destinationText:batch.destinationText??undefined,existingBatchId:batch.id,files,storedFileIds,selectedCandidate:input.selectedCandidate,request:await getRequestMeta()});
}

export async function selectConsignmentMainFileAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments"); const account = await requireAccount(user); const batchId = value(formData, "batchId", 80); const fileId = value(formData, "fileId", 80);const tableName=value(formData,"tableName",100);
  const file = await prisma.consignmentImportFile.findFirst({ where: { id: fileId, consignmentBatchId: batchId, consignmentBatch: { accountId: account.id }, fileType: { in: ["CONSIGNMENT_DETAILS", "AMAZON_SHIPMENT"] }, managedRelativePath: { not: null } } });
  if (!file?.managedRelativePath) redirect(`/owner/consignments/${batchId}?error=file`);
  try { if(account.marketplace==="AMAZON"){if(!tableName)throw new Error("Choose an Amazon shipment worksheet.");requireAmazonShipmentCandidate(file.candidateTablesJson,tableName);await reparseAmazonStoredBatch({batchId,accountId:account.id,user,selectedCandidate:{fileId,tableName}});}else await reparseFromManagedFile({ batchId, fileName: file.originalFileName, managedRelativePath: file.managedRelativePath, user, accountId: account.id }); redirect(`/owner/consignments/${batchId}/review`); }
  catch (error) { redirect(`/owner/consignments/${batchId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Reparse failed.")}`); }
}

export async function reparseConsignmentAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments"); const account = await requireAccount(user); const batchId = value(formData, "batchId", 80);
  const batch = await prisma.consignmentBatch.findFirst({ where: { id: batchId, accountId: account.id }, select: { sourceFileName: true, sourceUploadRelativePath: true } });
  if (!batch?.sourceUploadRelativePath) redirect(`/owner/consignments/${batchId}?error=file`);
  try { if(account.marketplace==="AMAZON"){const current=await prisma.consignmentImportFile.findFirst({where:{consignmentBatchId:batchId,isCurrentSource:true,selectedTableName:{not:null}},select:{id:true,selectedTableName:true}});await reparseAmazonStoredBatch({batchId,accountId:account.id,user,selectedCandidate:current?.selectedTableName?{fileId:current.id,tableName:current.selectedTableName}:undefined});}else await reparseFromManagedFile({ batchId, fileName: batch.sourceFileName, managedRelativePath: batch.sourceUploadRelativePath, user, accountId: account.id }); redirect(`/owner/consignments/${batchId}/review`); }
  catch (error) { redirect(`/owner/consignments/${batchId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Reparse failed.")}`); }
}

export async function replaceConsignmentSourceAction(formData: FormData) {
  const user = await requireConsignmentAccess("import"); const account = await requireAccount(user); const batchId = value(formData, "batchId", 80); const file = formData.get("file");
  if (!(file instanceof File)) redirect(`/owner/consignments/${batchId}?error=file`);
  const batch = await prisma.consignmentBatch.findFirst({ where: { id: batchId, accountId: account.id, status: { in: ["DRAFT", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "FAILED"] } } });
  if (!batch) redirect(`/owner/consignments/${batchId}?error=not-replaceable`);
  try { const common={accountId:account.id,user,externalConsignmentNumber:batch.externalConsignmentNumber,displayName:batch.displayName,destinationText:batch.destinationText??undefined,existingBatchId:batch.id,request:await getRequestMeta()}; if(batch.marketplace==="AMAZON")await importAmazonConsignmentDraft({...common,files:[file]});else await importFlipkartConsignmentDraft({...common,file}); redirect(`/owner/consignments/${batchId}/review`); }
  catch (error) { redirect(`/owner/consignments/${batchId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Replacement failed.")}`); }
}

export async function selectConsignmentListingAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments");
  const account = await requireAccount(user);
  const lineId = value(formData, "lineId", 80);
  const listingId = value(formData, "listingId", 80);
  const batchId = value(formData, "batchId", 80);
  const [line, listing] = await Promise.all([
    prisma.consignmentLine.findFirst({ where: { id: lineId, consignmentBatchId: batchId, accountId: account.id, activated: false }, select: { id: true } }),
    prisma.marketplaceListing.findFirst({ where: { id: listingId, accountId: account.id, marketplace: account.marketplace }, include: { processRules: { where: { active: true }, take: 1 } } })
  ]);
  if (!line || !listing) redirect(`/owner/consignments/${batchId}/review?error=forbidden`);
  const rule = listing.processRules[0];
  await prisma.consignmentLine.update({ where: { id: line.id }, data: { marketplaceListingId: listing.id, matchStatus: "OWNER_SELECTED", matchIdentifierType: "SELLER_SKU", matchIdentifierValue: listing.sellerSkuId, matchMessage: "Listing selected by owner.", processRoute: rule?.route ?? null, processRuleId: rule?.id ?? null, markingAssetId: rule?.markingAssetId ?? null } });
  await prisma.consignmentImportIssue.updateMany({ where: { consignmentLineId: line.id, issueType: { in: ["NOT_FOUND", "EXACT_MULTIPLE", "IDENTIFIER_CONFLICT"] }, resolved: false }, data: { resolved: true, resolvedAt: new Date(), resolvedByUserId: user.id } });
  await recordAuditLog({ userId: user.id, accountId: account.id, action: "CONSIGNMENT_LISTING_MATCH_SELECTED", entityType: "ConsignmentLine", entityId: line.id, metadata: { batchId, listingId: listing.id }, request: await getRequestMeta() });
  await refreshReviewState(batchId, account.id);
  revalidatePath(`/owner/consignments/${batchId}/review`);
  redirect(`/owner/consignments/${batchId}/review?updated=1`);
}

export async function clearConsignmentListingAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments");
  const account = await requireAccount(user);
  const lineId = value(formData, "lineId", 80);
  const batchId = value(formData, "batchId", 80);
  await prisma.consignmentLine.updateMany({ where: { id: lineId, consignmentBatchId: batchId, accountId: account.id, activated: false }, data: { marketplaceListingId: null, matchStatus: "NOT_FOUND", matchIdentifierType: null, matchIdentifierValue: null, matchMessage: "Owner cleared listing match.", processRoute: null, processRuleId: null, markingAssetId: null } });
  await refreshReviewState(batchId, account.id);
  revalidatePath(`/owner/consignments/${batchId}/review`);
}

export async function setConsignmentRouteAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments");
  const account = await requireAccount(user);
  const lineId = value(formData, "lineId", 80);
  const batchId = value(formData, "batchId", 80);
  const route = value(formData, "route", 40) as ProcessRoute;
  if (route !== "PICK_PACK" && route !== "PICK_MARK_PACK") redirect(`/owner/consignments/${batchId}/review?error=route`);
  const line = await prisma.consignmentLine.findFirst({ where: { id: lineId, consignmentBatchId: batchId, accountId: account.id, activated: false, marketplaceListingId: { not: null } }, select: { id: true, marketplaceListingId: true } });
  if (!line?.marketplaceListingId) redirect(`/owner/consignments/${batchId}/review?error=listing`);
  try {
    const rule = await setActiveProcessRule({ accountId: account.id, marketplaceListingId: line.marketplaceListingId, route, markingAssetId: route === "PICK_MARK_PACK" ? value(formData, "markingAssetId", 80) || null : null, actorUserId: user.id });
    await prisma.consignmentLine.updateMany({ where: { accountId: account.id, consignmentBatchId: batchId, marketplaceListingId: line.marketplaceListingId, activated: false }, data: { processRoute: rule.route, processRuleId: rule.id, markingAssetId: rule.markingAssetId } });
    await prisma.consignmentImportIssue.updateMany({ where: { consignmentBatchId: batchId, consignmentLine: { marketplaceListingId: line.marketplaceListingId }, issueType: { in: ["MISSING_PROCESS_RULE", "UNSUPPORTED_ROUTE", "MISSING_MARKING_FILE", "MARKING_ASSET_MISSING", "MARKING_INSTRUCTIONS_MISSING"] }, resolved: false }, data: { resolved: true, resolvedAt: new Date(), resolvedByUserId: user.id } });
    await recordAuditLog({ userId: user.id, accountId: account.id, action: "CONSIGNMENT_ROUTE_SELECTED", entityType: "ConsignmentLine", entityId: line.id, metadata: { batchId, route, markingAssetId: rule.markingAssetId }, request: await getRequestMeta() });
    await refreshReviewState(batchId, account.id);
    revalidatePath(`/owner/consignments/${batchId}/review`);
    redirect(`/owner/consignments/${batchId}/review?updated=1`);
  } catch (error) {
    redirect(`/owner/consignments/${batchId}/review?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save route.")}`);
  }
}

export async function bulkReadyMadeAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments");
  const account = await requireAccount(user);
  const batchId = value(formData, "batchId", 80);
  const lines = await prisma.consignmentLine.findMany({ where: { consignmentBatchId: batchId, accountId: account.id, activated: false, marketplaceListingId: { not: null }, processRoute: null }, select: { marketplaceListingId: true } });
  const listingIds = [...new Set(lines.map((line) => line.marketplaceListingId).filter((id): id is string => Boolean(id)))];
  for (const listingId of listingIds) {
    const rule = await setActiveProcessRule({ accountId: account.id, marketplaceListingId: listingId, route: "PICK_PACK", actorUserId: user.id });
    await prisma.consignmentLine.updateMany({ where: { consignmentBatchId: batchId, accountId: account.id, marketplaceListingId: listingId, activated: false }, data: { processRoute: "PICK_PACK", processRuleId: rule.id, markingAssetId: null } });
  }
  await prisma.consignmentImportIssue.updateMany({ where: { consignmentBatchId: batchId, issueType: "MISSING_PROCESS_RULE", resolved: false, consignmentLine: { processRoute: "PICK_PACK" } }, data: { resolved: true, resolvedAt: new Date(), resolvedByUserId: user.id } });
  await recordAuditLog({ userId: user.id, accountId: account.id, action: "CONSIGNMENT_BULK_ROUTE_APPLIED", entityType: "ConsignmentBatch", entityId: batchId, metadata: { route: "PICK_PACK", listingCount: listingIds.length }, request: await getRequestMeta() });
  await refreshReviewState(batchId, account.id);
  revalidatePath(`/owner/consignments/${batchId}/review`);
}

export async function resolveConsignmentIssueAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments");
  const account = await requireAccount(user);
  const batchId = value(formData, "batchId", 80);
  const issueId = value(formData, "issueId", 80);
  await prisma.consignmentImportIssue.updateMany({ where: { id: issueId, consignmentBatchId: batchId, consignmentBatch: { accountId: account.id } }, data: { resolved: true, resolvedAt: new Date(), resolvedByUserId: user.id } });
  await recordAuditLog({ userId: user.id, accountId: account.id, action: "CONSIGNMENT_ISSUE_RESOLVED", entityType: "ConsignmentImportIssue", entityId: issueId, metadata: { batchId }, request: await getRequestMeta() });
  await refreshReviewState(batchId, account.id);
  revalidatePath(`/owner/consignments/${batchId}/review`);
  revalidatePath(`/owner/consignments/${batchId}/issues`);
}

export async function cancelConsignmentAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments");
  const account = await requireAccount(user);
  const batchId = value(formData, "batchId", 80);
  const changed = await prisma.consignmentBatch.updateMany({ where: { id: batchId, accountId: account.id, status: { in: ["DRAFT", "PARSING", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "FAILED"] } }, data: { status: "CANCELLED" } });
  if (!changed.count) redirect(`/owner/consignments/${batchId}?error=not-cancellable`);
  await recordAuditLog({ userId: user.id, accountId: account.id, action: "CONSIGNMENT_CANCELLED", entityType: "ConsignmentBatch", entityId: batchId, request: await getRequestMeta() });
  revalidatePath("/owner/consignments");
  redirect(`/owner/consignments/${batchId}`);
}

export async function activateConsignmentAction(formData: FormData) {
  const user = await requireWorkPermission("canManageConsignments");
  const account = await requireAccount(user);
  const batchId = value(formData, "batchId", 80);
  try {
    const result = await activateConsignmentBatch({ batchId, accountId: account.id, actorUserId: user.id });
    revalidatePath(`/owner/consignments/${batchId}`);
    redirect(`/owner/consignments/${batchId}?activated=${result.alreadyActive ? "existing" : "1"}`);
  } catch (error) {
    redirect(`/owner/consignments/${batchId}/review?error=${encodeURIComponent(error instanceof Error ? error.message : "Activation failed.")}`);
  }
}
