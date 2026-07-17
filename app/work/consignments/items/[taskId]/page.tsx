import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { WORK_TASK_INCLUDE } from "@/src/lib/workflow/queues";
import { resolveConsignmentLineWorkflowPrerequisites } from "@/src/lib/workflow/workflow-prerequisites";
import { WorkTaskCard } from "@/app/work/WorkTaskCard";

export default async function ConsignmentItemDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const account = await requireAccount(user);
  const { taskId } = await params;
  const task = await prisma.workTask.findFirst({ where: { id: taskId, accountId: account.id, sourceType: "CONSIGNMENT" }, include: WORK_TASK_INCLUDE });
  if (!task?.consignmentLine) notFound();
  const line = task.consignmentLine;
  const workflow = await resolveConsignmentLineWorkflowPrerequisites({ accountId: account.id, consignmentLineId: line.id }, prisma);
  const allTasks = await prisma.workTask.findMany({
    where: { accountId: account.id, sourceType: "CONSIGNMENT", consignmentLineId: line.id },
    select: { id: true, stage: true, status: true, requiredQuantity: true, completedQuantity: true, assignedUser: { select: { name: true } }, completedByUser: { select: { name: true } }, completedAt: true, problemReason: true },
    orderBy: [{ sequenceNumber: "asc" }, { id: "asc" }]
  });
  const packedTask = allTasks.find(item => item.stage === "PACK" && item.status === "COMPLETED");
  return <AppShell>
    <PageHeader eyebrow={`${line.consignmentBatch.marketplace} consignment item`} title={line.productTitleSnapshot ?? line.sellerSkuSnapshot ?? "Consignment item"} description={`${line.consignmentBatch.externalConsignmentNumber} / ${account.name}`}>
      <div className="flex flex-wrap gap-2"><Link href="/work/scan" className="inline-flex min-h-11 items-center rounded-md border px-4 py-2 font-bold">Scan Next</Link><Link href="/work" className="inline-flex min-h-11 items-center rounded-md border px-4 py-2 font-bold">Back to Work</Link></div>
    </PageHeader>
    {packedTask ? <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 p-4 text-teal-950"><p className="text-lg font-black">PACKED — read only</p><p className="mt-1 text-sm">Packed by {packedTask.completedByUser?.name ?? "Unknown worker"}{packedTask.completedAt ? ` at ${formatDateTime(packedTask.completedAt)}` : ""}. No duplicate Pack action is available.</p></div> : null}
    <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4">
        <div className="rounded-md border bg-white p-4 shadow-sm"><h2 className="font-black">Exact item identity</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Detail label="Source" value="Consignment"/><Detail label="Marketplace" value={line.consignmentBatch.marketplace}/><Detail label="Account" value={account.name}/><Detail label="Consignment" value={line.consignmentBatch.externalConsignmentNumber}/><Detail label="Seller SKU" value={line.sellerSkuSnapshot}/><Detail label="Quantity" value={String(line.requiredQuantity)}/><Detail label="FSN" value={line.fsnSnapshot}/><Detail label="FNSKU" value={line.fnskuSnapshot}/><Detail label="ASIN" value={line.asinSnapshot}/><Detail label="Listing ID" value={line.listingIdSnapshot}/></dl></div>
        <div className="rounded-md border bg-white p-4 shadow-sm"><h2 className="font-black">Pick / Mark / Assembly / Pack</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(["PICK", "MARK", "ASSEMBLE", "PACK"] as const).map(stage => <div key={stage} className="rounded-md bg-slate-50 p-3"><p className="text-xs font-black text-slate-500">{stage}</p><p className="mt-1 text-sm font-bold">{workflow.stages[stage].state.replaceAll("_", " ")}</p></div>)}</div>{workflow.blocker ? <p className="mt-3 text-sm font-bold text-amber-800">{workflow.blocker}</p> : null}</div>
        <div className="rounded-md border bg-white p-4 shadow-sm"><h2 className="font-black">Task and action history</h2><div className="mt-3 divide-y">{allTasks.map(item => <div key={item.id} className="py-3 text-sm"><p className="font-bold">{item.stage}: {item.status.replaceAll("_", " ")} ({item.completedQuantity}/{item.requiredQuantity})</p><p className="mt-1 text-slate-600">Assigned: {item.assignedUser?.name ?? "Unassigned"}{item.completedByUser ? ` · completed by ${item.completedByUser.name}` : ""}{item.completedAt ? ` · ${formatDateTime(item.completedAt)}` : ""}</p>{item.problemReason ? <p className="mt-1 font-semibold text-rose-700">Problem: {item.problemReason.replaceAll("_", " ")}</p> : null}</div>)}</div></div>
      </div>
      <div>{task.status === "COMPLETED" ? null : <WorkTaskCard task={task} user={user} returnPath={`/work/consignments/items/${task.id}`}/>}</div>
    </section>
  </AppShell>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="rounded-md bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value || "Not available"}</dd></div>;
}
