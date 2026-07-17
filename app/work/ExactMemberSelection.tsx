"use client";
import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { completeSelectedGroupMembersAction } from "./stage-actions";

type Member={id:string;reference:string;requiredQuantity:number;completedQuantity:number;status:string;assignment:string};
export function ExactMemberSelection({stage,sourceType,groupKey,groupVersion,members,missingInstructionStage}:{stage:string;sourceType:string;groupKey:string;groupVersion:string;members:Member[];missingInstructionStage?:string|null}){
 const [selected,setSelected]=useState<string[]>([]),selectedSet=useMemo(()=>new Set(selected),[selected]),selectedQuantity=members.filter(member=>selectedSet.has(member.id)).reduce((sum,member)=>sum+member.requiredQuantity-member.completedQuantity,0),remainingQuantity=members.reduce((sum,member)=>sum+member.requiredQuantity-member.completedQuantity,0)-selectedQuantity;
 return <form action={completeSelectedGroupMembersAction} onSubmit={event=>{if(!selected.length){event.preventDefault();return;}if(!window.confirm(`Complete and route ${selected.length} selected member(s), quantity ${selectedQuantity}?`))event.preventDefault();}}>
  <input type="hidden" name="stage" value={stage}/><input type="hidden" name="sourceType" value={sourceType}/><input type="hidden" name="groupKey" value={groupKey}/><input type="hidden" name="groupVersion" value={groupVersion}/><input type="hidden" name="clientRequestId" value={`${groupKey}:${groupVersion}:exact:${selected.slice().sort().join("-")}`}/>
  <div className="mb-3 grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-center text-sm"><p><span className="block text-xl font-black">{selected.length}</span>selected</p><p><span className="block text-xl font-black">{selectedQuantity}</span>selected quantity</p><p><span className="block text-xl font-black">{remainingQuantity}</span>remaining quantity</p></div>
  <div className="max-h-[30rem] overflow-auto rounded-md border">{members.map(member=><label key={member.id} className="grid min-h-14 cursor-pointer grid-cols-[2rem_1fr_auto] items-center gap-2 border-b px-3 py-2 last:border-0"><input type="checkbox" name="selectedTaskId" value={member.id} checked={selectedSet.has(member.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,member.id]:current.filter(id=>id!==member.id))} className="h-5 w-5"/><span><strong className="block break-all">{member.reference}</strong><span className="text-xs text-slate-600">{member.status.replaceAll("_"," ")} · {member.assignment}</span></span><span className="font-black">{member.completedQuantity}/{member.requiredQuantity}</span></label>)}</div>
  <label className="mt-3 block text-sm font-bold">Optional worker note<input name="workerNote" maxLength={240} className="mt-1 min-h-11 w-full rounded-md border px-3"/></label>
  {missingInstructionStage?<label className="mt-3 flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-bold"><input type="checkbox" name="confirmMissingInstructions" value="1" required/>Saved {missingInstructionStage} instructions are unavailable. Create clearly labelled manual-route work.</label>:null}
  <div className="mt-3"><SubmitButton pendingText="Completing selected...">Complete Selected Members</SubmitButton></div>
 </form>;
}
