import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import type { User } from "@prisma/client";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkImageGallery } from "@/components/WorkImageGallery";
import { buttonStyles } from "@/components/ui/buttonStyles";
import {
  WorkCard,
  WorkCardActions,
  WorkCardContext,
  WorkCardIdentity,
  WorkCardQuantity,
  WorkCardState,
} from "@/components/work-card";
import { WorkProcessFlow } from "@/components/work-card/WorkProcessFlow";
import { WorkRouteActionButton, WorkRouteDialogC1A, type WorkRouteDialogCard } from "@/components/work-card/WorkRouteDialogC1A";
import { WorkTaskQuickActions, type WorkTaskQuickModel } from "@/components/work-card/WorkTaskQuickActions";
import { parseConsignmentCatalogSnapshot } from "@/src/lib/consignments/amazon/catalog-snapshot";
import { parseConsignmentAssemblyMetadata, parseOrderMarkingMetadata } from "@/src/lib/workflow/route-task-metadata";
import { parseImmutableRouteProvenance } from "@/src/lib/workflow/route-provenance";
import { resolveForwardStageEligibility } from "@/src/lib/workflow/route-stage-eligibility";
import { resolveWorkRoutePresentation, routeRelevantMissingInstructionStages } from "@/src/lib/workflow/work-route-presentation";
import type { WorkerQueueTask } from "@/src/lib/workflow/queues";
import { getWorkTaskCapabilities } from "@/src/lib/workflow/worker-access";
import { claimTaskAction, completeTaskAction } from "./actions";

export function WorkTaskCardView({ task, returnPath, user }: { task: WorkerQueueTask; returnPath: string; user: User }) {
  const line = task.consignmentLine;
  if (!line) return null;

  const remaining = task.requiredQuantity - task.completedQuantity;
  const requestBase = `${task.id.slice(0, 60)}:${task.version}:${randomUUID()}`;
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
    <input type="hidden" name="clientRequestId" value={`${requestBase}:${suffix}`} />
    <input type="hidden" name="returnPath" value={returnPath} />
  </>;
  const savedRoute = provenance?.savedProcessRoute ?? line.processRoute ?? null;
  const routePresentation = resolveWorkRoutePresentation({ routeSnapshotJson: task.routeSnapshotJson, metadataJson: task.metadataJson, savedProcessRoute: savedRoute, currentStage: task.stage });
  const availableMissingInstructionStages = [...(!provenance?.markingInstructionSnapshot ? ["MARK" as const] : []), ...(!provenance?.assemblyInstructionSnapshot ? ["ASSEMBLE" as const] : [])];
  const requiredMissingInstructionStages = routeRelevantMissingInstructionStages(routePresentation.stages, availableMissingInstructionStages);
  const selectableNextStages = resolveForwardStageEligibility({ currentStage: task.stage, selectedStages: routePresentation.selectedStages, completedStages: routePresentation.completedStages }).selectableStages;
  const routeCard: WorkRouteDialogCard = { stage: task.stage, sourceType: "CONSIGNMENT", groupKey: task.id, groupVersion: task.updatedAt.toISOString(), taskId: task.id, taskVersion: task.version, completedQuantity: task.completedQuantity, hasExplicitSavedRoute: Boolean(provenance?.hasExplicitSavedRoute), savedProcessRoute: savedRoute, processRoute: routePresentation.processRoute, routeDegraded: routePresentation.degraded, missingInstructionStages: availableMissingInstructionStages, selectableNextStages, actionScope: "TASK", requestBase, returnPath };
  const quickModel: WorkTaskQuickModel = {
    taskId: task.id, stage: task.stage, status: task.status, returnPath, fullDetailsHref: detailsHref,
    title: line.productTitleSnapshot ?? catalog?.title ?? line.productNameSource ?? "Untitled product",
    sellerSku: line.sellerSkuSnapshot ?? line.sellerSkuSource ?? "No SKU", imageUrl: line.productImageSnapshot ?? catalog?.mainImageUrl ?? line.marketplaceListing?.mainImageUrl ?? null, source: "Consignment", marketplace: line.consignmentBatch.marketplace,
    reference: line.consignmentBatch.externalConsignmentNumber, route: routePresentation.processRoute, required: task.requiredQuantity, completed: task.completedQuantity, assignment, requestBase,
    identifiers: [
      { label: "Consignment", value: line.consignmentBatch.externalConsignmentNumber },
      { label: amazon ? "ASIN" : "FSN", value: (amazon ? line.asinSnapshot ?? line.asinSource : line.fsnSnapshot ?? line.fsnSource) ?? "Not available" },
      { label: amazon ? "FNSKU" : "Listing ID", value: (amazon ? line.fnskuSnapshot ?? line.fnskuSource : line.listingIdSnapshot) ?? "Not available" },
    ],
    instructions: [routePresentation.stages.includes("MARK") ? marking?.instructions ?? asset?.instructions : null, routePresentation.stages.includes("ASSEMBLE") ? assembly?.assemblyTitle : null, routePresentation.stages.includes("ASSEMBLE") ? assembly?.assemblyInstructions : null, manual?.workerNote].filter((value): value is string => Boolean(value)), missingInstructionStages: requiredMissingInstructionStages,
    priorStages: line.workTasks.map((item) => ({ stage: item.stage, status: item.status })),
    problem: task.status === "PROBLEM" ? { reason: task.problemReason ?? "Problem", reporter: task.problemReportedBy?.name ?? "Unknown worker", reportedAt: task.problemReportedAt?.toLocaleString() ?? null, note: task.actionLogs[0]?.note ?? null } : undefined,
  };

  return (
    <WorkCard
      source="CONSIGNMENT"
      stage={task.stage}
      status={task.status}
      context={<WorkCardContext source="Consignment" marketplace={line.consignmentBatch.marketplace} stage={task.stage} status={task.status} />}
      media={<WorkImageGallery images={[line.productImageSnapshot ?? catalog?.mainImageUrl ?? line.marketplaceListing?.mainImageUrl, line.marketplaceListing?.imageUrl1, line.marketplaceListing?.imageUrl2, line.marketplaceListing?.imageUrl3]} alt={line.productTitleSnapshot ?? catalog?.title ?? line.sellerSkuSnapshot ?? "Consignment product"} compact />}
      identity={
        <WorkCardIdentity
          eyebrow={line.consignmentBatch.externalConsignmentNumber}
          title={line.productTitleSnapshot ?? catalog?.title ?? line.productNameSource ?? "Untitled product"}
          sellerSku={line.sellerSkuSnapshot ?? line.sellerSkuSource ?? "No SKU"}
          description={catalog?.category ? <>{catalog.category}{catalog.subCategory ? ` / ${catalog.subCategory}` : ""}</> : undefined}
          metadata={<>{task.account.accountDisplayName ?? task.account.name}<span aria-hidden="true"> · </span>{line.consignmentBatch.displayName}</>}
        />
      }
      processFlow={task.stage === "PICK" || task.stage === "MARK" ? <WorkRouteDialogC1A card={routeCard}/> : <WorkProcessFlow currentStage={task.stage} route={routePresentation.processRoute}/>}
      quantity={<WorkCardQuantity stage={task.stage} required={task.requiredQuantity} completed={task.completedQuantity} mode={task.stage === "PACK" ? "package" : "standard"} assignment={assignment} />}
      state={<TaskState task={task} capabilities={capabilities} manual={manual} assembly={assembly} asset={asset} marking={marking} catalogMaterial={catalog?.material} />}
      actions={
        <TaskActions
          task={task}
          capabilities={capabilities}
          hidden={hidden}
          remaining={remaining}
          routeCard={routeCard}
          quickModel={quickModel}
        />
      }
    />
  );
}

type Capabilities = ReturnType<typeof getWorkTaskCapabilities>;
function TaskActions({ task, capabilities, hidden, remaining, routeCard, quickModel }: { task: WorkerQueueTask; capabilities: Capabilities; hidden: (suffix: string) => ReactNode; remaining: number; routeCard: WorkRouteDialogCard; quickModel: WorkTaskQuickModel }) {
  const mode = task.status === "PROBLEM" ? "problem" : task.status === "COMPLETED" ? "completed" : capabilities.readOnly ? "read-only" : "ready";
  return (
    <WorkCardActions mode={mode}>
      {capabilities.canClaim ? <form action={claimTaskAction} className="col-span-2">{hidden("claim")}<SubmitButton pendingText="Starting..." className="w-full">Start {task.stage.toLowerCase()}</SubmitButton></form> : null}
      {capabilities.canProgress ? task.stage === "PICK" ? (
        <WorkRouteActionButton card={routeCard} label={`Complete ${remaining} and choose route`} />
      ) : task.stage === "MARK" && (routeCard.selectableNextStages?.length ?? 0) > 1 ? (
        <WorkRouteActionButton card={routeCard} label="Marking Completed" />
      ) : (
        <form action={completeTaskAction}>{hidden("complete")}<SubmitButton pendingText="Completing..." className="w-full">{task.stage === "PACK" ? "Pack Completed" : `Complete remaining ${remaining}`}</SubmitButton></form>
      ) : null}
      <WorkTaskQuickActions model={quickModel} canProgress={capabilities.canProgress} canReportProblem={capabilities.canReportProblem}/>
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
