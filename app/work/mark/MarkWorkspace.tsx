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
import { combinedMarkMetrics, markSourceLabel, resolveMarkSource, supportedMarkSources, type MarkSource, type MarkSummary } from "@/src/lib/workflow/mark-workspace";
import { GroupedWorkCard } from "../GroupedWorkCard";
import { LiveWorkRefresh } from "../LiveWorkRefresh";
import { MarkSourceSelector } from "./MarkSourceSelector";

export type MarkSearchParams = Promise<{ error?: string; page?: string; source?: string; success?: string }>;

export async function MarkWorkspace({ searchParams }: { searchParams: MarkSearchParams }) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canMark") && !user.canViewAllWork) redirect(capabilityHomePath(user));
  const query = await searchParams;
  const summary = await getSmartStageSummary({ actorUserId: user.id, accountId: account.id, stage: "MARK" }) as MarkSummary;
  const resolution = resolveMarkSource({ requestedSource: query.source, summary, supportedSources: supportedMarkSources(account.marketplace) });
  const { activeSources, selectedSource, supportedSources } = resolution;
  const projectionUnavailable = supportedSources.some((source) => summary[source].projectionUnavailable);
  const page = Math.max(1, Number(query.page) || 1);
  const result = selectedSource && !projectionUnavailable ? await getGroupedWork({ actorUserId: user.id, accountId: account.id, stage: "MARK", sourceType: selectedSource, page, includeMemberIds: true }) : null;
  const canAct = hasWorkPermission(user, "canMark");
  const canReportProblem = user.role === "OWNER" || user.canReportProblem;
  const metrics = combinedMarkMetrics(summary, supportedSources);
  const selectedSummary = selectedSource ? summary[selectedSource] : null;

  return (
    <AppShell>
      <PageHeader eyebrow={`${account.marketplace} / ${account.accountDisplayName ?? account.name}`} title="Marking" description="Review the product, marking instructions and quantity, then record completed work." />
      <LiveWorkRefresh stage="MARK" source={selectedSource ?? undefined}/>
      {!projectionUnavailable ? <section aria-label="Marking queue summary" className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><Metric label="Open work" value={metrics.openWork}/><Metric label="Required quantity" value={metrics.requiredQuantity}/><Metric label="Problems" value={metrics.problems} tone={metrics.problems ? "danger" : "neutral"}/><Metric label="Assigned to me" value={metrics.assignedToMe} tone={metrics.assignedToMe ? "action" : "neutral"}/></section> : null}
      <MarkSourceSelector initial={summary} selectedSource={selectedSource} sources={supportedSources}/>
      {query.success ? <FeedbackBanner className="mb-4" tone="success" announcement="status" title="Marking updated" description={safeSuccess(query.success)}/> : null}
      {query.error ? <FeedbackBanner className="mb-4" tone="error" announcement="alert" title="Marking action needs attention" description="The Marking action could not be completed. Refresh and try again, or report a problem if the work is blocked."/> : null}
      {projectionUnavailable ? <FeedbackBanner className="mb-4" tone="warning" title="Marking queue temporarily unavailable" description="Worker actions are unavailable until an owner repairs the work projection."/> : null}
      {!projectionUnavailable && activeSources.length === 0 && !resolution.requestedSource ? <EmptyState title="No active marking work" description="New eligible Mark work will appear automatically."/> : null}
      {!projectionUnavailable && activeSources.length > 1 && !selectedSource ? <p className="mb-4 text-sm font-medium text-slate-700">Choose Customer Orders or Consignments to begin.</p> : null}
      {!projectionUnavailable && selectedSource ? <>
        <section className="mb-3 flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2" aria-labelledby="mark-queue-heading" data-mark-queue-context>
          <div className="min-w-0"><h2 id="mark-queue-heading" className="text-lg font-semibold text-slate-950">{markSourceLabel(selectedSource)}</h2><p className="mt-0.5 text-sm tabular-nums text-slate-600">{selectedSummary?.itemCount ?? 0} items <span aria-hidden="true">&middot;</span> {selectedSummary?.requiredQuantity ?? 0} units {(selectedSummary?.assignedToMe ?? 0) > 0 ? <><span aria-hidden="true"> &middot; </span>{selectedSummary?.assignedToMe} assigned to me</> : null}</p></div>
          <p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p>
        </section>
        {result?.cards.length ? <section className="space-y-3" aria-label={`${markSourceLabel(selectedSource)} Marking queue`}>{result.cards.map((card) => <GroupedWorkCard key={card.groupKey} card={card} canAct={canAct} canReportProblem={canReportProblem}/>)}</section> : <EmptyState title={`No ${markSourceLabel(selectedSource)} marking work`} description="New eligible Mark work will appear automatically."/>}
        {result ? <MarkPagination source={selectedSource} page={page} hasMore={result.hasMore}/> : null}
      </> : null}
      {!projectionUnavailable && supportedSources.length === 0 ? <EmptyState title="Marking is not available for this marketplace" description="The selected marketplace does not support a Mark work source."/> : null}
    </AppShell>
  );
}

function safeSuccess(value: string) {
  const message = value.normalize("NFKC").trim();
  return message && message.length <= 240 ? message : "Marking work updated.";
}

function MarkPagination({ source, page, hasMore }: { source: MarkSource; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  return <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Marking queue pages"><p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p><div className="flex gap-2">{page > 1 ? <Link href={`/work/mark?source=${source}&page=${page - 1}`} className={buttonStyles({ variant: "secondary" })}>Previous</Link> : null}{hasMore ? <Link href={`/work/mark?source=${source}&page=${page + 1}`} className={buttonStyles({ variant: "secondary" })}>Next</Link> : null}</div></nav>;
}
