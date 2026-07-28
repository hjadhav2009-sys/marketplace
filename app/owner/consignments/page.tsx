import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount } from "@/lib/auth";
import { requireConsignmentAccess } from "@/lib/consignment-auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

function nextAction(status: string) {
  if (status === "DRAFT" || status === "PARSING" || status === "FAILED") return "Continue setup";
  if (status === "REVIEW_REQUIRED" || status === "PROBLEM") return "Resolve issues";
  if (status === "READY_TO_ACTIVATE") return "Review and activate";
  if (status === "ACTIVE") return "View progress";
  if (status === "COMPLETED") return "View completion record";
  return "View record";
}

function pageHref(page: number, status: string | undefined, q: string | undefined) {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  return `/owner/consignments?${params.toString()}`;
}

export default async function ConsignmentsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  const user = await requireConsignmentAccess("view");
  const account = await requireAccount(user);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const take = 50;
  const status = params.status?.trim();
  const q = params.q?.trim();
  const where = {
    accountId: account.id,
    status: status ? status as never : undefined,
    OR: q ? [{ externalConsignmentNumber: { contains: q } }, { displayName: { contains: q } }] : undefined
  };
  const [batches, total] = await Promise.all([
    prisma.consignmentBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: { _count: { select: { lines: true, issues: true } } }
    }),
    prisma.consignmentBatch.count({ where })
  ]);
  const taskRows = batches.length
    ? await prisma.workTask.findMany({
        where: {
          accountId: account.id,
          sourceType: "CONSIGNMENT",
          consignmentLine: { consignmentBatchId: { in: batches.map((batch) => batch.id) } }
        },
        select: { stage: true, status: true, consignmentLine: { select: { consignmentBatchId: true } } }
      })
    : [];
  const taskCounts = new Map<string, Record<string, number>>();
  for (const task of taskRows) {
    const id = task.consignmentLine?.consignmentBatchId;
    if (!id) continue;
    const counts = taskCounts.get(id) ?? {};
    const key = `${task.stage}_${task.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
    taskCounts.set(id, counts);
  }
  const canCreate = user.role === "OWNER" || user.canImportConsignments || user.canManageConsignments;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Marketplace work intake"
        title="Consignments"
        description="Search and review shipment batches. Required units become workflow quantities; they never become physical inventory."
        action={canCreate ? { href: "/owner/consignments/new", label: "New consignment" } : undefined}
      />

      <form className="mb-4 grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[1fr_14rem_auto]">
        <label className="sr-only" htmlFor="consignment-search">Search consignments</label>
        <input id="consignment-search" name="q" defaultValue={q} placeholder="Consignment number or name" className="min-h-11 rounded-md border px-3" />
        <label className="sr-only" htmlFor="consignment-status">Filter by status</label>
        <select id="consignment-status" name="status" defaultValue={status ?? ""} className="min-h-11 rounded-md border px-3">
          <option value="">All statuses</option>
          {["DRAFT", "PARSING", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "ACTIVE", "COMPLETED", "PROBLEM", "CANCELLED", "FAILED"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button className="min-h-11 rounded-md bg-slate-950 px-4 font-bold text-white">Apply filters</button>
      </form>

      <div className="grid gap-3">
        {batches.map((batch) => {
          const counts = taskCounts.get(batch.id) ?? {};
          const problemTasks = Object.entries(counts)
            .filter(([key]) => key.endsWith("_PROBLEM"))
            .reduce((sum, [, value]) => sum + value, 0);
          return (
            <Link
              key={batch.id}
              href={`/owner/consignments/${batch.id}`}
              prefetch
              className="group rounded-xl border bg-white p-4 shadow-sm transition hover:border-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-lg font-black">{batch.displayName}</p>
                  <p className="mt-1 break-all text-sm text-slate-600">{batch.externalConsignmentNumber}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{batch.marketplace} · received {formatDateTime(batch.createdAt)}</p>
                </div>
                <StatusBadge value={batch.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
                <Stat label="Valid lines" value={batch._count.lines} />
                <Stat label="Required units" value={batch.totalRequiredQuantity} />
                <Stat label="Pick tasks ready" value={counts.PICK_READY ?? 0} />
                <Stat label="Mark tasks ready" value={counts.MARK_READY ?? 0} />
                <Stat label="Assembly tasks ready" value={counts.ASSEMBLE_READY ?? 0} />
                <Stat label="Pack tasks ready" value={counts.PACK_READY ?? 0} />
                <Stat label="Problem tasks" value={problemTasks} />
                <Stat label="Import issues" value={batch._count.issues} />
              </dl>
              <p className="mt-4 text-sm font-black text-berry group-hover:underline">{nextAction(batch.status)} →</p>
            </Link>
          );
        })}
      </div>

      {!batches.length ? (
        <EmptyState
          title="No consignments found"
          description={q || status ? "Clear the filters to see other consignments." : "Create a private draft, review parsed rows, then activate approved work."}
          action={q || status ? { href: "/owner/consignments", label: "Clear filters" } : canCreate ? { href: "/owner/consignments/new", label: "New consignment" } : undefined}
        />
      ) : null}

      <nav className="mt-5 flex items-center justify-between gap-3 text-sm font-bold" aria-label="Consignment pages">
        <span>Showing {(page - 1) * take + (total ? 1 : 0)}–{Math.min(page * take, total)} of {total} consignments</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1, status, q)} className="inline-flex min-h-11 items-center rounded-md border px-3 py-2">Previous</Link>
          ) : (
            <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border bg-slate-50 px-3 py-2 text-slate-400">Previous</span>
          )}
          {page * take < total ? (
            <Link href={pageHref(page + 1, status, q)} className="inline-flex min-h-11 items-center rounded-md border px-3 py-2">Next</Link>
          ) : (
            <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border bg-slate-50 px-3 py-2 text-slate-400">Next</span>
          )}
        </div>
      </nav>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-black">{value}</dd>
    </div>
  );
}
