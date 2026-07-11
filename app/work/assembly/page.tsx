import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount, requireUser, roleHomePath } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { prisma } from "@/lib/prisma";
import { getOrderAssemblyQueue } from "@/src/lib/workflow/order-assembly";
import { redirect } from "next/navigation";
import { OrderAssemblyCard } from "./OrderAssemblyCard";

export default async function OrderAssemblyPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; assemblySuccess?: string; assemblyError?: string }> }) {
  const user = await requireUser(); const account = await requireAccount(user);
  if (!(hasWorkPermission(user, "canAssemble") || user.canViewAllWork)) redirect(roleHomePath(user.role));
  const query = await searchParams; const status = query.status === "problem" || query.status === "completed" || query.status === "mine" ? query.status : "active"; const page = Math.max(1, Number(query.page) || 1);
  const [result, workers] = await Promise.all([
    getOrderAssemblyQueue({ actorUserId: user.id, accountId: account.id, page, search: query.q, status }),
    user.role === "OWNER" ? prisma.user.findMany({ where: { active: true, OR: [{ accountId: account.id }, { assignedAccounts: { some: { id: account.id } } }], AND: [{ OR: [{ role: "OWNER" }, { canAssemble: true }] }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : []
  ]);
  const returnPath = `/work/assembly?status=${status}&q=${encodeURIComponent(query.q ?? "")}&page=${page}`;
  return <AppShell><PageHeader eyebrow="Customer-order work" title="Assembly" description="Complete one simple assembly task, then the order returns to packing."><Link href="/work" className="min-h-11 rounded-md border px-4 py-2 text-sm font-bold">Work Hub</Link></PageHeader>
    {query.assemblySuccess ? <div className="mb-3 rounded-md bg-teal-50 p-3 text-sm font-bold text-teal-800">{query.assemblySuccess}</div> : null}{query.assemblyError ? <div className="mb-3 rounded-md bg-rose-50 p-3 text-sm font-bold text-rose-700">{query.assemblyError}</div> : null}
    <section className="mb-4 rounded-md border bg-white p-3 shadow-sm"><form className="grid gap-2 sm:grid-cols-[1fr_auto]"><input name="q" defaultValue={query.q} autoFocus placeholder="AWB, Tracking ID, order, shipment, item ID or SKU" className="min-h-12 min-w-0 rounded-md border px-3"/><button className="min-h-12 rounded-md bg-slate-950 px-5 font-black text-white">Find assembly</button></form><div className="mt-3 flex gap-2 overflow-x-auto">{[["active","Ready / in progress"],["mine","Assigned to me"],["problem","Problems"],["completed","Completed today"]].map(([key,label]) => <Link key={key} href={`?status=${key}&q=${encodeURIComponent(query.q ?? "")}`} className={`shrink-0 rounded-full px-3 py-2 text-sm font-bold ${status === key ? "bg-berry text-white" : "bg-slate-100"}`}>{label}</Link>)}</div></section>
    <p className="mb-3 text-sm font-bold text-slate-600">{result.total} tasks / {account.accountDisplayName ?? account.name}</p><section className="space-y-3">{result.tasks.map((task) => <OrderAssemblyCard key={task.id} task={task} user={result.user} workers={workers} returnPath={returnPath}/>)}</section>{!result.tasks.length ? <div className="rounded-md border border-dashed bg-white p-6 text-center"><p className="font-black">No assembly work found.</p><p className="mt-1 text-sm text-slate-600">Completed assembly automatically returns its order to packing.</p></div> : null}
    <div className="mt-5 flex justify-between text-sm font-bold"><span>Showing {(page - 1) * result.pageSize + (result.total ? 1 : 0)}-{Math.min(page * result.pageSize, result.total)} of {result.total}</span><div className="flex gap-2">{page > 1 ? <Link href={`?page=${page - 1}&status=${status}&q=${encodeURIComponent(query.q ?? "")}`} className="rounded-md border px-3 py-2">Previous</Link> : null}{page * result.pageSize < result.total ? <Link href={`?page=${page + 1}&status=${status}&q=${encodeURIComponent(query.q ?? "")}`} className="rounded-md border px-3 py-2">Next</Link> : null}</div></div>
  </AppShell>;
}
