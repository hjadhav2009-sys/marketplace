"use client";

import { useState } from "react";
import type { ProcessRoute } from "@prisma/client";
import { disableProcessRuleAction, setProcessRuleAction } from "@/app/owner/process-rules/actions";
import { SubmitButton } from "./SubmitButton";
import { Field, fieldControlStyles } from "./ui/Field";

const OPTIONS: Array<[ProcessRoute, string]> = [
  ["PICK_PACK", "Direct to Pack"],
  ["PICK_MARK_PACK", "Marking"],
  ["PICK_ASSEMBLE_PACK", "Assembly"],
  ["PICK_MARK_ASSEMBLE_PACK", "Marking + Assembly"]
];

export function ProfessionalProcessRuleEditor({ listingId, rule, assets }: {
  listingId: string;
  rule?: { id: string; route: ProcessRoute; markingAssetId: string | null; assemblyTitle: string | null; assemblyInstructions: string | null; assemblyImageUrl: string | null };
  assets: Array<{ id: string; label: string; hasFile: boolean }>;
}) {
  const [route, setRoute] = useState<ProcessRoute>(rule?.route ?? "PICK_PACK");
  const marking = route === "PICK_MARK_PACK" || route === "PICK_MARK_ASSEMBLE_PACK";
  const assembly = route === "PICK_ASSEMBLE_PACK" || route === "PICK_MARK_ASSEMBLE_PACK";
  return <div className="min-w-0">
    <form action={setProcessRuleAction} className="grid min-w-0 gap-3">
      <input type="hidden" name="listingId" value={listingId}/>
      <Field id={`route-${listingId}`} label="Default processing route" help="Applied to eligible future work; active work keeps its saved snapshot.">{(attributes) => <select {...attributes} name="route" value={route} onChange={(event) => setRoute(event.target.value as ProcessRoute)} className={fieldControlStyles()}>{OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</Field>
      <Field id={`marking-asset-${listingId}`} label="Marking asset" help={marking ? "Required for a marking route." : "Available when the selected route includes Marking."}>{(attributes) => <select {...attributes} name="markingAssetId" defaultValue={rule?.markingAssetId ?? ""} disabled={!marking} className={fieldControlStyles()}><option value="">Select marking asset</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}{asset.hasFile ? "" : " (missing file)"}</option>)}</select>}</Field>
      {assembly ? <><Field id={`assembly-title-${listingId}`} label="Assembly title" required>{(attributes) => <input {...attributes} name="assemblyTitle" defaultValue={rule?.assemblyTitle ?? ""} maxLength={160} className={fieldControlStyles()}/>}</Field><Field id={`assembly-image-${listingId}`} label="Assembly image URL" help="Optional HTTPS reference.">{(attributes) => <input {...attributes} name="assemblyImageUrl" defaultValue={rule?.assemblyImageUrl ?? ""} maxLength={2048} className={fieldControlStyles()}/>}</Field><Field id={`assembly-instructions-${listingId}`} label="Assembly instructions" required>{(attributes) => <textarea {...attributes} name="assemblyInstructions" defaultValue={rule?.assemblyInstructions ?? ""} maxLength={2000} rows={4} className={fieldControlStyles({ className: "min-h-24 py-2" })}/>}</Field></> : null}
      <SubmitButton pendingText="Saving route...">Save default route</SubmitButton>
    </form>
    {rule ? <form action={disableProcessRuleAction} className="mt-2"><input type="hidden" name="ruleId" value={rule.id}/><SubmitButton pendingText="Disabling..." variant="secondary">Disable saved default</SubmitButton></form> : null}
  </div>;
}
