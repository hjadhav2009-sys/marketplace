import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { safeImportIssueContext, importIssuePageWindow, IMPORT_ISSUE_PAGE_SIZES } from "@/lib/import/issues";
import { importIssueKind, importIssueKindWhere } from "@/lib/import/issue-severity";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type ImportIssuesPageProps = {
  params: Promise<{
    jobId: string;
  }>;
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    issueType?: string;
    row?: string;
    sku?: string;
    kind?: string;
  }>;
};

function safePageSize(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "50", 10);
  return IMPORT_ISSUE_PAGE_SIZES.includes(parsed as (typeof IMPORT_ISSUE_PAGE_SIZES)[number]) ? parsed : 50;
}

function issueHref(jobId: string, params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/owner/imports/${jobId}/issues?${next.toString()}`;
}

function exportHref(jobId: string, params: URLSearchParams, format: "csv" | "xlsx" | "txt") {
  const next = new URLSearchParams(params);
  next.set("format", format);
  return `/owner/imports/${jobId}/issues/export?${next.toString()}`;
}

export default async function ImportIssuesPage({ params, searchParams }: ImportIssuesPageProps) {
  await requireUser(["OWNER"]);
  const { jobId } = await params;
  const query = await searchParams;
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      account: {
        select: {
          companyName: true,
          marketplace: true,
          name: true,
          accountDisplayName: true,
          code: true,
          accountCode: true
        }
      }
    }
  });

  if (!job || !job.batchId) {
    return (
      <AppShell>
        <PageHeader eyebrow="Import Issues" title="No issue rows found" description="This import job does not have a linked review batch." />
        <EmptyState title="No issue drill-down available" description="Open a completed import job with stored issue rows to review row-level problems." action={{ href: "/owner/imports", label: "Back to imports" }} />
      </AppShell>
    );
  }

  const pageSize = safePageSize(query?.pageSize);
  const currentParams = new URLSearchParams();
  const rawRow = query?.row?.trim();
  const rowNumber = rawRow ? Number.parseInt(rawRow, 10) : undefined;
  const sku = query?.sku?.trim();
  const where: Prisma.ImportRowIssueWhereInput = {
    batchId: job.batchId,
    AND: importIssueKindWhere(query?.kind) as Prisma.ImportRowIssueWhereInput | undefined,
    issueType: query?.issueType || undefined,
    rowNumber: Number.isFinite(rowNumber) ? rowNumber : undefined,
    OR: sku ? [{ rawData: { contains: sku } }, { safeDataJson: { contains: sku } }] : undefined
  };

  for (const [key, value] of Object.entries({
    pageSize: String(pageSize),
    issueType: query?.issueType,
    row: Number.isFinite(rowNumber) ? String(rowNumber) : undefined,
    sku,
    kind: query?.kind
  })) {
    if (value) {
      currentParams.set(key, value);
    }
  }

  const [totalRows, issueGroups] = await Promise.all([
    prisma.importRowIssue.count({ where }),
    prisma.importRowIssue.groupBy({
      by: ["issueType"],
      where: { batchId: job.batchId },
      _count: { _all: true },
      orderBy: { issueType: "asc" }
    })
  ]);
  const window = importIssuePageWindow(totalRows, query?.page, pageSize);
  const issues = await prisma.importRowIssue.findMany({
    where,
    select: {
      id: true,
      rowNumber: true,
      issueType: true,
      message: true,
      rawData: true,
      safeDataJson: true,
      createdAt: true
    },
    orderBy: [{ createdAt: "desc" }, { rowNumber: "asc" }],
    skip: window.skip,
    take: window.take
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Import Issues"
        title="Row issue drill-down"
        description="Review failed, held, duplicate, missing listing, and missing image rows without exposing private raw file data."
      >
        <StatusBadge value={job.status} />
      </PageHeader>

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-950">{job.importType}</p>
            <p className="mt-1 text-sm text-slate-600">
              {job.account.companyName} / {job.account.accountDisplayName ?? job.account.name} / {job.account.accountCode ?? job.account.code}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/owner/imports/${job.id}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
              Open progress
            </Link>
            <a href={exportHref(job.id, currentParams, "csv")} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
              CSV
            </a>
            <a href={exportHref(job.id, currentParams, "xlsx")} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
              XLSX
            </a>
            <a href={exportHref(job.id, currentParams, "txt")} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
              TXT
            </a>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {issueGroups.map((group) => (
            <div key={group.issueType} className={`rounded-md p-3 ${importIssueKind(group.issueType) === "warning" ? "bg-amber-50" : "bg-rose-50"}`}>
              <p className="text-xs font-semibold uppercase text-slate-500">{group.issueType}</p>
              <p className="mt-1 text-xl font-black text-slate-950">{group._count._all}</p>
            </div>
          ))}
          {issueGroups.length === 0 ? (
            <div className="rounded-md bg-teal-50 p-3 text-sm font-semibold text-teal-800">No issues recorded for this import.</div>
          ) : null}
        </div>
      </section>

      <form className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1fr_1fr_auto_auto]">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Severity</span>
          <select name="kind" defaultValue={query?.kind ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Warnings and errors</option>
            <option value="warning">Warnings</option>
            <option value="error">Blocking errors</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Issue type</span>
          <select name="issueType" defaultValue={query?.issueType ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All types</option>
            {issueGroups.map((group) => (
              <option key={group.issueType} value={group.issueType}>{group.issueType}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Row number</span>
          <input name="row" defaultValue={query?.row ?? ""} inputMode="numeric" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">SKU</span>
          <input name="sku" defaultValue={query?.sku ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Rows</span>
          <select name="pageSize" defaultValue={String(pageSize)} className="mt-1 min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm">
            {IMPORT_ISSUE_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button className="mt-5 min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white xl:mt-6">Apply</button>
      </form>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
          <p className="font-semibold text-slate-700">Showing {window.from}-{window.to} of {totalRows}</p>
          <div className="flex items-center gap-2">
            <Link href={issueHref(job.id, currentParams, Math.max(1, window.page - 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Previous</Link>
            <span className="font-semibold text-slate-600">Page {window.page} of {window.totalPages}</span>
            <Link href={issueHref(job.id, currentParams, Math.min(window.totalPages, window.page + 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Next</Link>
          </div>
        </div>
        {issues.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No issue rows match" description="Clear filters or open another import job." />
          </div>
        ) : (
          <>
          <div className="grid gap-3 p-3 md:hidden">
            {issues.map((issue) => { const context = safeImportIssueContext(issue.rawData, issue.safeDataJson); const kind = importIssueKind(issue.issueType); return <article key={issue.id} className={`rounded-md border p-3 ${kind === "warning" ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"}`}><div className="flex items-start justify-between gap-2"><p className="font-black text-slate-950">{issue.issueType.replaceAll("_", " ")}</p><span className="rounded-full bg-white px-2 py-1 text-xs font-bold">{kind === "warning" ? "Warning" : "Blocking"}</span></div><p className="mt-2 text-sm text-slate-700">{issue.message}</p><div className="mt-3 grid gap-1 text-xs text-slate-600"><p>Row: {issue.rowNumber ?? "-"}</p><p className="break-all">SKU: {context.sku ?? "-"}</p><p>{formatDateTime(issue.createdAt)}</p></div></article>; })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Row</th>
                  <th className="px-3 py-3">Issue type</th>
                  <th className="px-3 py-3">Message</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Shipment key</th>
                  <th className="px-3 py-3">Order item key</th>
                  <th className="px-3 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map((issue) => {
                  const context = safeImportIssueContext(issue.rawData, issue.safeDataJson);

                  return (
                    <tr key={issue.id} className="align-top">
                      <td className="px-3 py-3 font-mono text-xs text-slate-600">{issue.rowNumber ?? "-"}</td>
                      <td className={`px-3 py-3 font-bold ${importIssueKind(issue.issueType) === "warning" ? "text-amber-800" : "text-rose-700"}`}>{issue.issueType}</td>
                      <td className="max-w-xl px-3 py-3 text-slate-700">{issue.message}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">{context.sku ?? "-"}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">{context.shipmentKey ?? "-"}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">{context.orderItemKey ?? "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDateTime(issue.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
