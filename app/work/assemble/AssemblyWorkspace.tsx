import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Metric } from "@/components/ui/Metric";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { assemblySourceLabel, combinedAssemblyMetrics, resolveAssemblySource, supportedAssemblySources, type AssemblySource, type AssemblySummary } from "@/src/lib/workflow/assembly-workspace";
import { getGroupedWork, getSmartStageSummary } from "@/src/lib/workflow/grouped-work";
import { getOrderAssemblyQueue } from "@/src/lib/workflow/order-assembly";
import { GroupedWorkCard } from "../GroupedWorkCard";
import { LiveWorkRefresh } from "../LiveWorkRefresh";
import { AssemblySourceSelector } from "./AssemblySourceSelector";
import { OrderAssemblyWorkCard } from "./OrderAssemblyWorkCard";

export type AssemblySearchParams = Promise<{ error?: string; page?: string; source?: string; status?: string; success?: string }>;

export async function AssemblyWorkspace({ searchParams }: { searchParams: AssemblySearchParams }) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canAssemble") && !user.canViewAllWork) redirect(capabilityHomePath(user));
  const query = await searchParams;
  const summary = await getSmartStageSummary({ actorUserId: user.id, accountId: account.id, stage: "ASSEMBLE" }) as AssemblySummary;
  const resolution = resolveAssemblySource({ requestedSource: query.source, summary, supportedSources: supportedAssemblySources(account.marketplace) });
  const { activeSources, selectedSource, supportedSources } = resolution;
  const projectionUnavailable = supportedSources.some((source) => summary[source].projectionUnavailable);
  const page = Math.max(1, Number(query.page) || 1);
  const orderStatus = query.status === "problem" || query.status === "completed" || query.status === "mine" ? query.status : "active";
  const grouped = selectedSource === "CONSIGNMENT" && !projectionUnavailable ? await getGroupedWork({ actorUserId: user.id, accountId: account.id, stage: "ASSEMBLE", sourceType: "CONSIGNMENT", page, includeMemberIds: true }) : null;
  const order = selectedSource === "ORDER" && !projectionUnavailable ? await getOrderAssemblyQueue({ actorUserId: user.id, accountId: account.id, page, status: orderStatus }) : null;
  const workers = selectedSource === "ORDER" && user.role === "OWNER" ? await prisma.user.findMany({ where: { active: true, OR: [{ accountId: account.id }, { assignedAccounts: { some: { id: account.id } } }], AND: [{ OR: [{ role: "OWNER" }, { canAssemble: true }] }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const canAct = hasWorkPermission(user, "canAssemble");
  const canReportProblem = user.role === "OWNER" || user.canReportProblem;
  const metrics = combinedAssemblyMetrics(summary, supportedSources);
  const selectedSummary = selectedSource ? summary[selectedSource] : null;
  const hasCards = selectedSource === "ORDER" ? Boolean(order?.tasks.length) : Boolean(grouped?.cards.length);
  const hasMore = selectedSource === "ORDER" ? Boolean(order && page * order.pageSize < order.total) : Boolean(grouped?.hasMore);

  return <AppShell>
    <PageHeader eyebrow={`${account.marketplace} / ${account.accountDisplayName ?? account.name}`} title="Assembly" description="Review the product and Assembly instructions, complete the required quantity, then send the work to Packing."/>
    <LiveWorkRefresh stage="ASSEMBLE" source={selectedSource ?? undefined}/>
    {!projectionUnavailable ? <section aria-label="Assembly queue summary" className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><Metric label="Open work" value={metrics.openWork}/><Metric label="Required quantity" value={metrics.requiredQuantity}/><Metric label="Problems" value={metrics.problems} tone={metrics.problems ? "danger" : "neutral"}/><Metric label="Assigned to me" value={metrics.assignedToMe} tone={metrics.assignedToMe ? "action" : "neutral"}/></section> : null}
    <AssemblySourceSelector initial={summary} selectedSource={selectedSource} sources={supportedSources}/>
    {query.success ? <FeedbackBanner className="mb-4" tone="success" announcement="status" title="Assembly updated" description={safeMessage(query.success, "Assembly work updated.")}/> : null}
    {query.error ? <FeedbackBanner className="mb-4" tone="error" announcement="alert" title="Assembly action needs attention" description={safeMessage(query.error, "The Assembly action could not be completed. Refresh and try again.")}/> : null}
    {projectionUnavailable ? <FeedbackBanner className="mb-4" tone="warning" title="Assembly queue temporarily unavailable" description="Worker actions are unavailable until an owner repairs the work projection."/> : null}
    {!projectionUnavailable && activeSources.length === 0 && !resolution.requestedSource ? <EmptyState title="No active Assembly work" description="New eligible Assembly work will appear automatically."/> : null}
    {!projectionUnavailable && activeSources.length > 1 && !selectedSource ? <p className="mb-4 text-sm font-medium text-slate-700">Choose Customer Orders or Consignments to begin.</p> : null}
    {!projectionUnavailable && selectedSource ? <>
      <section className="mb-3 flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2" aria-labelledby="assembly-queue-heading" data-assembly-queue-context><div className="min-w-0"><h2 id="assembly-queue-heading" className="text-lg font-semibold text-slate-950">{assemblySourceLabel(selectedSource)}</h2><p className="mt-0.5 text-sm tabular-nums text-slate-600">{selectedSummary?.itemCount ?? 0} items <span aria-hidden="true">&middot;</span> {selectedSummary?.requiredQuantity ?? 0} units {(selectedSummary?.assignedToMe ?? 0) > 0 ? <><span aria-hidden="true"> &middot; </span>{selectedSummary?.assignedToMe} assigned to me</> : null}</p></div><p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p></section>
      {selectedSource === "ORDER" ? <OrderAssemblyViewSelector selected={orderStatus}/> : null}
      {hasCards ? <section className="space-y-3" aria-label={`${assemblySourceLabel(selectedSource)} Assembly queue`}>{selectedSource === "ORDER" ? order!.tasks.map((task) => <OrderAssemblyWorkCard key={task.id} task={task} user={order!.user} workers={workers}/>) : grouped!.cards.map((card) => <GroupedWorkCard key={card.groupKey} card={card} canAct={canAct} canReportProblem={canReportProblem}/>)}</section> : <EmptyState title={`No ${assemblySourceLabel(selectedSource)} Assembly work`} description="New eligible Assembly work will appear automatically."/>}
      <AssemblyPagination source={selectedSource} page={page} hasMore={hasMore} status={selectedSource === "ORDER" ? orderStatus : undefined}/>
    </> : null}
    {!projectionUnavailable && supportedSources.length === 0 ? <EmptyState title="Assembly is not available for this marketplace" description="The selected marketplace does not support an Assembly work source."/> : null}
  </AppShell>;
}

function safeMessage(value: string, fallback: string) { const message = value.normalize("NFKC").trim(); return message && message.length <= 240 ? message : fallback; }
function OrderAssemblyViewSelector({ selected }: { selected: "active" | "problem" | "completed" | "mine" }) { return <nav aria-label="Customer Order Assembly views" className="mb-3 flex flex-wrap gap-2">{(["active", "problem", "completed", "mine"] as const).map((view) => <Link key={view} href={`/work/assemble?source=ORDER${view === "active" ? "" : `&status=${view}`}`} aria-current={view === selected ? "true" : undefined} className={buttonStyles({ variant: view === selected ? "secondary" : "quiet" })}>{view === "active" ? "Active" : view === "problem" ? "Problems" : view === "completed" ? "Completed today" : "Assigned to me"}</Link>)}</nav>; }
function AssemblyPagination({ source, page, hasMore, status }: { source: AssemblySource; page: number; hasMore: boolean; status?: string }) { if (page === 1 && !hasMore) return null; const suffix = status && status !== "active" ? `&status=${status}` : ""; return <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Assembly queue pages"><p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p><div className="flex gap-2">{page > 1 ? <Link href={`/work/assemble?source=${source}&page=${page - 1}${suffix}`} className={buttonStyles({ variant: "secondary" })}>Previous</Link> : null}{hasMore ? <Link href={`/work/assemble?source=${source}&page=${page + 1}${suffix}`} className={buttonStyles({ variant: "secondary" })}>Next</Link> : null}</div></nav>; }
