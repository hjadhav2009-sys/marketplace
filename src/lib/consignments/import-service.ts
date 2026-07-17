import { createHash, randomUUID } from "node:crypto";
import type { ConsignmentImportFileType, ConsignmentLineMatchStatus, IdentifierType, Prisma, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import { ensureMinimalCatalogPlaceholder } from "@/src/lib/product-inventory/placeholder";
import { inspectFlipkartConsignmentZip } from "./flipkart/archive";
import { classifyConsignmentTextFile, isConsignmentDetailsHeaders, parseCsvRecords, parseFlipkartConsignmentCsv, type ParsedConsignmentLine } from "./flipkart/parser";
import { decideConsignmentListingMatch, type MatchCandidate } from "./matching";
import { removeConsignmentBatchFiles, sanitizeConsignmentFileName, storeConsignmentBuffer, validateConsignmentUpload } from "./storage";
import { resolveAdaptiveRows } from "@/src/lib/imports/adaptive-rows";
import { completeConsignmentHeaderMapping, pauseConsignmentForHeaderMapping } from "./adaptive-mapping";

const CHUNK_SIZE = 400;
function rowsToCsv(rows:Record<string,unknown>[]){const headers=[...new Set(rows.flatMap(row=>Object.keys(row)))],cell=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;return[headers.map(cell).join(","),...rows.map(row=>headers.map(header=>cell(row[header])).join(","))].join("\n");}

function chunks<T>(values: T[], size = CHUNK_SIZE) {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function safeConsignmentNumber(value: string) {
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  if (!normalized || normalized.length > 100 || !/^[A-Z0-9._/-]+$/.test(normalized)) throw new Error("Enter a valid consignment number.");
  return normalized;
}

function safeDisplay(value: string, max: number) {
  return value.normalize("NFKC").trim().slice(0, max);
}

type StoredInputFile = {
  fileType: ConsignmentImportFileType;
  originalFileName: string;
  managedRelativePath: string;
  fileSizeBytes: number;
  sha256: string;
  entryName?: string;
  parsed: boolean;
  rowCount: number;
  notes?: string;
};

async function identifierMatches(accountId: string, type: IdentifierType, values: string[], client: typeof prisma = prisma) {
  const rows: Array<{ identifierType: IdentifierType; normalizedValue: string; marketplaceListing: MatchCandidate }> = [];
  for (const group of chunks([...new Set(values.filter(Boolean))])) {
    rows.push(...await client.marketplaceListingIdentifier.findMany({
      where: { accountId, identifierType: type, normalizedValue: { in: group }, active: true },
      select: { identifierType: true, normalizedValue: true, marketplaceListing: { select: { id: true, sellerSkuId: true, sku: true, fsn: true, listingId: true } } }
    }));
  }
  const map = new Map<string, MatchCandidate[]>();
  for (const row of rows) map.set(row.normalizedValue, [...(map.get(row.normalizedValue) ?? []), row.marketplaceListing]);
  return map;
}

export async function matchConsignmentLines(accountId: string, lines: ParsedConsignmentLine[], client: typeof prisma = prisma) {
  const normalizedSku = lines.map((line) => normalizeListingIdentifier("SELLER_SKU", line.sellerSkuSource)).filter((value): value is string => Boolean(value));
  const normalizedFsn = lines.map((line) => normalizeListingIdentifier("FSN", line.fsnSource)).filter((value): value is string => Boolean(value));
  const [skuMap, fsnMap] = await Promise.all([identifierMatches(accountId, "SELLER_SKU", normalizedSku, client), identifierMatches(accountId, "FSN", normalizedFsn, client)]);
  return lines.map((line) => {
    const sku = normalizeListingIdentifier("SELLER_SKU", line.sellerSkuSource);
    const fsn = normalizeListingIdentifier("FSN", line.fsnSource);
    return {
      line,
      sku,
      fsn,
      decision: decideConsignmentListingMatch(sku ? skuMap.get(sku) ?? [] : [], fsn ? fsnMap.get(fsn) ?? [] : [])
    };
  });
}

export async function importFlipkartConsignmentDraft(input: {
  accountId: string;
  user: Pick<User, "id">;
  externalConsignmentNumber: string;
  displayName?: string;
  destinationText?: string;
  file: File;
  request?: RequestMeta;
  existingBatchId?: string;
}) {
  const extension = validateConsignmentUpload(input.file);
  const account = await prisma.account.findFirst({ where: { id: input.accountId, active: true, marketplace: "FLIPKART" }, select: { id: true } });
  if (!account) throw new Error("Select an active Flipkart account.");
  const externalConsignmentNumber = safeConsignmentNumber(input.externalConsignmentNumber);
  const data = Buffer.from(await input.file.arrayBuffer());
  if (data.byteLength !== input.file.size) throw new Error("Upload size changed while reading.");
  const sourceSha256 = createHash("sha256").update(data).digest("hex");
  if (input.existingBatchId) {
    const protectedDuplicate = await prisma.consignmentBatch.findFirst({ where: { id: { not: input.existingBatchId }, accountId: account.id, sourceFileSha256: sourceSha256, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true, status: true } });
    if (protectedDuplicate) throw new Error(`This source is already used by ${protectedDuplicate.id} (${protectedDuplicate.status}).`);
  }
  const duplicate = input.existingBatchId ? null : await prisma.consignmentBatch.findFirst({
    where: { accountId: account.id, marketplace: "FLIPKART", OR: [{ externalConsignmentNumber }, { sourceFileSha256: sourceSha256 }] },
    select: { id: true, status: true }
  });
  if (duplicate) throw new Error(`Consignment already exists as ${duplicate.id} (${duplicate.status}). Open that batch instead of importing again.`);

  const batchId = input.existingBatchId ?? `cnb_${randomUUID().replace(/-/g, "")}`;
  const batch = input.existingBatchId ? await prisma.consignmentBatch.findFirst({ where: { id: input.existingBatchId, accountId: account.id, status: { in: ["DRAFT", "PARSING", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "FAILED"] } } }) : await prisma.consignmentBatch.create({
    data: {
      id: batchId,
      accountId: account.id,
      marketplace: "FLIPKART",
      externalConsignmentNumber,
      displayName: safeDisplay(input.displayName || `Flipkart ${externalConsignmentNumber}`, 160),
      destinationText: input.destinationText ? safeDisplay(input.destinationText, 500) : null,
      status: "PARSING",
      sourceFileName: sanitizeConsignmentFileName(input.file.name),
      sourceFileSha256: sourceSha256,
      createdByUserId: input.user.id
    }
  });
  if (!batch) throw new Error("Draft consignment is not available for reparse.");
  if (input.existingBatchId) {
    await prisma.$transaction([
      prisma.consignmentImportIssue.deleteMany({ where: { consignmentBatchId: batch.id } }),
      prisma.consignmentLine.deleteMany({ where: { consignmentBatchId: batch.id, activated: false } }),
      prisma.consignmentBatch.update({ where: { id: batch.id }, data: { status: "PARSING", sourceFileName: sanitizeConsignmentFileName(input.file.name), sourceFileSha256: sourceSha256, totalSourceRows: 0, totalValidLines: 0, totalRequiredQuantity: 0, matchedLines: 0, unmatchedLines: 0, ambiguousLines: 0, conflictLines: 0, markingLines: 0, readyMadeLines: 0 } })
    ]);
  } else {
    await recordAuditLog({ userId: input.user.id, accountId: account.id, action: "CONSIGNMENT_DRAFT_CREATED", entityType: "ConsignmentBatch", entityId: batch.id, metadata: { consignmentNumber: externalConsignmentNumber }, request: input.request });
  }

  try {
    const rawStored = await storeConsignmentBuffer({ batchId, area: "source", originalName: input.file.name, data });
    await prisma.$transaction([
      prisma.consignmentImportFile.updateMany({ where: { consignmentBatchId: batchId, fileType: "SOURCE_UPLOAD", isCurrentSource: true }, data: { isCurrentSource: false, supersededAt: new Date() } }),
      prisma.consignmentImportFile.create({ data: { consignmentBatchId: batchId, fileType: "SOURCE_UPLOAD", originalFileName: rawStored.originalFileName, managedRelativePath: rawStored.managedRelativePath, fileSizeBytes: rawStored.fileSizeBytes, sha256: rawStored.sha256, parsed: false, isCurrentSource: true, rowCount: 0, notes: input.existingBatchId ? "Replacement source version" : "Original source version" } }),
      prisma.consignmentBatch.update({ where: { id: batchId }, data: { sourceUploadRelativePath: rawStored.managedRelativePath } })
    ]);
    await recordAuditLog({ userId: input.user.id, accountId: account.id, action: "CONSIGNMENT_FILE_UPLOADED", entityType: "ConsignmentBatch", entityId: batchId, metadata: { safeFileName: rawStored.originalFileName, sha256: rawStored.sha256, fileSizeBytes: rawStored.fileSizeBytes }, request: input.request });
    let mainName = rawStored.originalFileName;
    let mainData: Buffer<ArrayBufferLike> = data;
    const files: StoredInputFile[] = [];

    if (extension === ".zip") {
      const archive = await inspectFlipkartConsignmentZip(data);
      for (const entry of archive.entries) {
        const stored = await storeConsignmentBuffer({ batchId, area: entry.fileType === "CONSIGNMENT_DETAILS" ? "source" : "supporting", originalName: entry.entryName, data: entry.data });
        files.push({ ...stored, fileType: entry.fileType, entryName: entry.entryName, parsed: entry.fileType === "CONSIGNMENT_DETAILS", rowCount: 0, notes: entry.fileType === "QUALITY_CHECK_REFERENCE" ? "Reference only; creates no QC work." : undefined });
      }
      if (archive.mainCandidates.length !== 1) {
        const multiple = archive.mainCandidates.length > 1;
        await prisma.$transaction([
          prisma.consignmentImportFile.createMany({ data: files.map((file) => ({ ...file, consignmentBatchId: batchId })) }),
          prisma.consignmentImportIssue.create({ data: { consignmentBatchId: batchId, issueType: multiple ? "MULTIPLE_MAIN_FILES" : "MISSING_MAIN_FILE", severity: "ERROR", message: multiple ? "Multiple Consignment Details files were detected; owner selection is required." : "No CSV with the required Consignment Details headers was found." } }),
          prisma.consignmentBatch.update({ where: { id: batchId }, data: { status: multiple ? "REVIEW_REQUIRED" : "FAILED" } })
        ]);
        return { batchId, requiresMainSelection: multiple };
      }
      mainName = archive.mainCandidates[0].entryName;
      mainData = archive.mainCandidates[0].data;
    } else {
      const fileType = classifyConsignmentTextFile(mainName, mainData.toString("utf8"));
      if (fileType !== "CONSIGNMENT_DETAILS"&&extension!==".csv") throw new Error("Uploaded file is not a Consignment Details CSV.");
      files.push({ ...rawStored, fileType:"CONSIGNMENT_DETAILS", parsed: fileType==="CONSIGNMENT_DETAILS", rowCount: 0 });
    }

    const records=parseCsvRecords(mainData.toString("utf8")),headers=records[0]??[],rawRows=records.slice(1).filter(row=>row.some(cell=>cell.trim())).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??""]))),adaptive=await resolveAdaptiveRows({accountId:account.id,marketplace:"FLIPKART",purpose:"CONSIGNMENT_QUANTITY",rows:rawRows,layoutKnown:isConsignmentDetailsHeaders(headers)});
    if(adaptive.state==="NEEDS_MAPPING"){const job=await pauseConsignmentForHeaderMapping({batchId,accountId:account.id,actorUserId:input.user.id,marketplace:"FLIPKART",purpose:"CONSIGNMENT_QUANTITY",fileName:mainName,mappingRequest:adaptive.mappingRequest});return{batchId,requiresMainSelection:false,needsMapping:true,mappingJobId:job.id};}
    const parsed = parseFlipkartConsignmentCsv(adaptive.profileId?rowsToCsv(adaptive.rows):mainData.toString("utf8"));
    await completeConsignmentHeaderMapping({batchId,profileId:adaptive.profileId});
    let matches = await matchConsignmentLines(account.id, parsed.lines);
    for(const item of matches){if(item.decision.status==="NOT_FOUND"&&item.line.requiredQuantity>0&&item.line.sellerSkuSource){await ensureMinimalCatalogPlaceholder({accountId:account.id,marketplace:"FLIPKART",sellerSku:item.line.sellerSkuSource,title:item.line.productNameSource,fsn:item.line.fsnSource,sourceRow:item.line.rowNumber});}}
    if(matches.some(item=>item.decision.status==="NOT_FOUND"&&item.line.requiredQuantity>0&&item.line.sellerSkuSource))matches=await matchConsignmentLines(account.id,parsed.lines);
    const selectedIds = [...new Set(matches.flatMap((match) => match.decision.listing ? [match.decision.listing.id] : []))];
    const listings = await prisma.marketplaceListing.findMany({
      where: { accountId: account.id, id: { in: selectedIds } },
      select: {
        id: true, sellerSkuId: true, fsn: true, listingId: true, productTitle: true, mainImageUrl: true,
        processRules: { where: { active: true }, take: 1, select: { id: true, route: true, markingAssetId: true, markingAsset: { select: { id: true, active: true, masterDesignId: true, instructions: true, files: { where: { attachmentType: "MARKING_FILE", activeVersion: true }, take: 1, select: { id: true } } } } } }
      }
    });
    const listingMap = new Map(listings.map((listing) => [listing.id, listing]));
    const lineIds = new Map<number, string>();
    const lineData: Prisma.ConsignmentLineCreateManyInput[] = [];
    const issues: Array<{ consignmentBatchId: string; consignmentLineId?: string; rowNumber?: number; issueType: string; severity: "INFO" | "WARNING" | "ERROR"; message: string; safeDataJson?: string }> = [];

    for (const item of matches) {
      const lineId = `cnl_${randomUUID().replace(/-/g, "")}`;
      lineIds.set(item.line.rowNumber, lineId);
      const listing = item.decision.listing ? listingMap.get(item.decision.listing.id) : null;
      const rule = listing?.processRules[0];
      lineData.push({
        id: lineId,
        consignmentBatchId: batchId,
        accountId: account.id,
        ...item.line,
        marketplaceListingId: listing?.id ?? null,
        matchStatus: item.decision.status as ConsignmentLineMatchStatus,
        matchIdentifierType: item.decision.listing ? item.decision.identifierType : null,
        matchIdentifierValue: item.decision.listing ? (item.decision.identifierType === "SELLER_SKU" ? item.sku : item.fsn) : null,
        matchMessage: item.decision.warning ?? null,
        processRoute: rule?.route ?? null,
        processRuleId: rule?.id ?? null,
        markingAssetId: rule?.markingAssetId ?? null
      });
      if (item.decision.warning) issues.push({ consignmentBatchId: batchId, consignmentLineId: lineId, rowNumber: item.line.rowNumber, issueType: item.decision.status, severity: item.decision.status === "EXACT_SKU" || item.decision.status === "EXACT_FSN" ? "WARNING" : "ERROR", message: item.decision.warning, safeDataJson: "candidates" in item.decision ? JSON.stringify({ listingIds: item.decision.candidates.map((candidate) => candidate.id) }) : undefined });
      if (listing && !rule) issues.push({ consignmentBatchId: batchId, consignmentLineId: lineId, rowNumber: item.line.rowNumber, issueType: "MISSING_PROCESS_RULE", severity: "WARNING", message: "No saved default processing; Direct to Pack will be used." });
      if (rule?.route === "PICK_MARK_PACK" && !rule.markingAsset?.active) issues.push({ consignmentBatchId: batchId, consignmentLineId: lineId, rowNumber: item.line.rowNumber, issueType: "MARKING_ASSET_MISSING", severity: "WARNING", message: "No active marking asset is saved; manager guidance is required." });
      if (rule?.route === "PICK_MARK_PACK" && rule.markingAsset?.active && !rule.markingAsset.instructions?.trim() && !rule.markingAsset.masterDesignId?.trim()) issues.push({ consignmentBatchId: batchId, consignmentLineId: lineId, rowNumber: item.line.rowNumber, issueType: "MARKING_INSTRUCTIONS_MISSING", severity: "WARNING", message: "No marking instructions or Master Design ID are saved." });
      if (rule?.route === "PICK_MARK_PACK" && rule.markingAsset?.files.length) issues.push({ consignmentBatchId: batchId, consignmentLineId: lineId, rowNumber: item.line.rowNumber, issueType: "MARKING_FILE_STORED_FUTURE_USE", severity: "INFO", message: "A marking file is stored in the owner library for future integration; worker download is not required." });
      if (rule && rule.route !== "PICK_PACK" && rule.route !== "PICK_MARK_PACK") issues.push({ consignmentBatchId: batchId, consignmentLineId: lineId, rowNumber: item.line.rowNumber, issueType: "UNSUPPORTED_ROUTE", severity: "ERROR", message: "Assembly routes are not activated for Flipkart consignments in Phase 2." });
    }
    for (const issue of parsed.issues) issues.push({ consignmentBatchId: batchId, consignmentLineId: issue.rowNumber ? lineIds.get(issue.rowNumber) : undefined, rowNumber: issue.rowNumber, issueType: issue.issueType, severity: issue.severity, message: issue.message, safeDataJson: issue.safeData ? JSON.stringify(issue.safeData) : undefined });

    const matchedLines = lineData.filter((line) => line.marketplaceListingId).length;
    const blocking = issues.some((issue) => issue.severity === "ERROR");
    for (const group of chunks(lineData)) await prisma.consignmentLine.createMany({ data: group });
    for (const group of chunks(issues)) if (group.length) await prisma.consignmentImportIssue.createMany({ data: group });
    const mainFile = files.find((file) => file.originalFileName === mainName || file.entryName === mainName);
    if (mainFile) mainFile.rowCount = parsed.sourceRows;
    if (files.length) await prisma.consignmentImportFile.createMany({ data: files.map((file) => ({ ...file, consignmentBatchId: batchId })) });

    await prisma.consignmentBatch.update({
      where: { id: batchId },
      data: {
        status: blocking ? "REVIEW_REQUIRED" : "READY_TO_ACTIVATE",
        totalSourceRows: parsed.sourceRows,
        totalValidLines: lineData.length,
        totalRequiredQuantity: lineData.reduce((sum, line) => sum + line.requiredQuantity, 0),
        matchedLines,
        unmatchedLines: lineData.filter((line) => line.matchStatus === "NOT_FOUND").length,
        ambiguousLines: lineData.filter((line) => line.matchStatus === "EXACT_MULTIPLE").length,
        conflictLines: lineData.filter((line) => line.matchStatus === "IDENTIFIER_CONFLICT").length,
        markingLines: lineData.filter((line) => line.processRoute === "PICK_MARK_PACK").length,
        readyMadeLines: lineData.filter((line) => line.processRoute === "PICK_PACK").length
      }
    });
    await recordAuditLog({ userId: input.user.id, accountId: account.id, action: input.existingBatchId ? "CONSIGNMENT_REPARSED" : "CONSIGNMENT_PARSED", entityType: "ConsignmentBatch", entityId: batchId, metadata: { sourceRows: parsed.sourceRows, validLines: lineData.length, requiredQuantity: lineData.reduce((sum, line) => sum + line.requiredQuantity, 0), issueCount: issues.length }, request: input.request });
    return { batchId, requiresMainSelection: false };
  } catch (error) {
    await prisma.consignmentBatch.update({ where: { id: batchId }, data: { status: "FAILED" } }).catch(() => undefined);
    await prisma.consignmentImportIssue.create({ data: { consignmentBatchId: batchId, issueType: "IMPORT_FAILED", severity: "ERROR", message: error instanceof Error ? error.message.slice(0, 500) : "Consignment import failed." } }).catch(() => undefined);
    await recordAuditLog({ userId: input.user.id, accountId: account.id, action: "CONSIGNMENT_ACTIVATION_FAILED", entityType: "ConsignmentBatch", entityId: batchId, metadata: { stage: "parse" }, request: input.request }).catch(() => undefined);
    throw error;
  }
}

export async function discardFailedConsignmentFiles(batchId: string) {
  await removeConsignmentBatchFiles(batchId);
}
