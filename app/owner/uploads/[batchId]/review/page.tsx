import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cachedProductImageUrl } from "@/lib/image-cache";
import {
  buildPreviewImportStats,
  isOrderPreviewSourceType,
  previewImportSourceLabel,
  reviewProblemIssues,
  type ImportPreviewSourceType
} from "@/lib/import/preview";
import type { MeeshoParserDiagnostics, ParseIssue } from "@/lib/parsers/meesho";
import { prisma } from "@/lib/prisma";
import { picklistSummaryProductNameLabel } from "@/lib/product-image";
import { normalizeSkuForMatching } from "@/lib/sku";
import { flipkartIssueRawContext } from "@/src/lib/marketplaces/flipkart";
import { confirmParsedBatchAction, prepareBatchProductImagesAction, repairMissingSkuImageMappingAction } from "../../actions";

const REVIEW_PAGE_SIZE = 50;

type ReviewPageProps = {
  params: Promise<{
    batchId: string;
  }>;
  searchParams?: Promise<{
    q?: string;
    issue?: string;
    problems?: string;
    imported?: string;
    prepared?: string;
    totalSkus?: string;
    alreadyCached?: string;
    newlyCached?: string;
    failed?: string;
    noMapping?: string;
    noImageUrl?: string;
    imageRepair?: string;
    mappingsCreated?: string;
    mappingsUpdated?: string;
    cached?: string;
    failedCache?: string;
    imageRepairError?: string;
    error?: string;
  }>;
};

type BatchStats = {
  totalPages?: number;
  pagesWithText?: number;
  pagesWithoutText?: number;
  parsedOrders?: number;
  parsedLabelOrders?: number;
  parsedManifestOrders?: number;
  parsedSummaryRows?: number;
  labelOrderRows?: number;
  manifestOrderRows?: number;
  picklistSummaryRows?: number;
  importSourceType?: ImportPreviewSourceType;
  importSourceRows?: number;
  importableOrderRows?: number;
  missingAwb?: number;
  missingSku?: number;
  lowConfidenceRows?: number;
  duplicateAwbInsideFile?: number;
  duplicateSkuSummaryRows?: number;
  unknownLayoutPages?: number;
  scannedPdfLikely?: boolean;
  existingDuplicateRows?: number;
  missingImageRows?: number;
  missingImageSkus?: number;
  blockingRows?: number;
};

type BatchNotes = {
  marketplace?: string;
  parser?: string;
  parsedRows?: number;
  importableRows?: number;
  heldRows?: number;
  parserVersion?: string;
  diagnostics?: MeeshoParserDiagnostics[];
  files?: Array<Partial<MeeshoParserDiagnostics> & { stats?: BatchStats }>;
  failureReason?: string;
  stats?: BatchStats;
  importStats?: {
    attemptedRows?: number;
    createdRows?: number;
    updatedRows?: number;
    duplicateRows?: number;
    missingImageRows?: number;
    skippedRows?: number;
    errorRows?: number;
    metadataAutoFilled?: number;
    confirmedAt?: string;
  };
};

function parseNotes(value: string | null): BatchNotes {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as BatchNotes) : {};
  } catch {
    return {};
  }
}

function parseIssues(value: string | null) {
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

function parseIssueRawData(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function diagnosticsFromNotes(notes: BatchNotes): MeeshoParserDiagnostics[] {
  if (Array.isArray(notes.diagnostics)) {
    return notes.diagnostics;
  }

  if (!Array.isArray(notes.files)) {
    return [];
  }

  return notes.files.map((file) => {
    const parsedOrders = file.parsedOrders ?? file.stats?.parsedOrders ?? 0;

    return {
      fileName: file.fileName ?? "Unknown file",
      detectedType: file.detectedType ?? "UNKNOWN",
      pageCount: file.pageCount ?? file.stats?.totalPages ?? 0,
      pagesWithText: file.pagesWithText ?? file.stats?.pagesWithText ?? 0,
      pagesWithoutText: file.pagesWithoutText ?? file.stats?.pagesWithoutText ?? 0,
      parsedOrders,
      parsedLabelOrders: file.parsedLabelOrders ?? file.stats?.parsedLabelOrders ?? (file.detectedType === "LABEL_PDF" ? parsedOrders : 0),
      parsedManifestOrders: file.parsedManifestOrders ?? file.stats?.parsedManifestOrders ?? (file.detectedType === "MANIFEST_PDF" ? parsedOrders : 0),
      parsedSummaryRows: file.parsedSummaryRows ?? file.stats?.parsedSummaryRows ?? 0,
      missingAwb: file.missingAwb ?? file.stats?.missingAwb ?? 0,
      missingSku: file.missingSku ?? file.stats?.missingSku ?? 0,
      lowConfidenceRows: file.lowConfidenceRows ?? file.stats?.lowConfidenceRows ?? 0,
      duplicateAwbInsideFile: file.duplicateAwbInsideFile ?? file.stats?.duplicateAwbInsideFile ?? 0,
      unknownLayoutPages: file.unknownLayoutPages ?? file.stats?.unknownLayoutPages ?? 0,
      scannedPdfLikely: file.scannedPdfLikely ?? file.stats?.scannedPdfLikely ?? false,
      parserWarnings: file.parserWarnings ?? [],
      pageDiagnostics: file.pageDiagnostics ?? []
    };
  });
}

function issueTone(issueType: string) {
  if (issueType === "LOW_CONFIDENCE") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (issueType.includes("MISSING_AWB") || issueType.includes("MISSING_SKU") || issueType.includes("MISMATCH")) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (issueType.includes("DUPLICATE")) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (issueType.includes("IMAGE")) {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function issueLabel(issueType: string) {
  return issueType === "LOW_CONFIDENCE" ? "Needs review" : issueType;
}

function imageBadge(mapping: { imageUrl: string; imageHealth: string; cacheStatus?: string | null } | undefined) {
  if (!mapping) {
    return <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">Missing image</span>;
  }

  if (mapping.cacheStatus === "CACHED") {
    return <span className="inline-flex rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">Cached locally</span>;
  }

  if (mapping.cacheStatus === "BROKEN" || mapping.imageHealth === "BROKEN") {
    return <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">Image URL failed</span>;
  }

  if (mapping.imageHealth === "BROKEN") {
    return <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">Broken image URL</span>;
  }

  return <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">Image not prepared</span>;
}

export default async function ParseReviewPage({ params, searchParams }: ReviewPageProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const { batchId } = await params;
  const filters = await searchParams;
  const batch = await prisma.uploadBatch.findFirst({
    where: {
      id: batchId,
      accountId: account.id
    },
    include: {
      orders: {
        orderBy: { createdAt: "asc" }
      },
      issues: {
        orderBy: { createdAt: "asc" }
      },
      previewRows: {
        orderBy: [{ sourceType: "asc" }, { pageNumber: "asc" }, { createdAt: "asc" }]
      },
      createdBy: true
    }
  });

  if (!batch) {
    notFound();
  }

  const notes = parseNotes(batch.notes);
  if (notes.marketplace === "FLIPKART" && notes.parser === "flipkart-orders-xlsx") {
    const issueRows = batch.issues.map((issue) => ({
      ...issue,
      context: flipkartIssueRawContext(parseIssueRawData(issue.rawData))
    }));
    const duplicateRows = issueRows.filter((issue) => issue.issueType.includes("DUPLICATE"));
    const heldRows = issueRows.filter((issue) => issue.issueType === "MISSING_FLIPKART_DUPLICATE_KEY" || issue.issueType === "MISSING_SKU");
    const missingListingRows = issueRows.filter((issue) => issue.issueType === "MISSING_FLIPKART_LISTING_MAPPING");
    const listingImageMissingRows = issueRows.filter((issue) => issue.issueType === "FLIPKART_LISTING_IMAGE_MISSING");
    const missingMappingRows = [...missingListingRows, ...listingImageMissingRows];
    const otherIssueRows = issueRows.filter(
      (issue) =>
        !duplicateRows.some((row) => row.id === issue.id) &&
        !heldRows.some((row) => row.id === issue.id) &&
        !missingMappingRows.some((row) => row.id === issue.id)
    );
    const visibleOrders = batch.orders.slice(0, REVIEW_PAGE_SIZE);
    const orderSkus = Array.from(new Set(visibleOrders.flatMap((order) => [order.sku, normalizeSkuForMatching(order.sku)].filter(Boolean))));
    const reviewListings = await prisma.marketplaceListing.findMany({
      where: {
        accountId: account.id,
        marketplace: "FLIPKART",
        sku: { in: orderSkus }
      },
      select: {
        sku: true,
        productTitle: true,
        liveTitle: true,
        mainImageUrl: true
      }
    });
    const reviewListingBySku = new Map(reviewListings.map((listing) => [normalizeSkuForMatching(listing.sku), listing]));
    const validRows = notes.importableRows ?? batch.createdRows + batch.updatedRows + batch.duplicateRows;
    const issueTable = (rows: typeof issueRows, emptyTitle: string, emptyDescription: string) => {
      const visibleRows = rows.slice(0, REVIEW_PAGE_SIZE);

      return rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Showing {visibleRows.length} of {rows.length} issue rows
          </div>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Shipment ID</th>
                <th className="px-3 py-2">ORDER ITEM ID</th>
                <th className="px-3 py-2">Tracking ID</th>
                <th className="px-3 py-2">Product</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((issue) => (
                <tr key={issue.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-950">{issue.rowNumber ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${issueTone(issue.issueType)}`}>
                      {issueLabel(issue.issueType)}
                    </span>
                  </td>
                  <td className="min-w-64 px-3 py-2 text-slate-700">{issue.message}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-950">{issue.context.sku ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{issue.context.shipmentId ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{issue.context.orderItemId ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{issue.context.trackingId ?? "-"}</td>
                  <td className="min-w-56 px-3 py-2 text-slate-700">{issue.context.product ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      );
    };

    return (
      <AppShell>
        <PageHeader
          eyebrow="Review"
          title="Flipkart import review"
          description="Review imported rows, duplicate rows, held bad rows, and missing listing or image mappings for this Flipkart Order Excel/CSV batch."
        >
          <StatusBadge value={batch.status} />
        </PageHeader>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">File</p>
              <p className="font-semibold text-slate-950">{batch.fileName}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Uploaded</p>
              <p className="font-semibold text-slate-950">{formatDateTime(batch.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Uploaded by</p>
              <p className="font-semibold text-slate-950">{batch.createdBy?.name ?? "Unknown"}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Total rows", batch.totalRows],
            ["Valid rows", validRows],
            ["Created", batch.createdRows],
            ["Updated", batch.updatedRows],
            ["Duplicate rows", duplicateRows.length || batch.duplicateRows],
            ["Held rows", heldRows.length || notes.heldRows || 0],
            ["Missing listings", missingListingRows.length],
            ["Listing image missing", listingImageMissingRows.length]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Valid rows imported</h2>
            <p className="mt-1 text-sm text-slate-600">Bad rows are held by issue records and are not auto-imported.</p>
          </div>
          {batch.orders.length > 0 ? (
            <div className="divide-y divide-slate-100">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Showing {visibleOrders.length} of {batch.orders.length} imported rows
              </div>
              {visibleOrders.map((order) => (
                <div key={order.id} className="grid gap-3 px-4 py-4 md:grid-cols-[auto_1fr] md:items-center">
                  <ProductImage
                    src={reviewListingBySku.get(normalizeSkuForMatching(order.sku))?.mainImageUrl ?? order.imageUrl}
                    alt={`${order.sku} product image`}
                    size="sm"
                    showBadge={false}
                  />
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SKU</p>
                      <p className="break-words font-bold text-slate-950">{order.sku}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</p>
                      <p className="break-words text-sm text-slate-700">
                        {reviewListingBySku.get(normalizeSkuForMatching(order.sku))?.productTitle ??
                          reviewListingBySku.get(normalizeSkuForMatching(order.sku))?.liveTitle ??
                          order.productDescription ??
                          "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tracking ID</p>
                      <p className="break-words text-sm font-semibold text-slate-950">{order.trackingId ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">IDs</p>
                      <p className="break-words text-sm text-slate-700">
                        Shipment {order.shipmentId ?? "-"} / Item {order.orderItemId ?? "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No valid rows imported" description="All rows in this Flipkart file were held or skipped. Check the issue sections below." />
            </div>
          )}
        </section>

        <section className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Missing listing / image mapping review</h2>
              <p className="mt-1 text-sm text-slate-600">
                Import Flipkart Listings first so order SKU matches Seller SKU Id. Orders still import when images are missing.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              {missingListingRows.length > 0 ? (
                <Link href={`/owner/uploads/${batch.id}/review/missing-mappings?kind=listing`} className="text-berry hover:text-pink-800">
                  Download missing listing mappings CSV
                </Link>
              ) : null}
              {listingImageMissingRows.length > 0 ? (
                <Link href={`/owner/uploads/${batch.id}/review/missing-mappings?kind=image`} className="text-berry hover:text-pink-800">
                  Download missing image mappings CSV
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-4">{issueTable(missingMappingRows, "No missing mappings", "All imported Flipkart order SKUs have usable listing image mappings.")}</div>
        </section>

        <section className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-950">Duplicate rows</h2>
          <div className="mt-4">{issueTable(duplicateRows, "No duplicate rows", "No duplicate ORDER ITEM ID rows were detected inside this upload.")}</div>
        </section>

        <section className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-950">Held rows and missing required fields</h2>
          <div className="mt-4">
            {issueTable(heldRows, "No held rows", "Every row had SKU plus ORDER ITEM ID or Shipment ID + SKU.")}
          </div>
        </section>

        {otherIssueRows.length > 0 ? (
          <section className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Other import issues</h2>
            <div className="mt-4">{issueTable(otherIssueRows, "No other issues", "No other Flipkart import issues were found.")}</div>
          </section>
        ) : null}
      </AppShell>
    );
  }

  const diagnostics = diagnosticsFromNotes(notes);
  const needsOcr = diagnostics.some((diagnostic) => diagnostic.scannedPdfLikely);
  const parserWarnings = Array.from(new Set(diagnostics.flatMap((diagnostic) => diagnostic.parserWarnings)));
  const problemPages = diagnostics.flatMap((diagnostic) =>
    diagnostic.pageDiagnostics
      .filter((page) => page.issues.length > 0)
      .map((page) => ({
        fileName: diagnostic.fileName,
        ...page
      }))
  );
  const previewRows = batch.previewRows.map((row) => ({
    ...row,
    parsedIssues: parseIssues(row.issues)
  }));
  const importReviewStats = buildPreviewImportStats(previewRows, notes.stats?.importSourceType);
  const importSourceLabel = previewImportSourceLabel(importReviewStats.importSourceType);
  const importSourceRows = previewRows.filter((row) => row.sourceType === importReviewStats.importSourceType);
  const skus = Array.from(new Set(previewRows.flatMap((row) => [row.sku, normalizeSkuForMatching(row.sku)].filter((sku): sku is string => Boolean(sku)))));
  const mappings = await prisma.skuImageMapping.findMany({
    where: {
      accountId: account.id,
      sku: { in: skus },
      active: true
    },
    select: {
      id: true,
      sku: true,
      imageUrl: true,
      productName: true,
      color: true,
      size: true,
      imageHealth: true,
      cacheStatus: true,
      cacheFilePath: true,
      cacheOriginalImageUrl: true,
      cacheCachedAt: true
    }
  });
  const mappingsWithCachedUrls = mappings.map((mapping) => ({
    ...mapping,
    cachedImageUrl: cachedProductImageUrl(mapping)
  }));
  const mappingBySku = new Map(mappingsWithCachedUrls.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));
  const missingImageRepairs = Array.from(
    importSourceRows
      .reduce(
        (repairs, row) => {
          const sku = normalizeSkuForMatching(row.sku);

          if (!sku || !row.parsedIssues.some((issue) => issue.issueType === "MISSING_IMAGE_MAPPING") || mappingBySku.get(sku)?.imageUrl) {
            return repairs;
          }

          const existing = repairs.get(sku);

          repairs.set(sku, {
            sku,
            productName: existing?.productName ?? row.productDescription ?? null,
            color: existing?.color ?? row.color ?? null,
            size: existing?.size ?? row.size ?? null,
            rowCount: (existing?.rowCount ?? 0) + 1
          });

          return repairs;
        },
        new Map<string, { sku: string; productName: string | null; color: string | null; size: string | null; rowCount: number }>()
      )
      .values()
  );
  const visibleMissingImageRepairs = missingImageRepairs.slice(0, REVIEW_PAGE_SIZE);
  const issueTypes = Array.from(new Set(previewRows.flatMap((row) => row.parsedIssues.map((issue) => issue.issueType)))).sort();
  const query = filters?.q?.trim().toLowerCase() ?? "";
  const selectedIssue = filters?.issue ?? "";
  const onlyProblems = filters?.problems === "1";
  const filteredRows = previewRows
    .filter((row) => {
      const haystack = [row.awb, row.sku, row.orderNo, row.courier, row.color, row.size, row.productDescription].filter(Boolean).join(" ").toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesIssue = !selectedIssue || row.parsedIssues.some((issue) => issue.issueType === selectedIssue);
      const matchesProblems = !onlyProblems || row.parsedIssues.length > 0;
      return matchesQuery && matchesIssue && matchesProblems;
    })
    .sort((left, right) => {
      const leftLowConfidence = left.parsedIssues.some((issue) => issue.issueType === "LOW_CONFIDENCE") ? 0 : 1;
      const rightLowConfidence = right.parsedIssues.some((issue) => issue.issueType === "LOW_CONFIDENCE") ? 0 : 1;
      const leftError = left.parsedIssues.some((issue) => issue.severity === "ERROR") ? 0 : 1;
      const rightError = right.parsedIssues.some((issue) => issue.severity === "ERROR") ? 0 : 1;

      return (
        leftLowConfidence - rightLowConfidence ||
        leftError - rightError ||
        right.parsedIssues.length - left.parsedIssues.length ||
        (left.pageNumber ?? 0) - (right.pageNumber ?? 0)
      );
    });
  const filteredOrderRows = filteredRows.filter((row) => isOrderPreviewSourceType(row.sourceType));
  const filteredSummaryRows = filteredRows.filter((row) => row.sourceType === "PICKLIST_SUMMARY");
  const problemRows = filteredRows.flatMap((row) =>
    reviewProblemIssues(row.parsedIssues).map((issue) => ({
      row,
      issue
    }))
  );
  const visibleProblemRows = problemRows.slice(0, REVIEW_PAGE_SIZE);
  const visibleOrderRows = filteredOrderRows.slice(0, REVIEW_PAGE_SIZE);
  const visibleSummaryRows = filteredSummaryRows.slice(0, REVIEW_PAGE_SIZE);
  const visibleIssues = batch.issues.slice(0, REVIEW_PAGE_SIZE);
  const visibleImportedOrders = batch.orders.slice(0, REVIEW_PAGE_SIZE);
  const crossCheckIssueCount = batch.issues.filter((issue) => /MISMATCH|NOT_IN/i.test(issue.issueType)).length;
  const importableRows = importReviewStats.importableOrderRows;
  const confirmImportButtonText = `${importableRows} ${importSourceLabel} row${importableRows === 1 ? "" : "s"} will import`;
  const importStats = notes.importStats;
  const exactErrorMessage =
    filters?.error === "parse-failed"
      ? notes.failureReason ?? parserWarnings[0] ?? "Parsing failed before review rows could be created."
      : filters?.error === "no-importable-rows"
        ? "No rows are importable yet. Review missing AWB, missing SKU, and low confidence issues."
        : filters?.error
          ? "Import could not be completed. Review the issue list and try again."
          : null;
  const imageRepairErrorMessage =
    filters?.imageRepairError === "invalid"
      ? "Enter a valid SKU and http/https image URL."
      : filters?.imageRepairError === "save-failed"
        ? "Image mapping could not be saved. Check the URL and try again."
        : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Review"
        title="PDF parse review"
        description="Check parsed rows, missing fields, image mappings, and duplicate warnings before confirming import."
      >
        <StatusBadge value={batch.status} />
      </PageHeader>

      {filters?.imported ? (
        <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Import confirmed. Created, updated, duplicate, and issue counts are refreshed below.
        </div>
      ) : null}
      {filters?.prepared ? (
        <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
          Prepared today&apos;s images. Total SKUs: {filters.totalSkus ?? 0}; already cached: {filters.alreadyCached ?? 0};
          newly cached: {filters.newlyCached ?? 0}; failed: {filters.failed ?? 0}; no mapping: {filters.noMapping ?? 0};
          no image URL: {filters.noImageUrl ?? 0}.
        </div>
      ) : null}
      {filters?.imageRepair ? (
        <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
          Image mapping saved. Created: {filters.mappingsCreated ?? 0}; updated: {filters.mappingsUpdated ?? 0};
          cached: {filters.cached ?? 0}; failed cache: {filters.failedCache ?? 0}.
        </div>
      ) : null}
      {imageRepairErrorMessage ? (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {imageRepairErrorMessage}
        </div>
      ) : null}
      {exactErrorMessage ? (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {exactErrorMessage}
        </div>
      ) : null}

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">File</p>
            <p className="font-semibold text-slate-950">{batch.fileName}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Uploaded</p>
            <p className="font-semibold text-slate-950">{formatDateTime(batch.createdAt)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Uploaded by</p>
            <p className="font-semibold text-slate-950">{batch.createdBy?.name ?? "Unknown"}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <p className="text-sm text-slate-700">
            <span className="font-black text-slate-950">{importReviewStats.labelOrderRows}</span> label orders found
          </p>
          <p className="text-sm text-slate-700">
            <span className="font-black text-slate-950">{importReviewStats.manifestOrderRows}</span> manifest rows{" "}
            {importReviewStats.importSourceType === "LABEL" ? "used for cross-check" : "available for import"}
          </p>
          <p className="text-sm text-slate-700">
            <span className="font-black text-slate-950">{importableRows}</span> importable {importSourceLabel} rows
          </p>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Pages", notes.stats?.totalPages ?? "-"],
          ["Pages with text", notes.stats?.pagesWithText ?? "-"],
          ["No text pages", notes.stats?.pagesWithoutText ?? 0],
          ["Label orders", importReviewStats.labelOrderRows],
          [importReviewStats.importSourceType === "LABEL" ? "Manifest cross-check rows" : "Manifest order rows", importReviewStats.manifestOrderRows],
          ["Picklist summary rows", importReviewStats.picklistSummaryRows],
          [`Importable ${importSourceLabel} rows`, importableRows],
          ["Missing AWB", notes.stats?.missingAwb ?? 0],
          ["Missing SKU", notes.stats?.missingSku ?? 0],
          ["Low confidence", notes.stats?.lowConfidenceRows ?? 0],
          ["Unknown pages", notes.stats?.unknownLayoutPages ?? 0],
          ["Existing duplicate AWBs", importReviewStats.existingDuplicateRows],
          ["Blocking rows", importReviewStats.blockingRows],
          ["Missing image SKUs", missingImageRepairs.length || importReviewStats.missingImageSkus],
          ["Cross-checks", crossCheckIssueCount]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {diagnostics.length > 0 ? (
        <section className="mt-4 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Parser Diagnostics</h2>
              <p className="mt-1 text-sm text-slate-600">PDF text extraction, layout detection, and parser warnings for this upload.</p>
            </div>
            {needsOcr ? (
              <span className="inline-flex w-fit rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                Needs OCR
              </span>
            ) : null}
          </div>

          <div className="divide-y divide-slate-100">
            {diagnostics.map((diagnostic) => (
              <div key={diagnostic.fileName} className="px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{diagnostic.fileName}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {diagnostic.detectedType} / {diagnostic.pageCount} page{diagnostic.pageCount === 1 ? "" : "s"} / {diagnostic.pagesWithText} with text / {diagnostic.pagesWithoutText} without text
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {diagnostic.parsedLabelOrders} label orders / {diagnostic.parsedManifestOrders} manifest rows / {diagnostic.parsedSummaryRows} picklist rows
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {diagnostic.scannedPdfLikely ? (
                      <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                        Needs OCR
                      </span>
                    ) : null}
                    {diagnostic.unknownLayoutPages > 0 ? (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                        Unknown pages: {diagnostic.unknownLayoutPages}
                      </span>
                    ) : null}
                  </div>
                </div>

                {diagnostic.parserWarnings.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {diagnostic.parserWarnings.map((warning) => (
                      <p key={`${diagnostic.fileName}-${warning}`} className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {problemPages.length > 0 ? (
            <div className="border-t border-slate-200 px-4 py-4">
              <h3 className="text-sm font-semibold text-slate-950">Problem pages</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {problemPages.map((page) => (
                  <div key={`${page.fileName}-${page.pageNumber}-${page.issues.join("-")}`} className="rounded-md bg-slate-50 p-3 text-sm">
                    <p className="font-semibold text-slate-950">
                      {page.fileName} / Page {page.pageNumber}
                    </p>
                    <p className="mt-1 text-slate-600">
                      Section: {page.detectedSection}; text length: {page.textLength}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {page.issues.map((issue) => (
                        <span key={`${page.fileName}-${page.pageNumber}-${issue}`} className="inline-flex rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {importStats ? (
        <section className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Import result</h2>
              <p className="text-sm text-slate-600">
                Confirmed {importStats.confirmedAt ? formatDateTime(new Date(importStats.confirmedAt)) : "recently"} after preview review.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Attempted", importStats.attemptedRows ?? 0],
              ["New orders created", importStats.createdRows ?? batch.createdRows],
              ["Existing updated safely", importStats.updatedRows ?? batch.updatedRows],
              ["Existing duplicates skipped", importStats.duplicateRows ?? batch.duplicateRows],
              ["Held for review", importStats.skippedRows ?? batch.skippedRows],
              ["Missing image SKUs", missingImageRepairs.length],
              ["Metadata filled", importStats.metadataAutoFilled ?? 0],
              ["Errors", importStats.errorRows ?? 0]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {missingImageRepairs.length > 0 ? (
        <section className="mt-4 rounded-md border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-100 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Missing image mappings</h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste SKU image URLs here. Product name, color, and size are filled from the parsed order when those fields are empty.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Showing {visibleMissingImageRepairs.length} of {missingImageRepairs.length} missing image mapping rows
            </div>
            {visibleMissingImageRepairs.map((repair) => (
              <form key={repair.sku} action={repairMissingSkuImageMappingAction} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end">
                <input type="hidden" name="batchId" value={batch.id} />
                <input type="hidden" name="sku" value={repair.sku} />
                <input type="hidden" name="productName" value={repair.productName ?? ""} />
                <input type="hidden" name="color" value={repair.color ?? ""} />
                <input type="hidden" name="size" value={repair.size ?? ""} />
                <div>
                  <p className="break-words text-lg font-black text-slate-950">{repair.sku}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{repair.productName ?? "Product name will fill from future orders"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {repair.color ?? "Color unknown"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {repair.size ?? "Size unknown"}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                      {repair.rowCount} row{repair.rowCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">image_url</span>
                  <input
                    name="imageUrl"
                    type="url"
                    required
                    placeholder="https://images.meesho.com/..."
                    className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2 lg:min-w-64">
                  <button name="cache" value="0" className="min-h-12 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800">
                    Save mapping
                  </button>
                  <button name="cache" value="1" className="min-h-12 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                    Save + cache
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {batch.status === "IMPORTED" || importStats ? (
        <section className="mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Prepare today&apos;s product images</h2>
              <p className="mt-1 text-sm text-slate-600">
                Caches only missing or stale local card images for SKUs in this imported batch.
              </p>
              {missingImageRepairs.length > 0 ? (
                <p className="mt-2 text-sm font-semibold text-amber-800">Fix missing image URLs first.</p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-teal-700">Ready to prepare images.</p>
              )}
            </div>
            <form action={prepareBatchProductImagesAction}>
              <input type="hidden" name="batchId" value={batch.id} />
              <SubmitButton pendingText="Preparing...">Prepare today&apos;s product images</SubmitButton>
            </form>
          </div>
        </section>
      ) : null}

      {batch.status !== "IMPORTED" && previewRows.length > 0 ? (
        <section className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Confirm import</h2>
              <p className="mt-1 text-sm text-slate-600">
                {importableRows} {importSourceLabel} row{importableRows === 1 ? "" : "s"} will import through the duplicate-safe AWB workflow.
              </p>
              <p className="mt-1 text-sm font-medium text-amber-800">
                Low confidence rows are not imported until fixed/reviewed.
              </p>
            </div>
            {importableRows > 0 ? (
              <form action={confirmParsedBatchAction}>
                <input type="hidden" name="batchId" value={batch.id} />
                <SubmitButton pendingText="Importing...">{confirmImportButtonText}</SubmitButton>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Review filters</h2>
        </div>
        <form className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-[1fr_220px_auto_auto]" method="get">
          <input
            name="q"
            defaultValue={filters?.q ?? ""}
            placeholder="Search AWB, SKU, order no"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select name="issue" defaultValue={selectedIssue} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All issues</option>
            {issueTypes.map((issueType) => (
              <option key={issueType} value={issueType}>
                {issueType}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="problems" value="1" defaultChecked={onlyProblems} className="h-4 w-4 rounded border-slate-300" />
            Problems only
          </label>
          <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Apply
          </button>
        </form>
      </section>

      <details className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">
          Problem rows needing review
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{problemRows.length}</span>
        </summary>
        {problemRows.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState title="No problem rows match" description="Missing AWB, missing SKU, unknown layout, and low confidence rows will appear here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Showing {visibleProblemRows.length} of {problemRows.length} problem rows
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Source page</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">AWB</th>
                  <th className="px-4 py-3">Raw issue message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleProblemRows.map(({ row, issue }) => (
                  <tr key={`${row.id}-${issue.issueType}-${issue.message}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${issueTone(issue.issueType)}`}>
                        {issueLabel(issue.issueType)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">{row.sourceType}</p>
                      <p className="text-xs text-slate-500">Page {issue.pageNumber ?? row.pageNumber ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3">{row.sku ?? "Missing"}</td>
                    <td className="px-4 py-3">{row.awb ?? (row.sourceType === "PICKLIST_SUMMARY" ? "-" : "Missing")}</td>
                    <td className="px-4 py-3 text-slate-600">{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">
          Parsed order rows
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{filteredOrderRows.length}</span>
        </summary>
        {filteredOrderRows.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState title="No order rows match" description="Label and courier manifest order rows will appear here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Showing {visibleOrderRows.length} of {filteredOrderRows.length} parsed order rows
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Image</th>
                  <th className="px-4 py-3">AWB</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Color / Size</th>
                  <th className="px-4 py-3">Courier</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleOrderRows.map((row) => {
                  const mapping = row.sku ? mappingBySku.get(normalizeSkuForMatching(row.sku)) : undefined;

                  return (
                    <tr key={row.id} className={row.imported ? "bg-teal-50/40" : undefined}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            src={mapping?.cachedImageUrl}
                            alt={`${mapping?.productName ?? row.productDescription ?? row.sku ?? "Product"} ${row.sku ?? ""}`}
                            size="sm"
                            showBadge={false}
                            mappingId={mapping?.id}
                            showDebug
                            imageHealth={mapping?.imageHealth}
                            cacheStatus={mapping?.cacheStatus}
                            originalImageUrl={mapping?.imageUrl}
                          />
                          {imageBadge(mapping)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-950">{row.awb ?? "Missing"}</td>
                      <td className="px-4 py-3">{row.sku ?? "Missing"}</td>
                      <td className="px-4 py-3">{row.qty ?? "-"}</td>
                      <td className="px-4 py-3">
                        {[row.color, row.size].filter(Boolean).join(" / ") || "-"}
                      </td>
                      <td className="px-4 py-3">{row.courier ?? "-"}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{row.sourceType}</p>
                        <p className="text-xs text-slate-500">Page {row.pageNumber ?? "-"}</p>
                      </td>
                      <td className="px-4 py-3">{row.confidence}</td>
                      <td className="px-4 py-3">
                        {row.parsedIssues.length === 0 ? (
                          <span className="inline-flex rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">Ready</span>
                        ) : (
                          <div className="flex max-w-md flex-wrap gap-1">
                            {row.parsedIssues.slice(0, 4).map((issue) => (
                              <span key={`${row.id}-${issue.issueType}-${issue.message}`} className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${issueTone(issue.issueType)}`}>
                                {issueLabel(issue.issueType)}
                              </span>
                            ))}
                            {row.parsedIssues.length > 4 ? (
                              <span className="inline-flex rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                +{row.parsedIssues.length - 4}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">
          Picklist SKU summary rows
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {filteredSummaryRows.length}
          </span>
        </summary>
        {filteredSummaryRows.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState title="No picklist summary rows match" description="Picklist SKU totals appear separately because they do not contain AWB values." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Showing {visibleSummaryRows.length} of {filteredSummaryRows.length} summary rows
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Product image</th>
                  <th className="px-4 py-3">Product name</th>
                  <th className="px-4 py-3">Color</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Total quantity</th>
                  <th className="px-4 py-3">Image mapping status</th>
                  <th className="px-4 py-3">Source page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleSummaryRows.map((row) => {
                  const mapping = row.sku ? mappingBySku.get(normalizeSkuForMatching(row.sku)) : undefined;

                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{row.sku ?? "Missing"}</td>
                      <td className="px-4 py-3">
                        <ProductImage
                          src={mapping?.cachedImageUrl}
                          alt={`${mapping?.productName ?? row.sku ?? "Product"} ${row.sku ?? ""}`}
                          size="sm"
                          showBadge={false}
                          mappingId={mapping?.id}
                          showDebug
                          imageHealth={mapping?.imageHealth}
                          cacheStatus={mapping?.cacheStatus}
                          originalImageUrl={mapping?.imageUrl}
                        />
                      </td>
                      <td className="px-4 py-3">{picklistSummaryProductNameLabel(mapping)}</td>
                      <td className="px-4 py-3">{row.color ?? mapping?.color ?? "-"}</td>
                      <td className="px-4 py-3">{row.size ?? "-"}</td>
                      <td className="px-4 py-3">{row.qty ?? "-"}</td>
                      <td className="px-4 py-3">{imageBadge(mapping)}</td>
                      <td className="px-4 py-3">Page {row.pageNumber ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {batch.issues.length > 0 ? (
        <details className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">
            Review issues
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{batch.issues.length}</span>
          </summary>
          <div className="divide-y divide-slate-100">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Showing {visibleIssues.length} of {batch.issues.length} issues
            </div>
            {visibleIssues.map((issue) => (
              <div key={issue.id} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-950">
                  {issue.issueType} {issue.rowNumber ? `. Page ${issue.rowNumber}` : ""}
                </p>
                <p className="mt-1 text-slate-600">{issue.message}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {batch.orders.length > 0 ? (
        <details className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">
            Imported orders
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{batch.orders.length}</span>
          </summary>
          <div className="overflow-x-auto">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Showing {visibleImportedOrders.length} of {batch.orders.length} imported orders
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">AWB</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Color</th>
                  <th className="px-4 py-3">Courier</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleImportedOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{order.awb}</td>
                    <td className="px-4 py-3">{order.sku}</td>
                    <td className="px-4 py-3">{order.qty}</td>
                    <td className="px-4 py-3">{order.color ?? "Unknown"}</td>
                    <td className="px-4 py-3">{order.courier ?? "Unknown"}</td>
                    <td className="px-4 py-3">{order.orderNo}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={order.packStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-4">
        <Link href="/owner/uploads/new" className="text-sm font-semibold text-berry hover:text-pink-800">
          Upload another PDF
        </Link>
        <Link href="/owner/sku-mappings" className="text-sm font-semibold text-berry hover:text-pink-800">
          Manage SKU image mappings
        </Link>
      </div>
    </AppShell>
  );
}
