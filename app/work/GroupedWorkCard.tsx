"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkImageGallery } from "@/components/WorkImageGallery";
import { WorkRouteDialog } from "@/components/WorkRouteDialog";
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
import type { GroupedWorkCard as Card } from "@/src/lib/workflow/grouped-work";
import type { WorkChangeDetail } from "./LiveWorkRefresh";
import { completeGroupedStageAction } from "./stage-actions";

export function GroupedWorkCard({ card: initialCard, canAct }: { card: Card; canAct: boolean }) {
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
      : `Consignment line ${card.consignmentLineId?.slice(-8) ?? card.reference}`;
  const routeLabel = card.hasExplicitSavedRoute ? card.savedProcessRoute ?? "Saved route" : "System fallback — Direct to Pack";
  return (
    <WorkCard
      source={card.sourceType}
      stage={card.stage}
      status={card.status}
      context={<WorkCardContext source={card.sourceType === "ORDER" ? "Customer order" : "Consignment"} marketplace={card.marketplace} stage={card.stage} status={card.status} />}
      media={<WorkImageGallery images={[card.productImageUrl]} alt={card.productTitle ?? card.sellerSku} compact />}
      identity={<WorkCardIdentity eyebrow={identity} title={card.productTitle ?? "Untitled product"} sellerSku={card.sellerSku} metadata={<>{routeLabel}<span aria-hidden="true"> · </span>{card.assignedUserName ? `Assigned to ${card.assignedUserName}` : "Unassigned"}</>} />}
      quantity={<WorkCardQuantity stage={card.stage} required={card.requiredQuantity} completed={card.completedQuantity} itemCount={card.memberCount} mode={isPackage ? "package" : "standard"} assignment={card.assignedUserName ? `Assigned to ${card.assignedUserName}` : "Unassigned"} />}
      state={<GroupedState card={card} canAct={canAct} routeLabel={routeLabel} />}
      actions={<CardActions card={card} canAct={canAct} details={details} token={token} />}
      disclosure={
        <WorkCardDisclosure label="Identifiers and work context">
          <WorkCardMetadata>
            <WorkCardMetadataItem label="Current stage" value={card.stage} />
            <WorkCardMetadataItem label="Route" value={routeLabel} />
            {card.problemCount ? <WorkCardMetadataItem label="Problem state" value={`${card.problemCount} ${card.problemCount === 1 ? "problem" : "problems"}`} /> : null}
            {card.orderItemId ? <WorkCardMetadataItem label="Order Item ID" value={card.orderItemId} /> : null}
            {card.orderNumber ? <WorkCardMetadataItem label="Order ID" value={card.orderNumber} /> : null}
            {card.shipmentId ? <WorkCardMetadataItem label="Shipment ID" value={card.shipmentId} /> : null}
            {card.trackingId ? <WorkCardMetadataItem label="Tracking ID" value={card.trackingId} /> : null}
            {card.consignmentNumber ? <WorkCardMetadataItem label="Consignment" value={card.consignmentNumber} /> : null}
          </WorkCardMetadata>
        </WorkCardDisclosure>
      }
    />
  );
}

function GroupedState({ card, canAct, routeLabel }: { card: Card; canAct: boolean; routeLabel: string }) {
  const problem = card.status === "PROBLEM" || card.problemCount > 0;
  if (problem) return <WorkCardState tone="danger" title="Work paused">An open problem must be resolved before processing can continue.</WorkCardState>;
  if (card.status === "COMPLETED") return <WorkCardState tone="success" title="Work completed">This work is available as a read-only receipt.</WorkCardState>;
  if (!canAct) return <WorkCardState title="Read-only work view">Your current permissions do not allow {card.stage.toLowerCase()} actions.</WorkCardState>;
  if (card.missingInstructionStages.length > 0) return <WorkCardState tone="warning" title="Saved instructions unavailable">The route dialog will require acknowledgement before continuing. No machine settings or directions will be invented.</WorkCardState>;
  return <WorkCardState title="Ready to process">{routeLabel}</WorkCardState>;
}

function CardActions({ card, canAct, details, token }: { card: Card; canAct: boolean; details: string; token: string }) {
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
      <Link href={`${details}#problems`} className={buttonStyles({ variant: "danger", className: "w-full" })}>Open Problem</Link>
      <Details href={details}/>
    </WorkCardActions>;
  }

  if (completed) {
    return <WorkCardActions mode="completed">
      <Details href={details} className="col-span-2"/>
    </WorkCardActions>;
  }

  if (!canAct) {
    return <WorkCardActions mode="read-only">
      <Details href={details} className="col-span-2"/>
    </WorkCardActions>;
  }

  if (card.stage === "PACK") {
    return <WorkCardActions mode="ready">
      <form action={completeGroupedStageAction}>{hidden}<SubmitButton pendingText="Packing..." className="w-full">Complete Pack</SubmitButton></form>
      <Details href={details}/>
      <Link href={`${details}#problems`} className={buttonStyles({ variant: "danger", className: "col-span-2 w-full" })}>Problem</Link>
    </WorkCardActions>;
  }

  const completionLabel = card.stage === "PICK" ? "Complete Pick" : card.stage === "MARK" ? "Marking Completed" : "Assembly Completed";
  return <WorkCardActions mode="ready">
    <WorkRouteDialog
      card={{
        stage: card.stage,
        sourceType: card.sourceType,
        groupKey: card.groupKey,
        groupVersion: card.groupVersion,
        taskId: card.memberTaskIds[0],
        completedQuantity: card.completedQuantity,
        hasExplicitSavedRoute: card.hasExplicitSavedRoute,
        savedProcessRoute: card.savedProcessRoute,
        missingInstructionStages: card.missingInstructionStages
      }}
      triggerLabel={completionLabel}
    />
    <Link href={`${details}#quantity`} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Partial Quantity</Link>
    <Link href={`${details}#problems`} className={buttonStyles({ variant: "danger", className: "w-full" })}>Problem</Link>
    <Details href={details}/>
  </WorkCardActions>;
}

function Details({ href, className = "" }: { href: string; className?: string }) {
  return <Link href={href} className={buttonStyles({ variant: "secondary", className: `w-full ${className}` })}>Details</Link>;
}
