import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Metric } from "@/components/ui/Metric";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getGroupedWork, getSmartStageSummary } from "@/src/lib/workflow/grouped-work";
import { combinedPackMetrics, packSourceLabel, resolvePackSource, supportedPackSources, type PackSource, type PackSummary } from "@/src/lib/workflow/pack-workspace";
import { LiveWorkRefresh } from "../LiveWorkRefresh";
import { PackSourceSelector } from "./PackSourceSelector";
import { PackWorkCard } from "./PackWorkCard";

export type PackSearchParams = Promise<{ error?: string; page?: string; source?: string; success?: string }>;

export async function PackWorkspace({ searchParams }: { searchParams: PackSearchParams }) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPack") && !user.canViewAllWork) redirect(capabilityHomePath(user));

  const query = await searchParams;
  const summary = await getSmartStageSummary({ actorUserId: user.id, accountId: account.id, stage: "PACK" }) as PackSummary;
  const resolution = resolvePackSource({ requestedSource: query.source, summary, supportedSources: supportedPackSources(account.marketplace) });
  const { activeSources, selectedSource, supportedSources } = resolution;
  const projectionUnavailable = supportedSources.some((source) => summary[source].projectionUnavailable);
  const metrics = combinedPackMetrics(summary, supportedSources);
  const page = Math.max(1, Number(query.page) || 1);
  const result = selectedSource && !projectionUnavailable ? await getGroupedWork({ actorUserId: user.id, accountId: account.id, stage: "PACK", sourceType: selectedSource, page, includeMemberIds: true }) : null;
  const canAct = hasWorkPermission(user, "canPack");
  const canReportProblem = user.role === "OWNER" || user.canReportProblem;
  const selectedSummary = selectedSource ? summary[selectedSource] : null;

  return <AppShell>
    <PageHeader eyebrow={`${account.marketplace} / ${account.accountDisplayName ?? account.name}`} title="Packing" description="Verify the package or Consignment and its completed processing stages, then complete Packing." />
    <LiveWorkRefresh stage="PACK" source={selectedSource ?? undefined} />
    {!projectionUnavailable ? <section aria-label="Pack queue summary" className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><Metric label="Open work" value={metrics.openWork} /><Metric label="Required quantity" value={metrics.requiredQuantity} /><Metric label="Problems" value={metrics.problems} tone={metrics.problems ? "danger" : "neutral"} /><Metric label="Assigned to me" value={metrics.assignedToMe} tone={metrics.assignedToMe ? "action" : "neutral"} /></section> : null}
    <PackSourceSelector initial={summary} selectedSource={selectedSource} sources={supportedSources} />
    {query.success ? <FeedbackBanner className="mb-4" tone="success" announcement="status" title="Pack updated" description={query.success} /> : null}
    {query.error ? <FeedbackBanner className="mb-4" tone="error" announcement="alert" title="Pack action needs attention" description={query.error} /> : null}
    {projectionUnavailable ? <FeedbackBanner className="mb-4" tone="warning" title="Pack queue temporarily unavailable" description="This queue is not safe to process until its work projection is repaired." /> : null}
    {!projectionUnavailable && activeSources.length === 0 && !resolution.requestedSource ? <EmptyState title="No active Packing work" description="New Pack-ready work will appear automatically." /> : null}
    {!projectionUnavailable && selectedSource ? <>
      <section className="mb-3 flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2" aria-labelledby="pack-queue-heading" data-pack-queue-context>
        <div className="min-w-0"><h2 id="pack-queue-heading" className="text-lg font-semibold text-slate-950">{packSourceLabel(selectedSource)}</h2><p className="mt-0.5 text-sm tabular-nums text-slate-600">{selectedSummary?.cardCount ?? 0} {selectedSource === "ORDER" ? "packages" : "lines"} <span aria-hidden="true">&middot;</span> {selectedSummary?.itemCount ?? 0} items <span aria-hidden="true">&middot;</span> {selectedSummary?.requiredQuantity ?? 0} units</p></div>
        <p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p>
      </section>
      {result?.cards.length ? <section className="space-y-3" aria-label={`${packSourceLabel(selectedSource)} Pack queue`}>{result.cards.map((card) => <PackWorkCard key={card.groupKey} card={card} canAct={canAct} canReportProblem={canReportProblem} />)}</section> : <EmptyState title={selectedSource === "ORDER" ? "No Customer Order packages are ready to pack" : "No Consignment Packing work is ready"} description="New Pack-ready work will appear automatically." />}
      {result ? <PackPagination source={selectedSource} page={page} hasMore={result.hasMore} /> : null}
    </> : null}
    {!projectionUnavailable && supportedSources.length === 0 ? <EmptyState title="Pack is not available for this marketplace" description="The selected marketplace does not support a Pack work source." /> : null}
  </AppShell>;
}

function PackPagination({ source, page, hasMore }: { source: PackSource; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  return <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Pack queue pages"><p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p><div className="flex gap-2">{page > 1 ? <Link href={`/work/pack?source=${source}&page=${page - 1}`} className={buttonStyles({ variant: "secondary" })}>Previous</Link> : null}{hasMore ? <Link href={`/work/pack?source=${source}&page=${page + 1}`} className={buttonStyles({ variant: "secondary" })}>Next</Link> : null}</div></nav>;
}
