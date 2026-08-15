import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import type { User } from "@prisma/client";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkRouteDialog } from "@/components/WorkRouteDialog";
import { Field, fieldControlStyles } from "@/components/ui/Field";
import { buttonStyles } from "@/components/ui/buttonStyles";
import {
  WorkCard,
  WorkCardActions,
  WorkCardContext,
  WorkCardDisclosure,
  WorkCardIdentity,
  WorkCardMetadata,
  WorkCardMetadataItem,
  WorkCardQuantity,
  WorkCardState,
} from "@/components/work-card";
import { parseConsignmentCatalogSnapshot } from "@/src/lib/consignments/amazon/catalog-snapshot";
import { parseConsignmentAssemblyMetadata, parseOrderMarkingMetadata } from "@/src/lib/workflow/route-task-metadata";
import { parseImmutableRouteProvenance } from "@/src/lib/workflow/route-provenance";
import type { WorkerQueueTask } from "@/src/lib/workflow/queues";
import { getWorkTaskCapabilities } from "@/src/lib/workflow/worker-access";
import { claimTaskAction, completeTaskAction, reportTaskProblemAction, setTaskProgressAction } from "./actions";

export function WorkTaskCardView({ task, returnPath, user }: { task: WorkerQueueTask; returnPath: string; user: User }) {
  const line = task.consignmentLine;
  if (!line) return null;

  const remaining = task.requiredQuantity - task.completedQuantity;
  const token = `${task.id}:${task.updatedAt.toISOString()}:${task.completedQuantity}`;
  const asset = line.markingAsset;
  const marking = parseOrderMarkingMetadata(task.metadataJson);
  const assembly = parseConsignmentAssemblyMetadata(task.metadataJson);
  const manual = manualRouteMetadata(task.metadataJson);
  const catalog = parseConsignmentCatalogSnapshot(line.catalogSnapshotJson);
  const amazon = line.consignmentBatch.marketplace === "AMAZON";
  const provenance = parseImmutableRouteProvenance(task.workCardSnapshotJson) ?? parseImmutableRouteProvenance(task.routeSnapshotJson);
  const capabilities = getWorkTaskCapabilities(user, task);
  const assignment = task.assignedUser ? `Assigned to ${task.assignedUser.name}` : "Unassigned / claimable";
  const detailsHref = `/work/consignments/items/${task.id}`;
  const hidden = (suffix: string) => <>
    <input type="hidden" name="taskId" value={task.id} />
    <input type="hidden" name="expectedQuantity" value={task.completedQuantity} />
    <input type="hidden" name="clientRequestId" value={`${token}:${randomUUID()}:${suffix}`} />
    <input type="hidden" name="returnPath" value={returnPath} />
  </>;

  return (
    <WorkCard
      source="CONSIGNMENT"
      stage={task.stage}
      status={task.status}
      context={<WorkCardContext source="Consignment" marketplace={line.consignmentBatch.marketplace} stage={task.stage} status={task.status} />}
      media={<ProductImage src={line.productImageSnapshot ?? catalog?.mainImageUrl ?? line.marketplaceListing?.mainImageUrl} alt={line.productTitleSnapshot ?? catalog?.title ?? line.sellerSkuSnapshot ?? "Consignment product"} size="lg" showBadge={false} />}
      identity={
        <WorkCardIdentity
          eyebrow={line.consignmentBatch.externalConsignmentNumber}
          title={line.productTitleSnapshot ?? catalog?.title ?? line.productNameSource ?? "Untitled product"}
          sellerSku={line.sellerSkuSnapshot ?? line.sellerSkuSource ?? "No SKU"}
          description={catalog?.category ? <>{catalog.category}{catalog.subCategory ? ` / ${catalog.subCategory}` : ""}</> : undefined}
          metadata={<>{task.account.accountDisplayName ?? task.account.name}<span aria-hidden="true"> · </span>{line.consignmentBatch.displayName}</>}
        />
      }
      quantity={<WorkCardQuantity stage={task.stage} required={task.requiredQuantity} completed={task.completedQuantity} mode={task.stage === "PACK" ? "package" : "standard"} assignment={assignment} />}
      state={<TaskState task={task} capabilities={capabilities} manual={manual} assembly={assembly} asset={asset} marking={marking} catalogMaterial={catalog?.material} />}
      actions={
        <TaskActions
          task={task}
          capabilities={capabilities}
          detailsHref={detailsHref}
          hidden={hidden}
          provenance={provenance}
          remaining={remaining}
        />
      }
      disclosure={
        <div className="divide-y divide-slate-100">
          <WorkCardDisclosure label="Identifiers and route context">
            <WorkCardMetadata>
              <WorkCardMetadataItem label="Route" value={line.processRoute?.replaceAll("_", " → ") ?? "Choose after Pick"} />
              <WorkCardMetadataItem label="Assignment" value={assignment} />
              {amazon ? <><WorkCardMetadataItem label="ASIN" value={line.asinSnapshot ?? line.asinSource ?? "missing"} /><WorkCardMetadataItem label="FNSKU" value={line.fnskuSnapshot ?? line.fnskuSource ?? "missing"} /></> : <><WorkCardMetadataItem label="FSN" value={line.fsnSnapshot ?? line.fsnSource ?? "missing"} /><WorkCardMetadataItem label="Listing ID" value={line.listingIdSnapshot ?? "missing"} /></>}
            </WorkCardMetadata>
          </WorkCardDisclosure>
          <WorkCardDisclosure label="Prior stages">
            <div className="flex flex-wrap gap-2">{line.workTasks.map((item) => <span key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">{item.stage}: {item.status}</span>)}</div>
          </WorkCardDisclosure>
          {capabilities.canReportProblem ? <ProblemDisclosure hidden={hidden} /> : null}
        </div>
      }
    />
  );
}

type Capabilities = ReturnType<typeof getWorkTaskCapabilities>;
type Provenance = ReturnType<typeof parseImmutableRouteProvenance>;

function TaskActions({ task, capabilities, detailsHref, hidden, provenance, remaining }: { task: WorkerQueueTask; capabilities: Capabilities; detailsHref: string; hidden: (suffix: string) => ReactNode; provenance: Provenance; remaining: number }) {
  const mode = task.status === "PROBLEM" ? "problem" : task.status === "COMPLETED" ? "completed" : capabilities.readOnly ? "read-only" : "ready";
  return (
    <WorkCardActions mode={mode}>
      {capabilities.canClaim ? <form action={claimTaskAction} className="col-span-2">{hidden("claim")}<SubmitButton pendingText="Starting..." className="w-full">Start {task.stage.toLowerCase()}</SubmitButton></form> : null}
      {capabilities.canProgress && task.stage !== "PACK" ? (
        <form action={setTaskProgressAction} className="col-span-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          {hidden("set")}
          <Field id={`target-quantity-${task.id}`} label="Exact completed quantity">
            {(attributes) => <input {...attributes} name="targetQuantity" type="number" min={task.completedQuantity} max={task.requiredQuantity} step="1" defaultValue={task.completedQuantity} className={fieldControlStyles()} />}
          </Field>
          <SubmitButton pendingText="Saving..." variant="secondary" className="w-full self-end">Save exact quantity</SubmitButton>
        </form>
      ) : null}
      {capabilities.canProgress ? task.stage === "PICK" ? (
        <div className="col-span-2 grid"><WorkRouteDialog card={{ stage: "PICK", sourceType: "CONSIGNMENT", groupKey: task.id, groupVersion: task.updatedAt.toISOString(), taskId: task.id, completedQuantity: task.completedQuantity, hasExplicitSavedRoute: Boolean(provenance?.hasExplicitSavedRoute), savedProcessRoute: provenance?.savedProcessRoute ?? null, missingInstructionStages: [...(!provenance?.markingInstructionSnapshot ? ["MARK" as const] : []), ...(!provenance?.assemblyInstructionSnapshot ? ["ASSEMBLE" as const] : [])] }} triggerLabel={`Complete ${remaining} and choose route`} /></div>
      ) : (
        <form action={completeTaskAction} className="col-span-2">{hidden("complete")}<SubmitButton pendingText="Completing..." className="w-full">{task.stage === "PACK" ? "Pack Completed" : `Complete remaining ${remaining}`}</SubmitButton></form>
      ) : null}
      <Link href={detailsHref} className={buttonStyles({ variant: "secondary", className: "col-span-2 w-full" })}>Details</Link>
    </WorkCardActions>
  );
}

function TaskState({ task, capabilities, manual, assembly, asset, marking, catalogMaterial }: { task: WorkerQueueTask; capabilities: Capabilities; manual: ReturnType<typeof manualRouteMetadata>; assembly: ReturnType<typeof parseConsignmentAssemblyMetadata>; asset: NonNullable<WorkerQueueTask["consignmentLine"]>["markingAsset"]; marking: ReturnType<typeof parseOrderMarkingMetadata>; catalogMaterial?: string | null }) {
  if (task.status === "PROBLEM") {
    return <WorkCardState tone="danger" title={task.problemReason?.replaceAll("_", " ") ?? "Problem"}><>{task.actionLogs[0]?.note ? <p>{task.actionLogs[0].note}</p> : null}<p className="mt-1 text-xs">Reported by {task.problemReportedBy?.name ?? "Unknown worker"}{task.problemReportedAt ? ` / ${task.problemReportedAt.toLocaleString()}` : ""} / progress {task.completedQuantity} of {task.requiredQuantity}</p></></WorkCardState>;
  }
  if (task.status === "COMPLETED") return <WorkCardState tone="success" title="Work completed">This task is available as a read-only receipt.</WorkCardState>;
  const instructions = taskInstructionState({ task, manual, assembly, asset, marking, catalogMaterial });
  if (capabilities.readOnly) return <div className="grid gap-2"><WorkCardState title="Read-only work view">Your current permissions do not allow actions for this task.</WorkCardState>{instructions}</div>;
  return instructions ?? <WorkCardState title="Ready to process">Use the controls in this card to record progress for the assigned stage.</WorkCardState>;
}

function taskInstructionState({ task, manual, assembly, asset, marking, catalogMaterial }: Omit<Parameters<typeof TaskState>[0], "capabilities">) {
  if (manual) return <WorkCardState tone="warning" title={manual.warning}><p>Routed by {manual.routedByUserId} at {new Date(manual.routedAt).toLocaleString()}.</p>{manual.workerNote ? <p className="mt-1 whitespace-pre-wrap">Worker note: {manual.workerNote}</p> : null}<p className="mt-1 font-semibold">Continue with manual stage guidance; no machine settings or assembly directions were invented.</p></WorkCardState>;
  if (task.stage === "MARK") {
    if (!(asset || marking)) return <WorkCardState tone="danger" title="Marking instructions unavailable">Saved marking instructions are unavailable. No machine settings will be invented.</WorkCardState>;
    return <WorkCardState title="Marking instructions"><div className="grid gap-1"><p>{marking?.masterDesignId ?? asset?.masterDesignId ?? "No Master Design ID"} / {marking?.markingAssetName ?? asset?.name}</p><p>{marking?.material ?? asset?.material ?? catalogMaterial ?? "Material not set"} / {marking?.markingPosition ?? asset?.markingPosition ?? "Position not set"}</p><p>{marking?.markingWidthMm ?? asset?.markingWidthMm ?? "-"} x {marking?.markingHeightMm ?? asset?.markingHeightMm ?? "-"} mm / Power {marking?.powerSetting ?? asset?.powerSetting ?? "-"} / Speed {marking?.speedSetting ?? asset?.speedSetting ?? "-"} / Frequency {marking?.frequencySetting ?? asset?.frequencySetting ?? "-"} / Passes {marking?.passes ?? asset?.passes ?? "-"}</p><p>{marking?.instructions ?? asset?.instructions ?? "No extra instructions"}</p><Link href={`/work/marking/${task.id}`} className={buttonStyles({ variant: "secondary", className: "mt-1 w-full sm:w-fit" })}>Product and marking details</Link></div></WorkCardState>;
  }
  if (task.stage === "ASSEMBLE") return <WorkCardState tone={assembly ? "neutral" : "danger"} title={assembly?.assemblyTitle ?? "Assembly instructions unavailable"}><p className="whitespace-pre-wrap">{assembly?.assemblyInstructions ?? "Saved assembly instructions are unavailable."}</p>{assembly?.assemblyImageUrl ? <a href={assembly.assemblyImageUrl} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", className: "mt-2 w-full sm:w-fit" })}>Open assembly reference</a> : null}</WorkCardState>;
  return null;
}

function ProblemDisclosure({ hidden }: { hidden: (suffix: string) => ReactNode }) {
  return (
    <WorkCardDisclosure label="Report problem">
      <form action={reportTaskProblemAction} className="grid gap-3 pb-1">
        {hidden("problem")}
        <Field id={`problem-reason-${randomUUID()}`} label="Problem reason" required>
          {(attributes) => <select {...attributes} name="reason" required className={fieldControlStyles()}>{["PRODUCT_NOT_FOUND", "WRONG_PRODUCT", "QUANTITY_SHORT", "DAMAGED_PRODUCT", "MARKING_INSTRUCTION_MISSING", "MARKING_IMAGE_MISSING", "MARKING_FAILED", "PACKING_BLOCKED", "IDENTIFIER_NOT_MATCHING", "OTHER"].map((reason) => <option key={reason}>{reason.replaceAll("_", " ")}</option>)}</select>}
        </Field>
        <Field id={`problem-note-${randomUUID()}`} label="Note" help="Optional, up to 1,000 characters.">
          {(attributes) => <textarea {...attributes} name="note" maxLength={1000} className={fieldControlStyles({ className: "min-h-20" })} />}
        </Field>
        <SubmitButton pendingText="Reporting..." variant="secondary" className="w-full sm:w-fit">Report problem</SubmitButton>
      </form>
    </WorkCardDisclosure>
  );
}

function manualRouteMetadata(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "") as { instructionStatus?: string; warning?: string; routedByUserId?: string; routedAt?: string; workerNote?: string | null };
    return parsed.instructionStatus === "MISSING" && parsed.warning && parsed.routedByUserId && parsed.routedAt
      ? { ...parsed, warning: parsed.warning, routedByUserId: parsed.routedByUserId, routedAt: parsed.routedAt }
      : null;
  } catch {
    return null;
  }
}
