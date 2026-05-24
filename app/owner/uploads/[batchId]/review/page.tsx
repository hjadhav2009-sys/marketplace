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
import { hasBlockingPreviewIssue } from "@/lib/import/preview";
import type { ParseIssue } from "@/lib/parsers/meesho";
import { prisma } from "@/lib/prisma";
import { confirmParsedBatchAction } from "../../actions";

type ReviewPageProps = {
  params: Promise<{
    batchId: string;
  }>;
  searchParams?: Promise<{
    q?: string;
    issue?: string;
    problems?: string;
    imported?: string;
    error?: string;
  }>;
};

type BatchNotes = {
  parserVersion?: string;
  stats?: {
    totalPages?: number;
    parsedOrders?: number;
    parsedSummaryRows?: number;
    missingAwb?: number;
    missingSku?: number;
    lowConfidenceRows?: number;
    duplicateAwbInsideFile?: number;
    duplicateSkuSummaryRows?: number;
    existingDuplicateRows?: number;
    missingImageRows?: number;
    blockingRows?: number;
  };
  importStats?: {
    attemptedRows?: number;
    createdRows?: number;
    updatedRows?: number;
    duplicateRows?: number;
    missingImageRows?: number;
    skippedRows?: number;
    errorRows?: number;
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

function imageBadge(mapping: { imageUrl: string; imageHealth: string } | undefined) {
  if (!mapping) {
    return <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">Missing image</span>;
  }

  if (mapping.imageHealth === "BROKEN") {
    return <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">Broken URL</span>;
  }

  return <span className="inline-flex rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">Image mapped</span>;
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
  const previewRows = batch.previewRows.map((row) => ({
    ...row,
    parsedIssues: parseIssues(row.issues)
  }));
  const skus = Array.from(new Set(previewRows.map((row) => row.sku).filter((sku): sku is string => Boolean(sku))));
  const mappings = await prisma.skuImageMapping.findMany({
    where: {
      accountId: account.id,
      sku: { in: skus }
    },
    select: {
      id: true,
      sku: true,
      imageUrl: true,
      productName: true,
      imageHealth: true
    }
  });
  const mappingBySku = new Map(mappings.map((mapping) => [mapping.sku, mapping]));
  const issueTypes = Array.from(new Set(previewRows.flatMap((row) => row.parsedIssues.map((issue) => issue.issueType)))).sort();
  const query = filters?.q?.trim().toLowerCase() ?? "";
  const selectedIssue = filters?.issue ?? "";
  const onlyProblems = filters?.problems === "1";
  const filteredRows = previewRows.filter((row) => {
    const haystack = [row.awb, row.sku, row.orderNo, row.courier, row.color, row.size, row.productDescription].filter(Boolean).join(" ").toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesIssue = !selectedIssue || row.parsedIssues.some((issue) => issue.issueType === selectedIssue);
    const matchesProblems = !onlyProblems || row.parsedIssues.length > 0;
    return matchesQuery && matchesIssue && matchesProblems;
  });
  const crossCheckIssueCount = batch.issues.filter((issue) => /MISMATCH|NOT_IN/i.test(issue.issueType)).length;
  const importableRows = previewRows.filter((row) => {
    return !row.imported && (row.sourceType === "LABEL" || row.sourceType === "MANIFEST_ORDER") && row.awb && row.sku && !hasBlockingPreviewIssue(row.parsedIssues);
  }).length;
  const importStats = notes.importStats;

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
      {filters?.error ? (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Import could not be completed. Review the issue list and try again.
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

      <section className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Pages", notes.stats?.totalPages ?? "-"],
          ["Parsed orders", notes.stats?.parsedOrders ?? batch.totalRows],
          ["Summary rows", notes.stats?.parsedSummaryRows ?? 0],
          ["Missing AWB", notes.stats?.missingAwb ?? 0],
          ["Missing SKU", notes.stats?.missingSku ?? 0],
          ["Low confidence", notes.stats?.lowConfidenceRows ?? 0],
          ["Existing AWB", notes.stats?.existingDuplicateRows ?? batch.duplicateRows],
          ["Missing images", notes.stats?.missingImageRows ?? batch.missingImageRows],
          ["Cross-checks", crossCheckIssueCount]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

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
              ["Created", importStats.createdRows ?? batch.createdRows],
              ["Updated", importStats.updatedRows ?? batch.updatedRows],
              ["Duplicate skipped", importStats.duplicateRows ?? batch.duplicateRows],
              ["Missing images", importStats.missingImageRows ?? 0],
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

      {batch.status !== "IMPORTED" && previewRows.length > 0 ? (
        <section className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Confirm import</h2>
              <p className="mt-1 text-sm text-slate-600">
                {importableRows} ready row{importableRows === 1 ? "" : "s"} will import through the duplicate-safe AWB workflow.
              </p>
              <p className="mt-1 text-sm font-medium text-amber-800">
                Low confidence rows are not imported until fixed/reviewed.
              </p>
            </div>
            {importableRows > 0 ? (
              <form action={confirmParsedBatchAction}>
                <input type="hidden" name="batchId" value={batch.id} />
                <SubmitButton pendingText="Importing...">Confirm import</SubmitButton>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Parsed preview rows</h2>
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

        {filteredRows.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState title="No preview rows match" description="Clear filters or upload another Meesho PDF to review parsed rows." />
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                {filteredRows.map((row) => {
                  const mapping = row.sku ? mappingBySku.get(row.sku) : undefined;

                  return (
                    <tr key={row.id} className={row.imported ? "bg-teal-50/40" : undefined}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProductImage src={mapping?.imageUrl} alt={`${mapping?.productName ?? row.productDescription ?? row.sku ?? "Product"} ${row.sku ?? ""}`} size="sm" showBadge={false} mappingId={mapping?.id} />
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
      </section>

      {batch.issues.length > 0 ? (
        <section className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Review issues</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {batch.issues.map((issue) => (
              <div key={issue.id} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-950">
                  {issue.issueType} {issue.rowNumber ? `. Page ${issue.rowNumber}` : ""}
                </p>
                <p className="mt-1 text-slate-600">{issue.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {batch.orders.length > 0 ? (
        <section className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Imported orders</h2>
          </div>
          <div className="overflow-x-auto">
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
                {batch.orders.map((order) => (
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
        </section>
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
