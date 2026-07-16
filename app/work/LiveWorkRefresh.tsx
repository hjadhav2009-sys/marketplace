"use client";
import { useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";

export function LiveWorkRefresh({stage,source}:{stage:string;source?:string}){
 const router=useRouter(),version=useRef(0),refreshTimer=useRef<ReturnType<typeof setTimeout>|null>(null),[fallback,setFallback]=useState(false);
 useEffect(()=>{let events:EventSource|undefined;const query=new URLSearchParams({stage});if(source)query.set("source",source);
  const refresh=()=>{if(document.hidden||refreshTimer.current)return;refreshTimer.current=setTimeout(()=>{refreshTimer.current=null;router.refresh();},150);};
  const check=async()=>{if(document.hidden)return;try{const response=await fetch(`/api/work/live/version?${query}`,{cache:"no-store"});if(!response.ok)return;const data=await response.json() as{version:number};if(version.current&&data.version>version.current)refresh();version.current=data.version;}catch{}};
  if(typeof EventSource!=="undefined"){events=new EventSource(`/api/work/live?${query}`);events.onmessage=event=>{const id=Number(event.lastEventId);if(id>version.current){version.current=id;refresh();}};events.onopen=()=>setFallback(false);events.onerror=()=>setFallback(true);}else setFallback(true);
  void check();const poll=setInterval(()=>{if(events?.readyState!==1)void check();},2000),visible=()=>{if(!document.hidden){void check();refresh();}};document.addEventListener("visibilitychange",visible);
  return()=>{events?.close();clearInterval(poll);if(refreshTimer.current)clearTimeout(refreshTimer.current);document.removeEventListener("visibilitychange",visible);};
 },[router,source,stage]);
 return <p className="mb-3 text-xs font-bold text-slate-500" aria-live="polite">{fallback?"Live reconnecting — safe polling active":"Live work updates connected"}</p>;
}
