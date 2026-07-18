"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentType } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { requireAccount, requireUser } from "@/lib/auth";
import { cacheProductCardImage, imageCacheNeedsRefresh } from "@/lib/image-cache";
import { importParsedOrderRows } from "@/lib/import/orders";
import {
  buildPreviewImportStats,
  getPreviewImportSourceType,
  type ImportPreviewSourceType
} from "@/lib/import/preview";
import {
  crossCheckMeeshoParsedRows,
  parseMeeshoPdfBuffer,
  type MeeshoParserDiagnostics,
  type MeeshoParseResult,
  type ParseIssue
} from "@/lib/parsers/meesho";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { normalizeSkuForMatching } from "@/lib/sku";
import { createFlipkartImportJobFromFile, startImportJob } from "@/src/lib/import-jobs/runner";
import { sanitizePublicActionError } from "@/src/lib/import-jobs/safe-error";
import { FLIPKART_IMPORT_MAX_BYTES, PDF_UPLOAD_MAX_BYTES, isUploadTooLarge } from "@/lib/upload-limits";
import { accountSelectionSchema, flipkartOrderImportFileSchema, skuImageMappingSchema, uploadBatchSchema } from "@/lib/validators";
import { parseAmazonOrderReport } from "@/lib/parsers/amazon-orders";
import { assertMarketplaceCapability } from "@/src/lib/marketplace-capabilities";

type PreviewRowDraft = {
  sourceFileName: string;
  sourceType: "LABEL" | "MANIFEST_ORDER" | "PICKLIST_SUMMARY";
  pageNumber?: number;
  awb?: string;
  courier?: string;
  sku?: string;
  qty?: number;
  color?: string;
  size?: string;
  orderNo?: string;
  productDescription?: string;
  paymentType?: PaymentType;
  confidence: number;
  issues: ParseIssue[];
  rawData: Record<string, unknown>;
};

type CacheQueueMapping = {
  id: string;
  accountId: string;
  sku: string;
  imageUrl: string;
  cacheStatus: string;
  cacheFilePath: string | null;
  cacheOriginalImageUrl: string | null;
  cacheCachedAt: Date | null;
};

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

async function ownerUploadAccount(formData: FormData, fallbackAccountId: string) {
  const accountId = String(formData.get("accountId") ?? fallbackAccountId).trim();
  const parsed = accountSelectionSchema.safeParse({ accountId });

  if (!parsed.success) {
    return null;
  }

  return prisma.account.findFirst({
    where: { id: parsed.data.accountId, active: true }
  });
}

function hasIssue(row: PreviewRowDraft, issueType: string) {
  return row.issues.some((issue) => issue.issueType === issueType);
}

function parseStoredIssues(value: string | null) {
  if (!value) {
    return [] as ParseIssue[];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ParseIssue[]) : [];
  } catch {
    return [] as ParseIssue[];
  }
}

function rowMatchesIssue(row: PreviewRowDraft, issue: ParseIssue) {
  if (issue.pageNumber && row.pageNumber && issue.pageNumber !== row.pageNumber) {
    return false;
  }

  if (issue.awb && row.awb) {
    return issue.awb === row.awb;
  }

  if (issue.sku && row.sku) {
    return issue.sku === row.sku;
  }

  return false;
}

function appendIssue(row: PreviewRowDraft, issue: ParseIssue) {
  if (row.issues.some((existing) => existing.issueType === issue.issueType && existing.message === issue.message)) {
    return;
  }

  row.issues.push(issue);
}

function parsedRowsToDrafts(result: MeeshoParseResult): PreviewRowDraft[] {
  const labelRows = result.labelOrders.map<PreviewRowDraft>((row) => ({
    sourceFileName: result.fileName,
    sourceType: "LABEL",
    pageNumber: row.pageNumber,
    awb: row.awb,
    courier: row.courier,
    sku: row.sku,
    qty: row.qty,
    color: row.color,
    size: row.size,
    orderNo: row.orderNo,
    productDescription: row.productDescription,
    paymentType: row.paymentType,
    confidence: row.confidence,
    issues: [...row.issues],
    rawData: {
      sourceFileName: result.fileName,
      sourceType: row.sourceType,
      pageNumber: row.pageNumber,
      purchaseOrderNo: row.purchaseOrderNo,
      invoiceNo: row.invoiceNo,
      orderDate: row.orderDate,
      invoiceDate: row.invoiceDate
    }
  }));

  const manifestRows = result.manifestOrders.map<PreviewRowDraft>((row) => ({
    sourceFileName: result.fileName,
    sourceType: "MANIFEST_ORDER",
    pageNumber: row.pageNumber,
    awb: row.awb,
    courier: row.courier,
    sku: row.sku,
    qty: row.qty,
    size: row.size,
    orderNo: row.orderNo,
    paymentType: "UNKNOWN",
    confidence: row.confidence,
    issues: [...row.issues],
    rawData: {
      sourceFileName: result.fileName,
      sourceType: row.sourceType,
      pageNumber: row.pageNumber,
      rawRowText: row.rawRowText
    }
  }));

  const summaryRows = result.picklistSummaryRows.map<PreviewRowDraft>((row) => ({
    sourceFileName: result.fileName,
    sourceType: "PICKLIST_SUMMARY",
    pageNumber: row.pageNumber,
    sku: row.sku,
    qty: row.totalQuantity,
    color: row.color,
    size: row.size,
    paymentType: "UNKNOWN",
    confidence: row.confidence,
    issues: [...row.issues],
    rawData: {
      sourceFileName: result.fileName,
      sourceType: row.sourceType,
      pageNumber: row.pageNumber,
      rawRowText: row.rawRowText
    }
  }));

  return [...labelRows, ...manifestRows, ...summaryRows];
}

async function parseUploadedPdf(file: File) {
  const parsed = uploadBatchSchema.safeParse({ filename: file.name });

  if (!parsed.success) {
    throw new Error("Only PDF files are supported.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return parseMeeshoPdfBuffer(buffer, parsed.data.filename);
}

function buildFailedDiagnostic(fileName: string, message: string): MeeshoParserDiagnostics {
  return {
    fileName,
    detectedType: "UNKNOWN",
    pageCount: 0,
    pagesWithText: 0,
    pagesWithoutText: 0,
    parsedOrders: 0,
    parsedLabelOrders: 0,
    parsedManifestOrders: 0,
    parsedSummaryRows: 0,
    missingAwb: 0,
    missingSku: 0,
    lowConfidenceRows: 0,
    duplicateAwbInsideFile: 0,
    unknownLayoutPages: 0,
    scannedPdfLikely: false,
    parserWarnings: [message],
    pageDiagnostics: []
  };
}

function buildNotes(input: {
  results: MeeshoParseResult[];
  failedDiagnostics?: MeeshoParserDiagnostics[];
  importSourceType: ImportPreviewSourceType;
  labelOrderRows: number;
  manifestOrderRows: number;
  picklistSummaryRows: number;
  importableOrderRows: number;
  importSourceRows: number;
  existingDuplicateRows: number;
  missingImageRows: number;
  missingImageSkus: number;
  blockingRows: number;
  failureReason?: string;
}) {
  const diagnostics = [...input.results.map((result) => result.diagnostics), ...(input.failedDiagnostics ?? [])];
  const stats = diagnostics.reduce(
    (acc, result) => ({
      totalPages: acc.totalPages + result.pageCount,
      pagesWithText: acc.pagesWithText + result.pagesWithText,
      pagesWithoutText: acc.pagesWithoutText + result.pagesWithoutText,
      parsedLabelOrders: acc.parsedLabelOrders + result.parsedLabelOrders,
      parsedManifestOrders: acc.parsedManifestOrders + result.parsedManifestOrders,
      missingAwb: acc.missingAwb + result.missingAwb,
      missingSku: acc.missingSku + result.missingSku,
      lowConfidenceRows: acc.lowConfidenceRows + result.lowConfidenceRows,
      duplicateAwbInsideFile: acc.duplicateAwbInsideFile + result.duplicateAwbInsideFile,
      unknownLayoutPages: acc.unknownLayoutPages + result.unknownLayoutPages,
      scannedPdfLikely: acc.scannedPdfLikely || result.scannedPdfLikely
    }),
    {
      totalPages: 0,
      pagesWithText: 0,
      pagesWithoutText: 0,
      parsedLabelOrders: 0,
      parsedManifestOrders: 0,
      missingAwb: 0,
      missingSku: 0,
      lowConfidenceRows: 0,
      duplicateAwbInsideFile: 0,
      unknownLayoutPages: 0,
      scannedPdfLikely: false
    }
  );
  const parserWarnings = diagnostics.flatMap((result) => result.parserWarnings);
  const failureReason = input.failureReason ?? parserWarnings[0];

  return JSON.stringify({
    parserVersion: "sprint-6",
    diagnostics,
    files: diagnostics,
    failureReason,
    stats: {
      ...stats,
      parsedOrders: input.importSourceRows,
      parsedLabelOrders: input.labelOrderRows,
      parsedManifestOrders: input.manifestOrderRows,
      parsedSummaryRows: input.picklistSummaryRows,
      labelOrderRows: input.labelOrderRows,
      manifestOrderRows: input.manifestOrderRows,
      picklistSummaryRows: input.picklistSummaryRows,
      importSourceType: input.importSourceType,
      importSourceRows: input.importSourceRows,
      importableOrderRows: input.importableOrderRows,
      existingDuplicateRows: input.existingDuplicateRows,
      missingImageRows: input.missingImageRows,
      missingImageSkus: input.missingImageSkus,
      blockingRows: input.blockingRows
    }
  });
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}

async function cacheQueueMapping(mapping: CacheQueueMapping) {
  const meta = await cacheProductCardImage({
    accountId: mapping.accountId,
    sku: mapping.sku,
    originalImageUrl: mapping.imageUrl
  });

  await prisma.skuImageMapping.update({
    where: { id: mapping.id },
    data: {
      imageHealth: meta.status === "CACHED" ? "MAPPED" : "BROKEN",
      cacheStatus: meta.status,
      cacheFilePath: meta.filePath,
      cacheContentType: meta.contentType,
      cacheOriginalImageUrl: meta.originalImageUrl,
      cacheCachedAt: meta.cachedAt ? new Date(meta.cachedAt) : null,
      cacheLastUsedAt: meta.lastUsedAt ? new Date(meta.lastUsedAt) : new Date(),
      cacheWidth: meta.width,
      cacheHeight: meta.height,
      cacheFileSizeBytes: meta.fileSizeBytes,
      cacheError: meta.error
    }
  });

  return meta.status;
}

function optionalText(value: FormDataEntryValue | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

function reviewRedirectUrl(
  batchId: string,
  params: Record<string, string | number | boolean | undefined>
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString();
  return `/owner/uploads/${batchId}/review${suffix ? `?${suffix}` : ""}`;
}

async function updateBatchMissingImageRows(batchId: string) {
  const [rows, batch] = await Promise.all([
    prisma.uploadPreviewRow.findMany({
      where: { batchId },
      select: { issues: true }
    }),
    prisma.uploadBatch.findUnique({
      where: { id: batchId },
      select: { notes: true }
    })
  ]);
  const missingImageRows = rows.filter((row) =>
    parseStoredIssues(row.issues).some((issue) => issue.issueType === "MISSING_IMAGE_MAPPING")
  ).length;
  let notes = batch?.notes ?? null;

  if (notes) {
    try {
      const parsed = JSON.parse(notes) as { stats?: Record<string, unknown> };
      notes = JSON.stringify({
        ...parsed,
        stats: {
          ...(parsed.stats ?? {}),
          missingImageRows
        }
      });
    } catch {
      notes = batch?.notes ?? null;
    }
  }

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      missingImageRows,
      notes
    }
  });

  return missingImageRows;
}

async function clearMissingImageIssuesForSku(batchId: string, sku: string) {
  const normalizedSku = normalizeSkuForMatching(sku);
  const rows = await prisma.uploadPreviewRow.findMany({
    where: { batchId },
    select: {
      id: true,
      sku: true,
      issues: true
    }
  });
  const updates = rows
    .filter((row) => normalizeSkuForMatching(row.sku) === normalizedSku)
    .map((row) => {
      const issues = parseStoredIssues(row.issues);
      const nextIssues = issues.filter((issue) => issue.issueType !== "MISSING_IMAGE_MAPPING");

      return nextIssues.length === issues.length
        ? null
        : prisma.uploadPreviewRow.update({
            where: { id: row.id },
            data: { issues: JSON.stringify(nextIssues) }
          });
    })
    .filter((update): update is NonNullable<typeof update> => Boolean(update));

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  await updateBatchMissingImageRows(batchId);
  return updates.length;
}

export async function repairMissingSkuImageMappingAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const batchId = String(formData.get("batchId") ?? "");
  const cacheNow = formData.get("cache") === "1";
  const parsed = skuImageMappingSchema.safeParse({
    sku: formData.get("sku"),
    imageUrl: formData.get("imageUrl"),
    productName: optionalText(formData.get("productName")),
    color: optionalText(formData.get("color")),
    size: optionalText(formData.get("size")),
    active: true
  });

  if (!batchId || !parsed.success) {
    redirect(reviewRedirectUrl(batchId || "missing", { imageRepairError: "invalid" }));
  }

  const batch = await prisma.uploadBatch.findFirst({
    where: {
      id: batchId,
      accountId: account.id
    },
    select: { id: true }
  });

  if (!batch) {
    redirect("/owner/uploads/new?error=invalid-batch");
  }

  let created = 0;
  let updated = 0;
  let cached = 0;
  let failedCache = 0;

  try {
    const existing = await prisma.skuImageMapping.findUnique({
      where: {
        accountId_sku: {
          accountId: account.id,
          sku: parsed.data.sku
        }
      },
      select: {
        id: true,
        accountId: true,
        sku: true,
        imageUrl: true,
        productName: true,
        color: true,
        size: true,
        cacheStatus: true,
        cacheFilePath: true,
        cacheOriginalImageUrl: true,
        cacheCachedAt: true
      }
    });
    const imageUrlChanged = Boolean(existing && existing.imageUrl !== parsed.data.imageUrl);
    const metadata = {
      productName: existing?.productName ? undefined : parsed.data.productName,
      color: existing?.color ? undefined : parsed.data.color,
      size: existing?.size ? undefined : parsed.data.size
    };
    const mapping = existing
      ? await prisma.skuImageMapping.update({
          where: { id: existing.id },
          data: {
            imageUrl: parsed.data.imageUrl,
            active: true,
            lastImportedAt: new Date(),
            source: "upload-review",
            productName: metadata.productName,
            color: metadata.color,
            size: metadata.size,
            imageHealth: imageUrlChanged ? "UNKNOWN" : undefined,
            cacheStatus: imageUrlChanged ? "RECHECK_NEEDED" : undefined,
            cacheOriginalImageUrl: imageUrlChanged ? null : undefined,
            cacheError: imageUrlChanged ? null : undefined
          },
          select: {
            id: true,
            accountId: true,
            sku: true,
            imageUrl: true,
            cacheStatus: true,
            cacheFilePath: true,
            cacheOriginalImageUrl: true,
            cacheCachedAt: true
          }
        })
      : await prisma.skuImageMapping.create({
          data: {
            accountId: account.id,
            sku: parsed.data.sku,
            imageUrl: parsed.data.imageUrl,
            productName: parsed.data.productName,
            color: parsed.data.color,
            size: parsed.data.size,
            active: true,
            lastImportedAt: new Date(),
            source: "upload-review",
            imageHealth: "UNKNOWN",
            cacheStatus: "NOT_CACHED"
          },
          select: {
            id: true,
            accountId: true,
            sku: true,
            imageUrl: true,
            cacheStatus: true,
            cacheFilePath: true,
            cacheOriginalImageUrl: true,
            cacheCachedAt: true
          }
        });

    created = existing ? 0 : 1;
    updated = existing ? 1 : 0;
    await clearMissingImageIssuesForSku(batch.id, parsed.data.sku);

    if (cacheNow) {
      const status = await cacheQueueMapping(mapping);

      if (status === "CACHED") {
        cached = 1;
      } else {
        failedCache = 1;
      }
    }

    await recordAuditLog({
      userId: user.id,
      accountId: account.id,
      action: "UPLOAD_REVIEW_IMAGE_MAPPING_REPAIR",
      entityType: "SkuImageMapping",
      entityId: mapping.id,
      metadata: {
        batchId: batch.id,
        sku: parsed.data.sku,
        created,
        updated,
        cacheNow,
        cached,
        failedCache
      },
      request
    });
  } catch (error) {
    await recordAuditLog({
      userId: user.id,
      accountId: account.id,
      action: "UPLOAD_REVIEW_IMAGE_MAPPING_REPAIR_FAILED",
      entityType: "SkuImageMapping",
      metadata: {
        batchId: batch.id,
        sku: parsed.data.sku,
        message: sanitizePublicActionError(error, "Image mapping repair failed.") ?? "Image mapping repair failed."
      },
      request
    });
    redirect(reviewRedirectUrl(batch.id, { imageRepairError: "save-failed" }));
  }

  revalidatePath(`/owner/uploads/${batch.id}/review`);
  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(
    reviewRedirectUrl(batch.id, {
      imageRepair: 1,
      mappingsCreated: created,
      mappingsUpdated: updated,
      cached,
      failedCache
    })
  );
}

export async function createUploadBatchAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const account = await ownerUploadAccount(formData, selectedAccount.id);
  const request = await getRequestMeta();
  const labelFile = formData.get("labelPdf");
  const manifestFile = formData.get("manifestPdf");
  const labelFileUploaded = isUploadFile(labelFile);
  const files = [labelFile, manifestFile].filter(isUploadFile);

  if (!account) {
    redirect("/owner/uploads/new?error=account");
  }

  if (account.marketplace !== "MEESHO") {
    redirect("/owner/uploads/new?error=legacy-pdf-review-only");
  }

  if (files.length === 0) {
    redirect("/owner/uploads/new?error=missing-file");
  }

  if (files.some((file) => file.size > PDF_UPLOAD_MAX_BYTES)) {
    redirect("/owner/uploads/new?error=too-large");
  }

  for (const file of files) {
    const parsed = uploadBatchSchema.safeParse({ filename: file.name });

    if (!parsed.success) {
      redirect("/owner/uploads/new?error=invalid-file");
    }
  }

  let redirectTo = "/owner/uploads/new?error=parse-failed";
  let createdBatchId: string | null = null;

  try {
    const results: MeeshoParseResult[] = [];
    const failedDiagnostics: MeeshoParserDiagnostics[] = [];

    for (const file of files) {
      try {
        results.push(await parseUploadedPdf(file));
      } catch (error) {
        failedDiagnostics.push(
          buildFailedDiagnostic(file.name, sanitizePublicActionError(error, "PDF parsing failed.") ?? "PDF parsing failed.")
        );
      }
    }

    const parseFailureIssues: ParseIssue[] = failedDiagnostics.map((diagnostic) => ({
      issueType: "PDF_PARSE_FAILED",
      message: diagnostic.parserWarnings[0] ?? "The PDF parser failed before diagnostics could be collected.",
      severity: "ERROR"
    }));
    const combinedIssues = [
      ...results.flatMap((result) => result.issues),
      ...parseFailureIssues,
      ...crossCheckMeeshoParsedRows({
        labelOrders: results.flatMap((result) => result.labelOrders),
        manifestOrders: results.flatMap((result) => result.manifestOrders),
        picklistSummaryRows: results.flatMap((result) => result.picklistSummaryRows)
      })
    ];
    const drafts = results.flatMap(parsedRowsToDrafts);

    for (const draft of drafts) {
      for (const issue of combinedIssues) {
        if (rowMatchesIssue(draft, issue)) {
          appendIssue(draft, issue);
        }
      }
    }

    const preferredImportSourceType = labelFileUploaded || results.some((result) => result.labelOrders.length > 0) ? "LABEL" : undefined;
    const importSourceType = getPreviewImportSourceType(drafts, preferredImportSourceType);
    const importSourceDrafts = drafts.filter((row) => row.sourceType === importSourceType);
    const awbs = importSourceDrafts.map((row) => row.awb).filter((awb): awb is string => Boolean(awb));
    const skus = Array.from(
      new Set(importSourceDrafts.flatMap((row) => [row.sku, normalizeSkuForMatching(row.sku)].filter((sku): sku is string => Boolean(sku))))
    );
    const [existingOrders, mappings] = await Promise.all([
      prisma.order.findMany({
        where: {
          accountId: account.id,
          awb: { in: awbs }
        },
        select: { awb: true }
      }),
      prisma.skuImageMapping.findMany({
        where: {
          accountId: account.id,
          sku: { in: skus },
          active: true
        },
        select: { sku: true }
      })
    ]);
    const existingAwbs = new Set(existingOrders.map((order) => order.awb));
    const mappedSkus = new Set(mappings.map((mapping) => normalizeSkuForMatching(mapping.sku)));

    for (const draft of importSourceDrafts) {
      if (draft.awb && existingAwbs.has(draft.awb)) {
        appendIssue(draft, {
          issueType: "DUPLICATE_EXISTING_AWB",
          message: `AWB ${draft.awb} already exists for this account. Confirm import will skip or safely update it.`,
          severity: "WARNING",
          pageNumber: draft.pageNumber,
          awb: draft.awb,
          sku: draft.sku
        });
      }

      if (draft.sku && !mappedSkus.has(normalizeSkuForMatching(draft.sku))) {
        appendIssue(draft, {
          issueType: "MISSING_IMAGE_MAPPING",
          message: `No active image mapping found for SKU ${draft.sku}.`,
          severity: "WARNING",
          pageNumber: draft.pageNumber,
          awb: draft.awb,
          sku: draft.sku
        });
      }
    }

    const importReviewStats = buildPreviewImportStats(drafts, importSourceType);
    const duplicateRows =
      importReviewStats.existingDuplicateRows + importSourceDrafts.filter((row) => hasIssue(row, "DUPLICATE_AWB_INSIDE_FILE")).length;
    const errorRows = importSourceDrafts.filter((row) => row.issues.some((issue) => issue.severity === "ERROR")).length;
    const lowConfidenceRows = importSourceDrafts.filter((row) => hasIssue(row, "LOW_CONFIDENCE")).length;
    const fileName = files.map((file) => file.name).join(" + ");
    const hasParserDiagnosticsWarning =
      failedDiagnostics.length > 0 ||
      results.some((result) => result.diagnostics.scannedPdfLikely || result.diagnostics.unknownLayoutPages > 0);
    const status = importReviewStats.importSourceRows === 0 ? "FAILED" : hasParserDiagnosticsWarning ? "REVIEWED" : "PARSED";

    const batch = await prisma.uploadBatch.create({
      data: {
        accountId: account.id,
        createdByUserId: user.id,
        fileName,
        importType: "ORDER_LABEL",
        status,
        totalRows: importReviewStats.importSourceRows,
        duplicateRows,
        missingImageRows: importReviewStats.missingImageRows,
        skippedRows: importReviewStats.blockingRows,
        errorRows: errorRows + parseFailureIssues.length,
        notes: buildNotes({
          results,
          failedDiagnostics,
          importSourceType: importReviewStats.importSourceType,
          labelOrderRows: importReviewStats.labelOrderRows,
          manifestOrderRows: importReviewStats.manifestOrderRows,
          picklistSummaryRows: importReviewStats.picklistSummaryRows,
          importableOrderRows: importReviewStats.importableOrderRows,
          importSourceRows: importReviewStats.importSourceRows,
          existingDuplicateRows: importReviewStats.existingDuplicateRows,
          missingImageRows: importReviewStats.missingImageRows,
          missingImageSkus: importReviewStats.missingImageSkus,
          blockingRows: importReviewStats.blockingRows,
          failureReason: parseFailureIssues[0]?.message
        })
      }
    });
    createdBatchId = batch.id;

    if (drafts.length > 0) {
      await prisma.uploadPreviewRow.createMany({
        data: drafts.map((row) => ({
          batchId: batch.id,
          sourceType: row.sourceType,
          pageNumber: row.pageNumber ?? null,
          awb: row.awb ?? null,
          courier: row.courier ?? null,
          sku: row.sku ?? null,
          qty: row.qty ?? null,
          color: row.color ?? null,
          size: row.size ?? null,
          orderNo: row.orderNo ?? null,
          productDescription: row.productDescription ?? null,
          paymentType: row.paymentType ?? "UNKNOWN",
          confidence: row.confidence,
          rawData: JSON.stringify(row.rawData),
          issues: JSON.stringify(row.issues)
        }))
      });
    }

    const rowIssueData = drafts.flatMap((row) =>
      row.issues.map((issue) => ({
        batchId: batch.id,
        rowNumber: row.pageNumber ?? null,
        issueType: issue.issueType,
        message: issue.message,
        rawData: JSON.stringify({
          sourceType: row.sourceType,
          sourceFileName: row.sourceFileName,
          pageNumber: row.pageNumber,
          awb: row.awb,
          sku: row.sku
        })
      }))
    );
    const globalIssueData = combinedIssues
      .filter((issue) => !issue.awb && !issue.sku)
      .map((issue) => ({
        batchId: batch.id,
        rowNumber: issue.pageNumber ?? null,
        issueType: issue.issueType,
        message: issue.message,
        rawData: JSON.stringify(issue)
      }));

    if (rowIssueData.length > 0 || globalIssueData.length > 0) {
      await prisma.importRowIssue.createMany({
        data: [...rowIssueData, ...globalIssueData]
      });
    }

    await recordAuditLog({
      userId: user.id,
      accountId: account.id,
      action: "BATCH_IMPORT",
      entityType: "UploadBatch",
      entityId: batch.id,
      metadata: {
        phase: "parse-preview",
        fileName,
        importSourceType: importReviewStats.importSourceType,
        labelOrderRows: importReviewStats.labelOrderRows,
        manifestOrderRows: importReviewStats.manifestOrderRows,
        picklistSummaryRows: importReviewStats.picklistSummaryRows,
        importableOrderRows: importReviewStats.importableOrderRows,
        lowConfidenceRows,
        duplicateRows,
        missingImageRows: importReviewStats.missingImageRows,
        missingImageSkus: importReviewStats.missingImageSkus,
        errorRows
      },
      request
    });

    revalidatePath("/dashboard");
    revalidatePath("/owner");
    redirectTo = `/owner/uploads/${batch.id}/review`;
  } catch (error) {
    const message = sanitizePublicActionError(error, "PDF parsing failed.") ?? "PDF parsing failed.";

    if (!createdBatchId) {
      try {
        const failedDiagnostics = files.map((file) => buildFailedDiagnostic(file.name, message));
        const batch = await prisma.uploadBatch.create({
          data: {
            accountId: account.id,
            createdByUserId: user.id,
            fileName: files.map((file) => file.name).join(" + "),
            importType: "ORDER_LABEL",
            status: "FAILED",
            totalRows: 0,
            skippedRows: 0,
            errorRows: 1,
            notes: buildNotes({
              results: [],
              failedDiagnostics,
              importSourceType: labelFileUploaded ? "LABEL" : "MANIFEST_ORDER",
              labelOrderRows: 0,
              manifestOrderRows: 0,
              picklistSummaryRows: 0,
              importableOrderRows: 0,
              importSourceRows: 0,
              existingDuplicateRows: 0,
              missingImageRows: 0,
              missingImageSkus: 0,
              blockingRows: 0,
              failureReason: message
            })
          }
        });

        await prisma.importRowIssue.create({
          data: {
            batchId: batch.id,
            issueType: "PDF_PARSE_FAILED",
            message,
            rawData: JSON.stringify({ fileNames: files.map((file) => file.name) })
          }
        });

        redirectTo = `/owner/uploads/${batch.id}/review?error=parse-failed`;
      } catch {
        redirectTo = "/owner/uploads/new?error=parse-failed";
      }
    } else {
      redirectTo = `/owner/uploads/${createdBatchId}/review?error=parse-failed`;
    }

    await recordAuditLog({
      userId: user.id,
      accountId: account.id,
      action: "BATCH_IMPORT",
      entityType: "UploadBatch",
      metadata: {
        phase: "parse-failed",
        fileNames: files.map((file) => file.name),
        message
      },
      request
    });
  }

  redirect(redirectTo);
}

export async function createFlipkartOrderImportAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const account = await ownerUploadAccount(formData, selectedAccount.id);
  const request = await getRequestMeta();
  const file = formData.get("flipkartOrderExcel");

  if (!account) {
    redirect("/owner/uploads/new?error=account");
  }

  if (!(file instanceof File) || file.size === 0) {
    redirect("/owner/uploads/new?error=missing-flipkart-orders");
  }

  if (isUploadTooLarge(file, FLIPKART_IMPORT_MAX_BYTES)) {
    redirect("/owner/uploads/new?error=flipkart-file-too-large");
  }

  const parsed = flipkartOrderImportFileSchema.safeParse({ filename: file.name });

  if (!parsed.success) {
    redirect("/owner/uploads/new?error=invalid-flipkart-orders");
  }

  let jobId: string;

  try {
    const job = await createFlipkartImportJobFromFile({
      file,
      account,
      user,
      importType: "FLIPKART_ORDER"
    });
    startImportJob(job.id, request);
    jobId = job.id;
  } catch {
    redirect("/owner/uploads/new?error=flipkart-order-import-failed");
  }

  revalidatePath("/dashboard");
  revalidatePath("/owner");
  revalidatePath("/owner/uploads/new");
  redirect(`/owner/imports/${jobId}`);
}

export async function createAmazonOrderImportAction(formData: FormData) {
  const user=await requireUser(["OWNER"]);const selectedAccount=await requireAccount(user);const account=await ownerUploadAccount(formData,selectedAccount.id);const file=formData.get("amazonOrderFile");
  if(!account||account.marketplace!=="AMAZON")redirect("/owner/uploads/new?error=account");
  try{assertMarketplaceCapability(account.marketplace,"dailyOrders");}catch{redirect("/owner/uploads/new?error=amazon-daily-orders-disabled");}
  if(!(file instanceof File)||file.size===0)redirect("/owner/uploads/new?error=missing-amazon-orders");
  if(file.size>25*1024*1024)redirect("/owner/uploads/new?error=amazon-order-file-too-large");
  if(!/\.(csv|tsv|txt)$/i.test(file.name))redirect("/owner/uploads/new?error=invalid-amazon-orders");
  let batchId="";try{const rows=parseAmazonOrderReport(Buffer.from(await file.arrayBuffer()).toString("utf8"),file.name);const batch=await importParsedOrderRows({rows,fileName:file.name,account,user,request:await getRequestMeta()});batchId=batch.id;}catch{redirect("/owner/uploads/new?error=amazon-order-import-failed");}revalidatePath("/picker");revalidatePath("/packing");redirect(`/owner/uploads/${batchId}/review`);
}

export async function confirmParsedBatchAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const batchId = String(formData.get("batchId") ?? "");

  if (!batchId) {
    redirect("/owner/uploads/new?error=invalid-batch");
  }

  const batch = await prisma.uploadBatch.findFirst({
    where: { id: batchId, accountId: account.id },
    select: { id: true }
  });
  if (!batch) redirect("/owner/uploads/new?error=invalid-batch");
  redirect(`/owner/uploads/${batch.id}/review?error=legacy-review-only`);
}

export async function prepareBatchProductImagesAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const batchId = String(formData.get("batchId") ?? "");

  if (!batchId) {
    redirect("/owner/uploads/new?error=invalid-batch");
  }

  const batch = await prisma.uploadBatch.findFirst({
    where: {
      id: batchId,
      accountId: account.id
    },
    include: {
      orders: {
        select: {
          sku: true,
          marketplace: true
        }
      }
    }
  });

  if (!batch) {
    redirect("/owner/uploads/new?error=invalid-batch");
  }

  const batchSkus = Array.from(new Set(batch.orders.map((order) => normalizeSkuForMatching(order.sku)).filter(Boolean)));
  const hasFlipkartOrders = batch.orders.some((order) => order.marketplace === "FLIPKART");
  const now = new Date();

  if (hasFlipkartOrders && batchSkus.length > 0) {
    const [listingImages, existingMappings] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where: {
          accountId: account.id,
          marketplace: "FLIPKART",
          sku: { in: batchSkus }
        },
        select: {
          sku: true,
          productTitle: true,
          liveTitle: true,
          mainImageUrl: true
        }
      }),
      prisma.skuImageMapping.findMany({
        where: {
          accountId: account.id,
          sku: { in: batchSkus }
        },
        select: {
          id: true,
          sku: true,
          imageUrl: true,
          productName: true,
          cacheStatus: true
        }
      })
    ]);
    const existingMappingBySku = new Map(existingMappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));

    for (const listing of listingImages) {
      const sku = normalizeSkuForMatching(listing.sku);

      if (!sku || !listing.mainImageUrl) {
        continue;
      }

      const existing = existingMappingBySku.get(sku);
      const productName = listing.productTitle ?? listing.liveTitle ?? null;

      if (!existing) {
        await prisma.skuImageMapping.create({
          data: {
            accountId: account.id,
            sku,
            imageUrl: listing.mainImageUrl,
            productName,
            active: true,
            source: "Flipkart Listing Master",
            notes: JSON.stringify({ marketplace: "FLIPKART", listingMaster: true }),
            lastImportedAt: now,
            imageHealth: "UNKNOWN",
            cacheStatus: "NOT_CACHED"
          }
        });
      } else if (existing.imageUrl !== listing.mainImageUrl || existing.productName !== productName) {
        await prisma.skuImageMapping.update({
          where: { id: existing.id },
          data: {
            imageUrl: listing.mainImageUrl,
            productName,
            active: true,
            source: "Flipkart Listing Master",
            notes: JSON.stringify({ marketplace: "FLIPKART", listingMaster: true }),
            lastImportedAt: now,
            imageHealth: "UNKNOWN",
            cacheStatus: "RECHECK_NEEDED",
            cacheOriginalImageUrl: null,
            cacheError: null
          }
        });
      }
    }
  }

  const mappings =
    batchSkus.length > 0
      ? await prisma.skuImageMapping.findMany({
          where: {
            accountId: account.id,
            sku: { in: batchSkus },
            active: true
          },
          select: {
            id: true,
            accountId: true,
            sku: true,
            imageUrl: true,
            cacheStatus: true,
            cacheFilePath: true,
            cacheOriginalImageUrl: true,
            cacheCachedAt: true
          }
        })
      : [];
  const mappingBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));
  const queue: CacheQueueMapping[] = [];
  let alreadyCached = 0;
  let noMapping = 0;
  let noImageUrl = 0;
  let newlyCached = 0;
  let failed = 0;

  if (mappings.length > 0) {
    await prisma.skuImageMapping.updateMany({
      where: {
        id: { in: mappings.map((mapping) => mapping.id) },
        accountId: account.id
      },
      data: {
        cacheLastUsedAt: now
      }
    });
  }

  for (const sku of batchSkus) {
    const mapping = mappingBySku.get(sku);

    if (!mapping) {
      noMapping += 1;
      continue;
    }

    if (!mapping.imageUrl) {
      noImageUrl += 1;
      continue;
    }

    if (!imageCacheNeedsRefresh(mapping)) {
      alreadyCached += 1;
      continue;
    }

    queue.push({
      ...mapping,
      imageUrl: mapping.imageUrl
    });
  }

  await runWithConcurrency(queue, 3, async (mapping) => {
    const status = await cacheQueueMapping(mapping);

    if (status === "CACHED") {
      newlyCached += 1;
    } else {
      failed += 1;
    }
  });

  const result = {
    totalSkus: batchSkus.length,
    alreadyCached,
    newlyCached,
    failed,
    noMapping,
    noImageUrl
  };

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "BATCH_IMAGE_CACHE_PREPARE",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: result,
    request
  });

  revalidatePath(`/owner/uploads/${batch.id}/review`);
  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(
    `/owner/uploads/${batch.id}/review?prepared=1&totalSkus=${result.totalSkus}&alreadyCached=${result.alreadyCached}&newlyCached=${result.newlyCached}&failed=${result.failed}&noMapping=${result.noMapping}&noImageUrl=${result.noImageUrl}`
  );
}
