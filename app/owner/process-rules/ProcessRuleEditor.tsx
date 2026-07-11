"use client";
import { useState } from "react";
import type { ProcessRoute } from "@prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { disableProcessRuleAction, setProcessRuleAction } from "./actions";

const OPTIONS: Array<[ProcessRoute,string]> = [["PICK_PACK","Ready-made: Pick > Pack"],["PICK_MARK_PACK","Marking: Pick > Mark > Pack"],["PICK_ASSEMBLE_PACK","Assembly: Pick > Assemble > Pack"],["PICK_MARK_ASSEMBLE_PACK","Marking + Assembly"]];

export function ProcessRuleEditor({ listingId, rule, assets }: { listingId: string; rule?: { id:string; route:ProcessRoute; markingAssetId:string|null; assemblyTitle:string|null; assemblyInstructions:string|null }; assets:Array<{id:string;label:string;hasFile:boolean}> }) {
 const [route,setRoute]=useState<ProcessRoute>(rule?.route??"PICK_PACK"); const marking=route==="PICK_MARK_PACK"||route==="PICK_MARK_ASSEMBLE_PACK"; const assembly=route==="PICK_ASSEMBLE_PACK"||route==="PICK_MARK_ASSEMBLE_PACK";
 return <div><form action={setProcessRuleAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="listingId" value={listingId}/><select name="route" value={route} onChange={(event)=>setRoute(event.target.value as ProcessRoute)} className="min-h-11 rounded-md border px-2">{OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select name="markingAssetId" defaultValue={rule?.markingAssetId??""} disabled={!marking} className="min-h-11 rounded-md border px-2 disabled:bg-slate-100"><option value="">Select marking asset</option>{assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.label}{asset.hasFile?"":" (missing file)"}</option>)}</select>{assembly?<><input name="assemblyTitle" defaultValue={rule?.assemblyTitle??""} placeholder="Assembly title" maxLength={240} className="min-h-11 rounded-md border px-2"/><input name="assemblyInstructions" defaultValue={rule?.assemblyInstructions??""} placeholder="Assembly instructions" maxLength={8000} className="min-h-11 rounded-md border px-2"/></>:null}<div className="sm:col-span-2"><SubmitButton pendingText="Saving this listing...">Save route</SubmitButton></div></form>{rule?<form action={disableProcessRuleAction} className="mt-2"><input type="hidden" name="ruleId" value={rule.id}/><SubmitButton pendingText="Disabling..." variant="secondary">Disable rule</SubmitButton></form>:null}</div>;
}
