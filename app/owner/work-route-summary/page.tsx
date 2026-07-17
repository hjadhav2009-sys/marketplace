import { type Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function safeDate(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

const labels: Record<string, string> = {
  FOLLOWED_SAVED_ROUTE: "Explicit saved routes followed",
  OVERRIDDEN_SAVED_ROUTE: "Explicit saved routes overridden",
  SELECTED_FROM_SYSTEM_FALLBACK: "System-fallback routes manually selected"
};

export default async function WorkRouteSummaryPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const params = await searchParams;
  const today = startOfDay(new Date());
  const period = params.period === "7d" || params.period === "custom" ? params.period : "today";
  const from = period === "7d" ? new Date(today.getTime() - 6 * 86_400_000) : period === "custom" ? safeDate(params.from, today) : today;
  const selectedTo = period === "custom" ? safeDate(params.to, today) : today;
  const to = new Date(startOfDay(selectedTo).getTime() + 86_400_000);
  const where: Prisma.WorkRouteDecisionWhereInput = { accountId: account.id, createdAt: { gte: from, lt: to } };
  const [rows, grouped, missingMark, missingAssembly, skuGroups] = await Promise.all([
    prisma.workRouteDecision.findMany({ where, include: { actorUser: { select: { name: true, username: true } } }, orderBy: { createdAt: "desc" }, take: 250 }),
    prisma.workRouteDecision.groupBy({ by: ["decisionType"], where, _count: { _all: true } }),
    prisma.workRouteDecision.count({ where: { ...where, missingInstructionStage: "MARK" } }),
    prisma.workRouteDecision.count({ where: { ...where, missingInstructionStage: "ASSEMBLE" } }),
    prisma.workRouteDecision.groupBy({ by: ["sellerSku"], where: { ...where, decisionType: "OVERRIDDEN_SAVED_ROUTE", sellerSku: { not: "" } }, _count: { _all: true }, having: { sellerSku: { _count: { gt: 1 } } } })
  ]);
  const counts = new Map(grouped.map((item) => [item.decisionType, item._count._all]));

  return <AppShell>
    <PageHeader eyebrow={`${account.marketplace} / ${account.accountDisplayName ?? account.name}`} title="Worker route decisions" description="Safe operational history for the selected seller account. Workers route immediately; this page never blocks their work." action={{ href: "/work", label: "Back to Work" }} />
    <form className="mb-5 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-4">
      <label className="text-sm font-bold">Period<select name="period" defaultValue={period} className="mt-1 min-h-11 w-full rounded-md border px-3"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="custom">Custom</option></select></label>
      <label className="text-sm font-bold">From<input type="date" name="from" defaultValue={dateInput(from)} className="mt-1 min-h-11 w-full rounded-md border px-3" /></label>
      <label className="text-sm font-bold">To<input type="date" name="to" defaultValue={dateInput(selectedTo)} className="mt-1 min-h-11 w-full rounded-md border px-3" /></label>
      <button className="min-h-11 self-end rounded-md bg-slate-950 px-4 font-bold text-white">Apply</button>
    </form>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(labels).map(([key, label]) => <div key={key} className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-3xl font-black">{counts.get(key) ?? 0}</p></div>)}
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="text-sm text-amber-900">Missing Marking instructions</p><p className="mt-1 text-3xl font-black">{missingMark}</p></div>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="text-sm text-amber-900">Missing Assembly instructions</p><p className="mt-1 text-3xl font-black">{missingAssembly}</p></div>
      <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-600">Repeated SKU route changes</p><p className="mt-1 text-3xl font-black">{skuGroups.length}</p></div>
      <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-600">Route conflicts or rejected stale decisions</p><p className="mt-1 text-3xl font-black">0</p><p className="text-xs text-slate-500">Rejected transactions make no route-decision record.</p></div>
    </section>
    <section className="mt-5 overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-[980px] w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["Time", "Source", "Seller SKU", "Reference", "Saved route", "Selected", "Decision", "Reason / note", "Worker"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="border-t align-top"><td className="px-3 py-3">{row.createdAt.toLocaleString()}</td><td className="px-3 py-3">{row.sourceType === "ORDER" ? "Daily Order" : "Consignment"}</td><td className="px-3 py-3 font-bold">{row.sellerSku || "—"}</td><td className="px-3 py-3">{row.reference || "—"}</td><td className="px-3 py-3">{row.savedRoute ?? "No explicit route"}</td><td className="px-3 py-3">{row.selectedNextStage ?? "Complete"}</td><td className="px-3 py-3">{labels[row.decisionType] ?? row.decisionType}{row.missingInstructionStage ? <span className="mt-1 block font-bold text-amber-800">Manual route: missing {row.missingInstructionStage.toLowerCase()} instructions</span> : null}</td><td className="max-w-64 px-3 py-3">{row.reason ?? "—"}{row.workerNote ? <span className="mt-1 block text-slate-600">Note: {row.workerNote}</span> : null}</td><td className="px-3 py-3">{row.actorUser.name || row.actorUser.username}</td></tr>)}</tbody>
      </table>
      {!rows.length ? <p className="p-6 text-center text-slate-600">No route decisions in this period.</p> : null}
    </section>
  </AppShell>;
}
