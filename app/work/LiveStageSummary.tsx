"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import type { GroupedWorkSource } from "@/src/lib/workflow/grouped-work";

type Item={cardCount:number;itemCount:number;requiredQuantity:number;problems:number;assignedToMe:number;oldestWaitingAt:string|null};
export type StageSummary={ORDER:Item;CONSIGNMENT:Item};
export function LiveStageSummary({initial,selectedSource}:{initial:StageSummary;selectedSource?:GroupedWorkSource}){const [summary,setSummary]=useState(initial);useEffect(()=>{const update=(event:Event)=>{const detail=(event as CustomEvent<{summary:StageSummary}>).detail;if(detail?.summary)setSummary(detail.summary);};window.addEventListener("work-summary-change",update);return()=>window.removeEventListener("work-summary-change",update);},[]);return <div role="tablist" aria-label="Work source" className="mb-4 grid gap-2 sm:grid-cols-2">{(["ORDER","CONSIGNMENT"] as const).map(source=><Link role="tab" aria-selected={selectedSource===source} key={source} href={`?source=${source}`} className={`min-h-16 rounded-md border p-3 ${selectedSource===source?"border-slate-950 bg-slate-950 text-white":"bg-white"}`}><span className="text-xs font-bold">{source==="ORDER"?"CUSTOMER ORDERS":"CONSIGNMENTS"}</span><span className="mt-1 flex flex-wrap gap-3 text-sm"><b>{summary[source].cardCount} cards</b><span>{summary[source].itemCount} items</span><span>{summary[source].requiredQuantity} units</span><span>{summary[source].problems} problems</span></span></Link>)}</div>}
