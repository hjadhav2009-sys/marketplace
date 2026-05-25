"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentType } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { requireAccount, requireUser } from "@/lib/auth";
import { importParsedOrderRows, type ParsedOrderImportRow } from "@/lib/import/orders";
import { hasBlockingPreviewIssue, isOrderPreviewSourceType } from "@/lib/import/preview";
import {
  crossCheckMeeshoParsedRows,
  parseMeeshoPdfBuffer,
  type MeeshoParserDiagnostics,
  type MeeshoParseResult,
  type ParseIssue
} from "@/lib/parsers/meesho";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { uploadBatchSchema } from "@/lib/validators";

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

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
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
  parsedOrders: number;
  parsedSummaryRows: number;
  existingDuplicateRows: number;
  missingImageRows: number;
  blockingRows: number;
  failureReason?: string;
}) {
  const diagnostics = [...input.results.map((result) => result.diagnostics), ...(input.failedDiagnostics ?? [])];
  const stats = diagnostics.reduce(
    (acc, result) => ({
      totalPages: acc.totalPages + result.pageCount,
      pagesWithText: acc.pagesWithText + result.pagesWithText,
      pagesWithoutText: acc.pagesWithoutText + result.pagesWithoutText,
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
      parsedOrders: input.parsedOrders,
      parsedSummaryRows: input.parsedSummaryRows,
      existingDuplicateRows: input.existingDuplicateRows,
      missingImageRows: input.missingImageRows,
      blockingRows: input.blockingRows
    }
  });
}

export async function createUploadBatchAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const files = [formData.get("labelPdf"), formData.get("manifestPdf")].filter(isUploadFile);

  if (files.length === 0) {
    redirect("/owner/uploads/new?error=missing-file");
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
          buildFailedDiagnostic(file.name, error instanceof Error ? error.message : "Unknown PDF parse error.")
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

    const awbs = drafts.map((row) => row.awb).filter((awb): awb is string => Boolean(awb));
    const skus = drafts.map((row) => row.sku).filter((sku): sku is string => Boolean(sku));
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
    const mappedSkus = new Set(mappings.map((mapping) => mapping.sku));

    for (const draft of drafts) {
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

      if (draft.sku && !mappedSkus.has(draft.sku)) {
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

    const orderDrafts = drafts.filter((row) => isOrderPreviewSourceType(row.sourceType));
    const missingImageRows = drafts.filter((row) => hasIssue(row, "MISSING_IMAGE_MAPPING")).length;
    const duplicateRows = orderDrafts.filter((row) => hasIssue(row, "DUPLICATE_EXISTING_AWB") || hasIssue(row, "DUPLICATE_AWB_INSIDE_FILE")).length;
    const blockingRows = orderDrafts.filter((row) => hasBlockingPreviewIssue(row.issues)).length;
    const errorRows = orderDrafts.filter((row) => row.issues.some((issue) => issue.severity === "ERROR")).length;
    const lowConfidenceRows = orderDrafts.filter((row) => hasIssue(row, "LOW_CONFIDENCE")).length;
    const fileName = files.map((file) => file.name).join(" + ");
    const hasParserDiagnosticsWarning =
      failedDiagnostics.length > 0 ||
      results.some((result) => result.diagnostics.scannedPdfLikely || result.diagnostics.unknownLayoutPages > 0);
    const status = orderDrafts.length === 0 ? "FAILED" : hasParserDiagnosticsWarning ? "REVIEWED" : "PARSED";

    const batch = await prisma.uploadBatch.create({
      data: {
        accountId: account.id,
        createdByUserId: user.id,
        fileName,
        importType: "ORDER_LABEL",
        status,
        totalRows: orderDrafts.length,
        duplicateRows,
        missingImageRows,
        skippedRows: blockingRows,
        errorRows: errorRows + parseFailureIssues.length,
        notes: buildNotes({
          results,
          failedDiagnostics,
          parsedOrders: orderDrafts.length,
          parsedSummaryRows: drafts.length - orderDrafts.length,
          existingDuplicateRows: orderDrafts.filter((row) => hasIssue(row, "DUPLICATE_EXISTING_AWB")).length,
          missingImageRows,
          blockingRows,
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
        parsedOrders: orderDrafts.length,
        parsedSummaryRows: drafts.length - orderDrafts.length,
        lowConfidenceRows,
        duplicateRows,
        missingImageRows,
        errorRows
      },
      request
    });

    revalidatePath("/owner");
    redirectTo = `/owner/uploads/${batch.id}/review`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";

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
              parsedOrders: 0,
              parsedSummaryRows: 0,
              existingDuplicateRows: 0,
              missingImageRows: 0,
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

export async function confirmParsedBatchAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const batchId = String(formData.get("batchId") ?? "");

  if (!batchId) {
    redirect("/owner/uploads/new?error=invalid-batch");
  }

  let redirectTo = `/owner/uploads/${batchId}/review?error=confirm-failed`;

  try {
    const batch = await prisma.uploadBatch.findFirst({
      where: {
        id: batchId,
        accountId: account.id
      },
      include: {
        previewRows: {
          orderBy: [{ sourceType: "asc" }, { pageNumber: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!batch) {
      redirectTo = "/owner/uploads/new?error=invalid-batch";
    } else {
      const hasLabels = batch.previewRows.some((row) => row.sourceType === "LABEL");
      const importSourceType = hasLabels ? "LABEL" : "MANIFEST_ORDER";
      const seenAwbs = new Set<string>();
      const importedPreviewIds: string[] = [];
      const rows: ParsedOrderImportRow[] = [];
      let heldBlockingRows = 0;

      for (const preview of batch.previewRows) {
        if (preview.sourceType !== importSourceType || preview.imported) {
          continue;
        }

        const issues = parseStoredIssues(preview.issues);

        if (hasBlockingPreviewIssue(issues) || !preview.awb || !preview.sku) {
          heldBlockingRows += 1;
          continue;
        }

        if (seenAwbs.has(preview.awb)) {
          continue;
        }

        seenAwbs.add(preview.awb);
        importedPreviewIds.push(preview.id);
        rows.push({
          rowNumber: preview.pageNumber ?? undefined,
          awb: preview.awb,
          courier: preview.courier,
          sku: preview.sku,
          qty: preview.qty,
          color: preview.color,
          size: preview.size,
          orderNo: preview.orderNo,
          productDescription: preview.productDescription,
          paymentType: preview.paymentType,
          city: null,
          state: null
        });
      }

      if (rows.length === 0) {
        await prisma.uploadBatch.update({
          where: { id: batch.id },
          data: {
            status: "REVIEWED"
          }
        });
        redirectTo = `/owner/uploads/${batch.id}/review?error=no-importable-rows`;
      } else {
        await importParsedOrderRows({
          batchId: batch.id,
          rows,
          fileName: batch.fileName,
          account,
          user,
          request
        });

        await prisma.uploadPreviewRow.updateMany({
          where: {
            id: { in: importedPreviewIds },
            batchId: batch.id
          },
          data: {
            imported: true
          }
        });

        if (heldBlockingRows > 0) {
          await prisma.uploadBatch.update({
            where: { id: batch.id },
            data: {
              status: "REVIEWED"
            }
          });
        }

        redirectTo = `/owner/uploads/${batch.id}/review?imported=1`;
      }

      revalidatePath("/owner");
      revalidatePath(`/owner/uploads/${batch.id}/review`);
    }
  } catch (error) {
    await recordAuditLog({
      userId: user.id,
      accountId: account.id,
      action: "BATCH_IMPORT",
      entityType: "UploadBatch",
      entityId: batchId,
      metadata: {
        phase: "confirm-failed",
        message: error instanceof Error ? error.message : "Unknown import error"
      },
      request
    });
    redirectTo = `/owner/uploads/${batchId}/review?error=confirm-failed`;
  }

  redirect(redirectTo);
}
