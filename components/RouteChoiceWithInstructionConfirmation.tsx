"use client";
import { useState } from "react";

export function RouteChoiceWithInstructionConfirmation({markingAvailable,assemblyAvailable}:{markingAvailable:boolean;assemblyAvailable:boolean}){
  const [route,setRoute]=useState("");
  const missingMark=(route==="MARK"||route==="MARK_ASSEMBLE")&&!markingAvailable;
  const missingAssembly=(route==="ASSEMBLE"||route==="MARK_ASSEMBLE")&&!assemblyAvailable;
  return <><label className="text-sm font-black">After picking<select name="route" required value={route} onChange={event=>setRoute(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border bg-white px-3"><option value="" disabled>Choose next route</option><option value="DIRECT_PACK">System fallback / Direct to Pack</option><option value="MARK">Marking</option><option value="ASSEMBLE">Assembly</option><option value="MARK_ASSEMBLE">Marking + Assembly</option></select></label>{missingMark||missingAssembly?<label className="flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950"><input type="checkbox" name="confirmMissingInstructions" value="1" required/>Saved {[missingMark?"Marking":null,missingAssembly?"Assembly":null].filter(Boolean).join(" and ")} instructions are unavailable. Create clearly labelled manual-route work.</label>:null}</>;
}
