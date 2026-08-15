import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getGroupedWork, getSmartStageSummary } from "@/src/lib/workflow/grouped-work";
import {
  pickSourceLabel,
  resolvePickSource,
  supportedPickSources,
  type PickSource,
  type PickSummary,
} from "@/src/lib/workflow/pick-workspace";
import { GroupedWorkCard } from "../GroupedWorkCard";
import { LiveWorkRefresh } from "../LiveWorkRefresh";
import { PickSourceSelector } from "./PickSourceSelector";

export type PickSearchParams = Promise<{
  error?: string;
  page?: string;
  source?: string;
  success?: string;
}>;

export async function PickWorkspace({ searchParams }: { searchParams: PickSearchParams }) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPick") && !user.canViewAllWork) redirect(capabilityHomePath(user));

  const query = await searchParams;
  const summary = await getSmartStageSummary({ actorUserId: user.id, accountId: account.id, stage: "PICK" }) as PickSummary;
  const resolution = resolvePickSource({
    requestedSource: query.source,
    summary,
    supportedSources: supportedPickSources(account.marketplace),
  });
  const { activeSources, selectedSource, supportedSources } = resolution;
  const projectionUnavailable = supportedSources.some((source) => summary[source].projectionUnavailable);
  const page = Math.max(1, Number(query.page) || 1);
  const result = selectedSource && !projectionUnavailable
    ? await getGroupedWork({
        actorUserId: user.id,
        accountId: account.id,
        stage: "PICK",
        sourceType: selectedSource,
        page,
        includeMemberIds: true,
      })
    : null;
  const canAct = hasWorkPermission(user, "canPick");
  const canReportProblem = user.role === "OWNER" || user.canReportProblem;
  const selectedSummary = selectedSource ? summary[selectedSource] : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${account.marketplace} / ${account.accountDisplayName ?? account.name}`}
        title="Pick"
        description="Pick exact items and required quantity. Complete Pick to confirm where the work goes next."
      />
      <LiveWorkRefresh stage="PICK" source={selectedSource ?? undefined} />
      {selectedSource ? (
        <PickSourceSelector initial={summary} selectedSource={selectedSource} supportedSources={supportedSources} />
      ) : null}
      {query.success ? (
        <FeedbackBanner className="mb-4" tone="success" announcement="status" title="Pick updated" description={query.success} />
      ) : null}
      {query.error ? (
        <FeedbackBanner className="mb-4" tone="error" announcement="alert" title="Pick action needs attention" description={query.error} />
      ) : null}
      {projectionUnavailable ? (
        <FeedbackBanner
          className="mb-4"
          tone="warning"
          title="Pick queue temporarily unavailable"
          description="This queue is not safe to process until its work projection is repaired."
        />
      ) : null}
      {!projectionUnavailable && activeSources.length === 0 && !resolution.requestedSource ? (
        <EmptyState title="No Pick work right now" description="New eligible work will appear here automatically." />
      ) : null}
      {!projectionUnavailable && selectedSource ? (
        <>
          <section className="mb-3 flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2" aria-labelledby="pick-queue-heading" data-pick-queue-context>
            <div className="min-w-0">
              <h2 id="pick-queue-heading" className="text-lg font-semibold text-slate-950">{pickSourceLabel(selectedSource)}</h2>
              <p className="mt-0.5 text-sm tabular-nums text-slate-600">
                {selectedSummary?.itemCount ?? 0} items <span aria-hidden="true">&middot;</span> {selectedSummary?.requiredQuantity ?? 0} units
                {(selectedSummary?.assignedToMe ?? 0) > 0 ? <> <span aria-hidden="true">&middot;</span> {selectedSummary?.assignedToMe} assigned to me</> : null}
              </p>
            </div>
            <p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p>
          </section>
          {result?.cards.length ? (
            <section className="space-y-3" aria-label={`${pickSourceLabel(selectedSource)} Pick queue`}>
              {result.cards.map((card) => (
                <GroupedWorkCard key={card.groupKey} card={card} canAct={canAct} canReportProblem={canReportProblem} />
              ))}
            </section>
          ) : (
            <EmptyState
              title={`No ${selectedSource === "ORDER" ? "Customer Order" : "Consignment"} Pick work`}
              description="New eligible work will appear here automatically."
            />
          )}
          {result ? <PickPagination source={selectedSource} page={page} hasMore={result.hasMore} /> : null}
        </>
      ) : null}
      {!projectionUnavailable && supportedSources.length === 0 ? (
        <EmptyState title="Pick is not available for this marketplace" description="The selected marketplace does not support a Pick work source." />
      ) : null}
    </AppShell>
  );
}

function PickPagination({ source, page, hasMore }: { source: PickSource; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Pick queue pages">
      <p className="text-sm font-medium tabular-nums text-slate-600">Page {page}</p>
      <div className="flex gap-2">
        {page > 1 ? <Link href={`/work/pick?source=${source}&page=${page - 1}`} className={buttonStyles({ variant: "secondary" })}>Previous</Link> : null}
        {hasMore ? <Link href={`/work/pick?source=${source}&page=${page + 1}`} className={buttonStyles({ variant: "secondary" })}>Next</Link> : null}
      </div>
    </nav>
  );
}
