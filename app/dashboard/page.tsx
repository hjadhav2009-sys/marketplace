import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Metric } from "@/components/ui/Metric";
import { Surface } from "@/components/ui/Surface";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { requireAccount, requireUser } from "@/lib/auth";
import { getDashboardOverview, type DashboardStage } from "@/lib/dashboard";
import { compactNumber, formatDateTime } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const overview = await getDashboardOverview({ account, actorUserId: user.id });
  const accountName = account.accountDisplayName ?? account.name;
  const accountCode = account.accountCode ?? account.code;
  const unavailableStages = overview.stages.filter((stage) => stage.unavailable);
  const firstStage = overview.stages[0];
  const queueDescription = overview.capabilities.dailyOrders
    ? "Active projected work cards across customer orders and consignments."
    : "Active projected work cards across consignments for this marketplace.";

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${account.marketplace} / ${accountName}`}
        title="Operations overview"
        description="Monitor current work, imports, consignments and exceptions for the selected seller account."
        action={{ href: "/work", label: "Open Work Hub" }}
      >
        <Link href="/work/scan" className={buttonStyles({ variant: "secondary" })}>
          Universal Scan
        </Link>
      </PageHeader>

      <Surface className="mb-4 sm:hidden" padding="compact" aria-label="Operational pulse">
        <dl className="grid min-w-0 grid-cols-2 divide-x divide-slate-200">
          <div className="min-w-0 pr-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pick queue</dt>
            <dd>
              <Link
                href={firstStage.href}
                className="inline-flex min-h-11 min-w-11 items-center rounded-md text-xl font-semibold text-slate-950"
                data-dashboard-queue-value
              >
                {firstStage.unavailable ? "—" : compactNumber(firstStage.cardCount ?? 0)}
              </Link>
            </dd>
          </div>
          <div className="min-w-0 pl-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Imports needing action</dt>
            <dd>
              <Link
                href="/owner/imports"
                className={`inline-flex min-h-11 min-w-11 items-center rounded-md text-xl font-semibold ${overview.importAttention.needsAction ? "text-rose-700" : "text-slate-950"}`}
                data-dashboard-attention-cue
              >
                {compactNumber(overview.importAttention.needsAction)}
              </Link>
            </dd>
          </div>
        </dl>
      </Surface>

      <Surface className="mb-5 sm:mb-7" padding="compact" aria-label="Selected seller account">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected seller account</p>
            <h2 className="mt-1 break-words text-lg font-semibold text-slate-950 sm:text-xl">
              {account.companyName} <span className="font-normal text-slate-400">/</span> {accountName}
            </h2>
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{account.marketplace}</span>
              <span aria-hidden="true">·</span>
              <span className="break-all">{accountCode}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              <Link href="/accounts" className={buttonStyles({ variant: "quiet", className: "px-3" })}>Switch account</Link>
              <Link href="/owner/accounts" className={buttonStyles({ variant: "quiet", className: "px-3" })}>Manage accounts</Link>
            </div>
          </div>

          <dl className="hidden min-w-0 gap-3 sm:grid sm:grid-cols-2">
            <LatestImport label="Latest Product Inventory" createdAt={overview.latestCatalogImport?.createdAt} status={overview.latestCatalogImport?.status} />
            {overview.capabilities.dailyOrders ? (
              <LatestImport label="Latest Daily Orders" createdAt={overview.latestDailyOrderImport?.createdAt} status={overview.latestDailyOrderImport?.status} />
            ) : null}
          </dl>
        </div>
      </Surface>

      <section aria-labelledby="work-queues-title">
        <div className="max-w-2xl">
          <h2 id="work-queues-title" className="text-xl font-semibold text-slate-950">Work queues</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{queueDescription}</p>
        </div>
        {unavailableStages.length ? (
          <FeedbackBanner
            className="mt-4"
            tone="warning"
            title={`${unavailableStages.map((stage) => stage.label).join(", ")} queue ${unavailableStages.length === 1 ? "is" : "are"} unavailable`}
            description="The dashboard is not presenting unavailable projection data as zero. Open Work Hub for the current recovery guidance."
            action={<Link href="/work" className={buttonStyles({ variant: "secondary" })}>Open Work Hub</Link>}
          />
        ) : null}
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overview.stages.map((stage) => <StageMetric key={stage.stage} stage={stage} />)}
        </div>
      </section>

      <div className="mt-8 grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section aria-labelledby="today-title" className="min-w-0">
          <h2 id="today-title" className="text-xl font-semibold text-slate-950">{overview.capabilities.dailyOrders ? "Today and attention" : "Import attention"}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {overview.capabilities.dailyOrders
              ? "Current exceptions stay distinct from completed work and import warnings."
              : "Import exceptions stay distinct from completed work and warnings."}
          </p>
          <Surface className="mt-4">
            <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2">
              {overview.capabilities.dailyOrders ? (
                <>
                  <Metric label="Packed today" value={compactNumber(overview.today.packed ?? 0)} scope="Customer orders · today" tone={overview.today.packed ? "success" : "neutral"} />
                  <Metric label="Open order problems today" value={compactNumber(overview.today.openProblems ?? 0)} scope="Reported today · still open" tone={overview.today.openProblems ? "danger" : "neutral"} />
                </>
              ) : null}
              <Metric label="Imports needing action" value={compactNumber(overview.importAttention.needsAction)} detail="Mapping, file-role review or failed" scope="Current account · all history" tone={overview.importAttention.needsAction ? "danger" : "neutral"} />
              <Metric label="Completed with warnings" value={compactNumber(overview.importAttention.completedWithWarnings)} detail="Completed; review recommended" scope="Current account · all history" tone={overview.importAttention.completedWithWarnings ? "warning" : "neutral"} />
            </div>
          </Surface>
        </section>

        <section aria-labelledby="actions-title" className="min-w-0">
          <h2 id="actions-title" className="text-xl font-semibold text-slate-950">Next actions</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Open an existing operational destination for this account.</p>
          <Surface className="mt-4">
            <ActionGroup label="Operations" actions={overview.actions.operations} />
            <ActionGroup className="mt-5 border-t border-slate-200 pt-5" label="Import and catalog" actions={overview.actions.imports} />
          </Surface>
        </section>
      </div>

      <section aria-labelledby="recent-imports-title" className="mt-8 min-w-0">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="recent-imports-title" className="text-xl font-semibold text-slate-950">Recent imports</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Current ImportJob history for the selected seller account.</p>
          </div>
          <Link href="/owner/imports" className={buttonStyles({ variant: "quiet" })}>View import history</Link>
        </div>

        {overview.recentImports.length ? (
          <Surface className="mt-4 p-0 sm:p-0">
            <ul className="min-w-0 divide-y divide-slate-200">
              {overview.recentImports.map((job) => (
                <li key={job.id} className="min-w-0">
                  <Link href={`/owner/imports/${job.id}`} className="grid min-h-11 min-w-0 gap-3 px-4 py-4 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{job.label}</p>
                      <p className="mt-1 max-w-full [overflow-wrap:anywhere] text-sm text-slate-700" title={job.fileName}>{job.fileName}</p>
                      <p className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{job.marketplace}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={job.createdAt.toISOString()}>{formatDateTime(job.finishedAt ?? job.createdAt)}</time>
                        {job.errorRows ? <span>· {compactNumber(job.errorRows)} errors</span> : null}
                        {job.warningRows ? <span>· {compactNumber(job.warningRows)} warnings</span> : null}
                        {job.progressPercent !== null ? <span>· {job.progressPercent}% processed</span> : null}
                      </p>
                    </div>
                    <StatusBadge value={job.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Surface>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No import history yet"
              description={overview.capabilities.dailyOrders
                ? "Refresh Product Inventory, import Daily Orders, or create a Consignment when this account is ready."
                : "Refresh Product Inventory or create a Consignment when this account is ready."}
              action={{ href: "/owner/imports", label: "Open Import History" }}
            />
          </div>
        )}
      </section>
    </AppShell>
  );
}

function LatestImport({ label, createdAt, status }: { label: string; createdAt?: Date; status?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-950">{createdAt ? formatDateTime(createdAt) : "No import yet"}</dd>
      {status ? <div className="mt-2"><StatusBadge value={status} /></div> : null}
    </div>
  );
}

function StageMetric({ stage }: { stage: DashboardStage }) {
  const value = stage.unavailable ? "Unavailable" : compactNumber(stage.cardCount ?? 0);
  const sourceCounts = [
    stage.showOrders ? `${compactNumber(stage.orderCards ?? 0)} Orders` : null,
    stage.showConsignments ? `${compactNumber(stage.consignmentCards ?? 0)} Consignments` : null,
  ].filter(Boolean).join(" · ");
  const detail = stage.unavailable ? "Projection state needs review" : sourceCounts;
  const scope = stage.unavailable ? "No fallback zero shown" : `${compactNumber(stage.itemCount ?? 0)} items · ${compactNumber(stage.requiredQuantity ?? 0)} units waiting`;

  return (
    <Link href={stage.href} className="block min-h-11 min-w-0 rounded-md">
      <Surface className="h-full transition-colors hover:border-slate-300" padding="compact">
        <Metric label={`${stage.label} queue`} value={value} detail={detail} scope={scope} tone="neutral" />
      </Surface>
    </Link>
  );
}

function ActionGroup({ actions, className = "", label }: { actions: Array<{ href: string; label: string; variant: "primary" | "secondary" | "quiet" }>; className?: string; label: string }) {
  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-slate-950">{label}</h3>
      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className={buttonStyles({ variant: action.variant, className: "max-w-full" })}>
            <span className="[overflow-wrap:anywhere]">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
