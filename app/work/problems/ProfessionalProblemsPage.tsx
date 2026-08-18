import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ProblemWorkspaceCard } from "@/components/ProblemWorkspaceCard";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getProblemsWorkspace, type ProblemSource, type ProblemStageFilter } from "@/src/lib/workflow/problems-workspace";
import { redirect } from "next/navigation";

type Search = { source?: string; stage?: string; page?: string; success?: string; error?: string };

export default async function ProfessionalProblemsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  if (!(hasWorkPermission(user, "canReportProblem") || hasWorkPermission(user, "canManageConsignments") || hasWorkPermission(user, "canViewAllWork"))) redirect(capabilityHomePath(user));
  const account = await requireAccount(user);
  const query = await searchParams;
  const stage = (["PICK", "MARK", "ASSEMBLE", "PACK"].includes(query.stage ?? "") ? query.stage : "ALL") as ProblemStageFilter;
  const page = Math.max(1, Number(query.page) || 1);
  const workspace = await getProblemsWorkspace({ actorUserId: user.id, accountId: account.id, requestedSource: query.source, stage, page });
  const current = new URLSearchParams({ source: workspace.source, stage: workspace.stage });
  const returnPath = `/work/problems?${current}`;

  return <AppShell>
    <PageHeader eyebrow={account.accountDisplayName ?? account.name} title="Problems" description="Review paused Customer Order and Consignment work without rewinding completed stages."><Link href="/work" className={buttonStyles({ variant: "secondary" })}>Work Hub</Link></PageHeader>
    {query.success ? <FeedbackBanner tone="success" announcement="status" title="Problem workspace updated">{query.success}</FeedbackBanner> : null}
    {query.error ? <FeedbackBanner tone="error" announcement="alert" title="Problem action needs attention">{query.error}</FeedbackBanner> : null}

    <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <nav className="flex flex-wrap gap-2" aria-label="Problem sources">
        {workspace.capability.dailyOrders ? <SourceLink source="ORDER" selected={workspace.source === "ORDER"} count={workspace.counts.ORDER} stage={workspace.stage}/> : null}
        {workspace.capability.consignments ? <SourceLink source="CONSIGNMENT" selected={workspace.source === "CONSIGNMENT"} count={workspace.counts.CONSIGNMENT} stage={workspace.stage}/> : null}
      </nav>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="min-w-0 flex-[1_1_12rem] text-xs font-semibold uppercase tracking-wide text-slate-600">Interrupted stage<select name="stage" defaultValue={workspace.stage} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"><option value="ALL">All stages</option><option value="PICK">Pick</option><option value="MARK">Marking</option><option value="ASSEMBLE">Assembly</option><option value="PACK">Pack</option></select></label>
        <input type="hidden" name="source" value={workspace.source}/><button className={buttonStyles({ variant: "secondary" })}>Apply filter</button>
        {workspace.stage !== "ALL" ? <Link href={`/work/problems?source=${workspace.source}`} className={buttonStyles({ variant: "quiet" })}>Clear</Link> : null}
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><p><strong className="text-slate-950">{workspace.total}</strong> open {workspace.source === "ORDER" ? "Customer Order" : "Consignment"} problem{workspace.total === 1 ? "" : "s"}</p>{workspace.stage !== "ALL" ? <p>Filtered to {stageLabel(workspace.stage)}</p> : null}</div>
      {workspace.items.length
        ? <section className="grid gap-4" aria-label="Open problems">{workspace.items.map((item) => <ProblemWorkspaceCard key={`${item.source}:${item.id}`} item={item} returnPath={returnPath}/>)}</section>
        : <EmptyState title={`No open ${workspace.source === "ORDER" ? "Customer Order" : "Consignment"} problems`} description={workspace.stage === "ALL" ? "Nothing in this source needs problem resolution right now." : `No ${stageLabel(workspace.stage)} problems match this source.`} action={{ href: "/work", label: "Back to Work Hub" }}/>
      }
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Problem pages"><p className="text-sm text-slate-600">Page {workspace.page}</p><div className="flex gap-2">{workspace.hasPrevious ? <Link href={pageHref(workspace.source, workspace.stage, workspace.page - 1)} className={buttonStyles({ variant: "secondary" })}>Previous</Link> : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-400">Previous</span>}{workspace.hasNext ? <Link href={pageHref(workspace.source, workspace.stage, workspace.page + 1)} className={buttonStyles({ variant: "secondary" })}>Next</Link> : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-400">Next</span>}</div></nav>
    </div>
  </AppShell>;
}

function SourceLink({ source, selected, count, stage }: { source: ProblemSource; selected: boolean; count: number; stage: ProblemStageFilter }) { const label = source === "ORDER" ? "Customer Orders" : "Consignments"; return <Link href={`/work/problems?source=${source}&stage=${stage}`} data-selected={selected ? "true" : undefined} className={buttonStyles({ variant: selected ? "primary" : "secondary" })}>{label} <span className="ml-1 tabular-nums">{count}</span>{selected ? <span className="sr-only"> selected</span> : null}</Link>; }
function pageHref(source: ProblemSource, stage: ProblemStageFilter, page: number) { return `/work/problems?source=${source}&stage=${stage}&page=${page}`; }
function stageLabel(stage: ProblemStageFilter) { return stage === "MARK" ? "Marking" : stage === "ASSEMBLE" ? "Assembly" : stage === "PACK" ? "Pack" : stage === "PICK" ? "Pick" : "all stages"; }
