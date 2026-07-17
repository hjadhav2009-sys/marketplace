"use client";
import { useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";

export type WorkChangeDetail={id:number;eventType:string;sourceType:string;stage:string|null;groupKey:string|null;entityId:string|null};
export function LiveWorkRefresh({stage,source}:{stage:string;source?:string}){
 const router=useRouter(),version=useRef(0),summaryTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),[fallback,setFallback]=useState(false);
 useEffect(()=>{let events:EventSource|undefined;const query=new URLSearchParams({stage});if(source)query.set("source",source);
  const updateSummary=()=>{if(summaryTimer.current)clearTimeout(summaryTimer.current);summaryTimer.current=setTimeout(async()=>{try{const response=await fetch(`/api/work/live/summary?stage=${encodeURIComponent(stage)}`,{cache:"no-store"});if(!response.ok)return;const data=await response.json() as{summary:unknown};window.dispatchEvent(new CustomEvent("work-summary-change",{detail:{summary:data.summary}}));}catch{}},120);};
  const check=async()=>{if(document.hidden||events?.readyState===1)return;try{const response=await fetch(`/api/work/live/version?${query}`,{cache:"no-store"});if(!response.ok)return;const data=await response.json() as{version:number};if(version.current&&data.version>version.current){const scrollY=window.scrollY,active=document.activeElement as HTMLElement|null,focusId=active?.id||active?.getAttribute("name");router.refresh();requestAnimationFrame(()=>{window.scrollTo({top:scrollY});if(focusId)(document.getElementById(focusId)||document.querySelector(`[name="${CSS.escape(focusId)}"]`) as HTMLElement|null)?.focus();});}version.current=data.version;}catch{}};
  if(typeof EventSource!=="undefined"){events=new EventSource(`/api/work/live?${query}`);events.onmessage=event=>{const detail=JSON.parse(event.data) as WorkChangeDetail,id=Number(event.lastEventId);if(id>version.current){version.current=id;window.dispatchEvent(new CustomEvent<WorkChangeDetail>("work-change",{detail}));updateSummary();}};events.onopen=()=>setFallback(false);events.onerror=()=>setFallback(true);events.addEventListener("access-revoked",()=>{events?.close();setFallback(true);});}else setFallback(true);
  const poll=setInterval(()=>void check(),30000),visible=()=>{if(!document.hidden)void check();};document.addEventListener("visibilitychange",visible);return()=>{events?.close();clearInterval(poll);if(summaryTimer.current)clearTimeout(summaryTimer.current);document.removeEventListener("visibilitychange",visible);};
 },[router,source,stage]);
 return <p className="mb-3 text-xs font-bold text-slate-500" aria-live="polite">{fallback?"Live reconnecting — bounded polling active":"Live work updates connected"}</p>;
}
