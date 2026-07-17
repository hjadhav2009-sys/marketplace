"use client";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import type { WorkStage } from "@prisma/client";
import type { StageSummary } from "./LiveStageSummary";
export function LiveWorkHubSummary({initial}:{initial:Partial<Record<WorkStage,StageSummary>>}){
 const [summaries,setSummaries]=useState(initial),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{let events:EventSource|undefined,cancelled=false;const start=async()=>{try{const bootstrap=await fetch("/api/work/live/bootstrap",{cache:"no-store"});if(!bootstrap.ok||cancelled||typeof EventSource==="undefined")return;const {cursor}=await bootstrap.json() as{cursor:number};if(cancelled)return;events=new EventSource(`/api/work/live?after=${cursor}`);events.onmessage=()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(async()=>{try{const response=await fetch("/api/work/live/hub-summary",{cache:"no-store"});if(response.ok)setSummaries((await response.json() as{summaries:Partial<Record<WorkStage,StageSummary>>}).summaries);}catch{}},120);};}catch{}};void start();return()=>{cancelled=true;events?.close();if(timer.current)clearTimeout(timer.current);};},[]);
 return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(summaries).map(([stage,value])=>{const summary=value!,count=summary.ORDER.cardCount+summary.CONSIGNMENT.cardCount,quantity=summary.ORDER.requiredQuantity+summary.CONSIGNMENT.requiredQuantity;return <Link key={stage} href={`/work/${stage.toLowerCase()}`} className="rounded-md bg-slate-950 p-5 text-white"><p className="text-2xl font-black">{stage[0]}{stage.slice(1).toLowerCase()}</p><p className="mt-2 text-sm">{count} grouped cards / Qty {quantity}</p></Link>})}</section>;
}
