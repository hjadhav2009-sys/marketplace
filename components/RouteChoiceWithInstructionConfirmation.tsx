"use client";
import { useState } from "react";
import type { ProcessRoute } from "@prisma/client";

const ROUTE_VALUE:Record<ProcessRoute,string>={PICK_PACK:"DIRECT_PACK",PICK_MARK_PACK:"MARK",PICK_ASSEMBLE_PACK:"ASSEMBLE",PICK_MARK_ASSEMBLE_PACK:"MARK_ASSEMBLE"};
const REASONS=["Assembly required","Marking required","Wrong saved route","Special order requirement","Product needs correction","Other"];

export function RouteChoiceWithInstructionConfirmation({markingAvailable,assemblyAvailable,hasExplicitSavedRoute=false,savedProcessRoute=null}:{markingAvailable:boolean;assemblyAvailable:boolean;hasExplicitSavedRoute?:boolean;savedProcessRoute?:ProcessRoute|null}){
  const [route,setRoute]=useState("");
  const [reason,setReason]=useState("");
  const missingMark=(route==="MARK"||route==="MARK_ASSEMBLE")&&!markingAvailable;
  const missingAssembly=(route==="ASSEMBLE"||route==="MARK_ASSEMBLE")&&!assemblyAvailable;
  const savedValue=savedProcessRoute?ROUTE_VALUE[savedProcessRoute]:null;
  const override=hasExplicitSavedRoute&&Boolean(route)&&route!==savedValue;
  return <><p className="rounded-md bg-white p-2 text-xs font-black text-slate-700">{hasExplicitSavedRoute?`Saved route: ${savedProcessRoute?.replaceAll("_"," ")??"Configured"}`:"SYSTEM FALLBACK — DIRECT TO PACK"}</p><label className="text-sm font-black">After picking<select name="route" required value={route} onChange={event=>{setRoute(event.target.value);setReason("");}} className="mt-2 min-h-11 w-full rounded-md border bg-white px-3"><option value="" disabled>Choose next route</option><option value="DIRECT_PACK">Direct to Pack</option><option value="MARK">Marking</option><option value="ASSEMBLE">Assembly</option><option value="MARK_ASSEMBLE">Marking + Assembly</option></select></label>{override?<><label className="text-sm font-black">Route-change reason<select name="routeReason" required value={reason} onChange={event=>setReason(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border bg-white px-3"><option value="">Choose reason</option>{REASONS.map(item=><option key={item}>{item}</option>)}</select></label>{reason==="Other"?<input name="routeOtherReason" required maxLength={240} placeholder="Other reason" className="min-h-11 rounded-md border px-3"/>:null}</>:null}{missingMark||missingAssembly?<><label className="flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950"><input type="checkbox" name="confirmMissingInstructions" value="1" required/>Saved {[missingMark?"Marking":null,missingAssembly?"Assembly":null].filter(Boolean).join(" and ")} instructions are unavailable. Create clearly labelled manual-route work.</label><textarea name="workerNote" maxLength={240} placeholder="Optional operational note" className="min-h-20 rounded-md border p-3"/></>:null}</>;
}
