"use client";

import { useEffect, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkImageGallery } from "@/components/WorkImageGallery";
import {
  WorkCard,
  WorkCardActions,
  WorkCardContext,
  WorkCardIdentity,
  WorkCardQuantity,
  WorkCardState,
} from "@/components/work-card";
import { GroupedQuickActions } from "@/components/work-card/GroupedQuickActions";
import { MarkingGuidance } from "@/components/work-card/MarkingGuidance";
import { WorkRouteActionButton, WorkRouteDialogC1A, type WorkRouteDialogCard } from "@/components/work-card/WorkRouteDialogC1A";
import type { GroupedWorkCard as Card } from "@/src/lib/workflow/grouped-work";
import type { WorkChangeDetail } from "./LiveWorkRefresh";
import { completeGroupedStageAction } from "./stage-actions";

export function GroupedWorkCard({ card: initialCard, canAct, canReportProblem = false }: { card: Card; canAct: boolean; canReportProblem?: boolean }) {
  const [card, setCard] = useState(initialCard);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    setCard(initialCard);
    setRemoved(false);
  }, [initialCard]);

  useEffect(() => {
    const changed = async (event: Event) => {
      const detail = (event as CustomEvent<WorkChangeDetail>).detail;
      if (detail.groupKey !== card.groupKey) return;
      if (detail.eventType === "STAGE_COMPLETED" && detail.stage === card.stage) {
        setRemoved(true);
        return;
      }
      try {
        const response = await fetch(`/api/work/groups/${card.stage.toLowerCase()}/${card.groupKey}?source=${card.sourceType}`, { cache: "no-store" });
        if (response.status === 404) {
          setRemoved(true);
          return;
        }
        if (response.ok) setCard(((await response.json()) as { card: Card }).card);
      } catch {
        // The live refresh stream will retry.
      }
    };
    window.addEventListener("work-change", changed);
    return () => window.removeEventListener("work-change", changed);
  }, [card.groupKey, card.sourceType, card.stage]);

  if (removed) return null;

  const details = `/work/groups/${card.stage.toLowerCase()}/${card.groupKey}?source=${card.sourceType}`;
  const token = `${card.groupKey}:${card.groupVersion}`;
  const isPackage = card.sourceType === "ORDER" && card.stage === "PACK";
  const identity = isPackage
    ? `Package ${card.trackingId ?? card.operationalIdentifier ?? card.reference}`
    : card.sourceType === "ORDER"
      ? `Order Item ${card.orderItemId ?? card.reference}`
      : card.stage === "PICK"
        ? `Consignment ${card.consignmentNumber ?? card.reference}`
        : `Consignment line ${card.consignmentLineId?.slice(-8) ?? card.reference}`;
  const identityMetadata = card.stage === "PICK"
    ? card.sourceType === "ORDER"
      ? card.trackingId ? <>Tracking / package reference <span className="break-all font-medium text-slate-700">{card.trackingId}</span></> : null
      : card.operationalIdentifier && card.operationalIdentifier !== card.reference
        ? <>Operational barcode <span className="break-all font-medium text-slate-700">{card.operationalIdentifier}</span></>
        : null
    : card.stage === "MARK"
      ? card.sourceType === "ORDER"
        ? card.trackingId ? <>Tracking / AWB <span className="break-all font-medium text-slate-700">{card.trackingId}</span></> : null
        : card.consignmentNumber ? <>Consignment <span className="break-all font-medium text-slate-700">{card.consignmentNumber}</span></> : null
      : null;
  const routeCard: WorkRouteDialogCard = { stage: card.stage, sourceType: card.sourceType, groupKey: card.groupKey, groupVersion: card.groupVersion, taskId: card.memberTaskIds[0], completedQuantity: card.completedQuantity, hasExplicitSavedRoute: card.hasExplicitSavedRoute, savedProcessRoute: card.savedProcessRoute, processRoute: card.processRoute, routeDegraded: card.processRouteDegraded, missingInstructionStages: card.availableMissingInstructionStages, selectableNextStages: card.selectableNextStages };
  return (
    <WorkCard
      source={card.sourceType}
      stage={card.stage}
      status={card.status}
      context={<WorkCardContext source={card.sourceType === "ORDER" ? "Customer order" : "Consignment"} marketplace={card.marketplace} stage={card.stage} status={card.status} />}
      media={<WorkImageGallery images={[card.productImageUrl]} alt={card.productTitle ?? card.sellerSku} compact />}
      identity={<WorkCardIdentity eyebrow={identity} title={card.productTitle ?? "Untitled product"} sellerSku={card.sellerSku} metadata={identityMetadata} />}
      processFlow={<WorkRouteDialogC1A card={routeCard} />}
      quantity={<WorkCardQuantity stage={card.stage} label={card.stage === "PICK" ? "Pick quantity" : undefined} required={card.requiredQuantity} completed={card.completedQuantity} itemCount={card.memberCount} mode={isPackage ? "package" : "standard"} assignment={card.assignedUserName ? `${card.stage === "PICK" ? "Assigned:" : "Assigned to"} ${card.assignedUserName}` : "Unassigned"} />}
      state={<GroupedState card={card} canAct={canAct} />}
      actions={<CardActions card={card} canAct={canAct} canReportProblem={canReportProblem} details={details} token={token} routeCard={routeCard} />}
    />
  );
}

function GroupedState({ card, canAct }: { card: Card; canAct: boolean }) {
  const problem = card.status === "PROBLEM" || card.problemCount > 0;
  const marking = card.stage === "MARK" ? <MarkingGuidance guidance={card.markingGuidance} manual={card.manualMarkingGuidance} missing={card.missingInstructionStages.includes("MARK")} /> : null;
  if (problem) return <div className="grid gap-2"><WorkCardState tone="danger" title="Work paused">An open problem must be resolved before processing can continue.</WorkCardState>{marking}</div>;
  if (card.status === "COMPLETED") return <div className="grid gap-2"><WorkCardState tone="success" title="Work completed">This work is available as a read-only receipt.</WorkCardState>{marking}</div>;
  if (!canAct) return <div className="grid gap-2"><WorkCardState title={card.stage === "PICK" ? "Read-only Pick view" : "Read-only work view"}>Your current permissions do not allow {card.stage.toLowerCase()} actions.</WorkCardState>{marking}</div>;
  if (marking) return marking;
  if (card.stage === "PICK" && card.missingInstructionStages.length > 0) return <WorkCardState tone="warning" title={card.completedQuantity > 0 ? "Picking in progress" : "Ready to pick"}>Saved instructions are unavailable. Acknowledge this in Process Flow before completing. No settings will be invented.</WorkCardState>;
  if (card.missingInstructionStages.length > 0) return <WorkCardState tone="warning" title="Saved instructions unavailable">Acknowledge this in Process Flow before completing. No settings will be invented.</WorkCardState>;
  if (card.stage === "PICK" && card.completedQuantity > 0) return <WorkCardState title="Picking in progress" />;
  if (card.stage === "PICK") return <WorkCardState title="Ready to pick">Confirm the product and required quantity.</WorkCardState>;
  return <WorkCardState title="Ready to process">Use the actions for this exact work item.</WorkCardState>;
}

function CardActions({ card, canAct, canReportProblem, details, token, routeCard }: { card: Card; canAct: boolean; canReportProblem: boolean; details: string; token: string; routeCard: WorkRouteDialogCard }) {
  const problem = card.status === "PROBLEM" || card.problemCount > 0;
  const completed = card.status === "COMPLETED";
  const hidden = <>
    <input type="hidden" name="stage" value={card.stage}/>
    <input type="hidden" name="sourceType" value={card.sourceType}/>
    <input type="hidden" name="groupKey" value={card.groupKey}/>
    <input type="hidden" name="groupVersion" value={card.groupVersion}/>
    <input type="hidden" name="clientRequestId" value={`${token}:complete`}/>
  </>;

  if (problem) {
    return <WorkCardActions mode="problem">
      <GroupedQuickActions card={card} detailsHref={details} canAct={false} canReportProblem={canReportProblem}/>
    </WorkCardActions>;
  }

  if (completed) {
    return <WorkCardActions mode="completed">
      <GroupedQuickActions card={card} detailsHref={details} canAct={false} canReportProblem={false}/>
    </WorkCardActions>;
  }

  if (!canAct) {
    return <WorkCardActions mode="read-only">
      <GroupedQuickActions card={card} detailsHref={details} canAct={false} canReportProblem={false}/>
    </WorkCardActions>;
  }

  if (card.stage === "PACK") {
    return <WorkCardActions mode="ready">
      <form action={completeGroupedStageAction}>{hidden}<SubmitButton pendingText="Packing..." className="w-full">Complete Pack</SubmitButton></form>
      <GroupedQuickActions card={card} detailsHref={details} canAct canReportProblem={canReportProblem}/>
    </WorkCardActions>;
  }

  const completionLabel = card.stage === "PICK" ? "Complete Pick" : card.stage === "MARK" ? "Marking Completed" : "Assembly Completed";
  if (card.stage === "MARK" && (routeCard.selectableNextStages?.length ?? 0) <= 1) {
    return <WorkCardActions mode="ready"><form action={completeGroupedStageAction} className="col-span-2">{hidden}<input type="hidden" name="useRecommended" value="1"/><SubmitButton pendingText="Completing..." className="w-full">Marking Completed</SubmitButton></form><GroupedQuickActions card={card} detailsHref={details} canAct canReportProblem={canReportProblem}/></WorkCardActions>;
  }
  return <WorkCardActions mode="ready" className={card.stage === "PICK" ? "[&>:last-child:nth-child(odd)]:col-span-2" : ""}>
    <WorkRouteActionButton card={routeCard} label={completionLabel}/>
    <GroupedQuickActions card={card} detailsHref={details} canAct canReportProblem={canReportProblem}/>
  </WorkCardActions>;
}
