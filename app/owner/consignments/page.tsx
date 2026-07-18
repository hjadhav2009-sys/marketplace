import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount } from "@/lib/auth";
import { requireConsignmentAccess } from "@/lib/consignment-auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function ConsignmentsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string; q?: string }> }) {
  const user = await requireConsignmentAccess("view");
  const account = await requireAccount(user);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const take = 50;
  const status = params.status?.trim();
  const q = params.q?.trim();
  const where = { accountId: account.id, status: status ? status as never : undefined, OR: q ? [{ externalConsignmentNumber: { contains: q } }, { displayName: { contains: q } }] : undefined };
  const [batches, total] = await Promise.all([
    prisma.consignmentBatch.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { _count: { select: { lines: true, issues: true } } } }),
    prisma.consignmentBatch.count({ where })
  ]);
  const taskRows = batches.length ? await prisma.workTask.findMany({ where: { accountId: account.id, sourceType: "CONSIGNMENT", consignmentLine: { consignmentBatchId: { in: batches.map((batch) => batch.id) } } }, select: { stage: true, status: true, consignmentLine: { select: { consignmentBatchId: true } } } }) : [];
  const taskCounts = new Map<string, Record<string, number>>(); for (const task of taskRows) { const id=task.consignmentLine?.consignmentBatchId;if(!id)continue;const counts=taskCounts.get(id)??{};const key=`${task.stage}_${task.status}`;counts[key]=(counts[key]??0)+1;taskCounts.set(id,counts); }
  return <AppShell><PageHeader eyebrow="Marketplace work intake" title="Consignments" description="Recent consignments are shown automatically. Search is optional; work quantities never become inventory." action={user.role === "OWNER" || user.canImportConsignments || user.canManageConsignments ? { href: "/owner/consignments/new", label: "New consignment" } : undefined} />
    <form className="mb-4 grid gap-2 rounded-md border bg-white p-3 sm:grid-cols-[1fr_14rem_auto]"><input name="q" defaultValue={q} placeholder="Consignment number or name" className="min-h-11 rounded-md border px-3" /><select name="status" defaultValue={status ?? ""} className="min-h-11 rounded-md border px-3"><option value="">All statuses</option>{["DRAFT","PARSING","REVIEW_REQUIRED","READY_TO_ACTIVATE","ACTIVE","COMPLETED","PROBLEM","CANCELLED","FAILED"].map((item) => <option key={item}>{item}</option>)}</select><button className="min-h-11 rounded-md bg-slate-950 px-4 font-bold text-white">Filter</button></form>
    <div className="grid gap-3">{batches.map((batch) => {const counts=taskCounts.get(batch.id)??{};return <Link key={batch.id} href={`/owner/consignments/${batch.id}`} prefetch className="rounded-md border bg-white p-4 shadow-sm transition hover:border-berry"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-lg font-black">{batch.displayName}</p><p className="text-sm text-slate-600">{batch.externalConsignmentNumber} / received {formatDateTime(batch.createdAt)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{batch.marketplace} / {batch.sourceFileName}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{batch.status.replaceAll("_", " ")}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-8"><Stat label="Items" value={batch._count.lines} /><Stat label="Required qty" value={batch.totalRequiredQuantity} /><Stat label="Pick ready" value={counts.PICK_READY??0} /><Stat label="Mark ready" value={counts.MARK_READY??0} /><Stat label="Assembly ready" value={counts.ASSEMBLE_READY??0} /><Stat label="Pack ready" value={counts.PACK_READY??0} /><Stat label="Problems" value={Object.entries(counts).filter(([key])=>key.endsWith("_PROBLEM")).reduce((sum,[,value])=>sum+value,0)} /><Stat label="Issues" value={batch._count.issues} /></div></Link>})}</div>
    {!batches.length ? <div className="rounded-md border border-dashed bg-white p-6 text-center"><p className="font-bold">No consignments found.</p><p className="mt-1 text-sm text-slate-600">Upload a Flipkart Consignment Details CSV or ZIP to begin.</p></div> : null}
    <div className="mt-5 flex items-center justify-between text-sm font-bold"><span>Showing {(page - 1) * take + (total ? 1 : 0)}-{Math.min(page * take, total)} of {total}</span><div className="flex gap-2">{page > 1 ? <Link href={`?page=${page - 1}&status=${status ?? ""}&q=${encodeURIComponent(q ?? "")}`} className="rounded-md border px-3 py-2">Previous</Link> : null}{page * take < total ? <Link href={`?page=${page + 1}&status=${status ?? ""}&q=${encodeURIComponent(q ?? "")}`} className="rounded-md border px-3 py-2">Next</Link> : null}</div></div>
  </AppShell>;
}
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-md bg-slate-50 p-2"><p className="text-xs text-slate-500">{label}</p><p className="font-black">{value}</p></div>; }
