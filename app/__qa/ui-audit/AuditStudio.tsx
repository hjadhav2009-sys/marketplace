"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Viewport = { id: string; width: number; height: number };
type Control = { label: string; tag: string; type: string; disabled: boolean; href?: string | null; width: number; height: number };
export type AuditResult = {
  id: string; area: string; route: string; role: string; scenarioId: string; stateName: string;
  viewport: Viewport; screenshotPath: string | null; tracePath: string | null; consoleStatus: string;
  networkStatus: string; controlCount: number; controls?: Control[]; auditStatus: string; notes: string;
};
type Tool = "select"|"text"|"rectangle"|"ellipse"|"arrow"|"line"|"freehand"|"highlight"|"blur";
type Mark = { id:string; tool:Tool; x:number; y:number; width:number; height:number; text?:string; points?:string; hidden?:boolean; color:string };
type SavedNotes = Record<string, { ownerNotes:string; completed:boolean; marks:Mark[]; redesignMarks:Mark[] }>;

const TAGS = ["KEEP","MOVE","REMOVE UI","RESIZE","MOBILE","DESKTOP","INTERACTION","DATA","BUG","REDESIGN"];
const EMPTY = { ownerNotes:"", completed:false, marks:[] as Mark[], redesignMarks:[] as Mark[] };

export function AuditStudio({ initialResults }: { initialResults: AuditResult[] }) {
  const [selectedId,setSelectedId]=useState(initialResults[0]?.id??"");
  const [query,setQuery]=useState("");
  const [area,setArea]=useState("ALL");
  const [role,setRole]=useState("ALL");
  const [viewport,setViewport]=useState("ALL");
  const [status,setStatus]=useState("ALL");
  const [tab,setTab]=useState<"current"|"redesign"|"notes">("current");
  const [tool,setTool]=useState<Tool>("select");
  const [saved,setSaved]=useState<SavedNotes>({});
  const [history,setHistory]=useState<SavedNotes[]>([]);
  const [future,setFuture]=useState<SavedNotes[]>([]);
  const [draft,setDraft]=useState<{x:number;y:number}|null>(null);
  const frameRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{void fetch("/api/qa/ui-audit/notes").then(r=>r.ok?r.json():{}).then(setSaved).catch(()=>{});},[]);
  const filtered=useMemo(()=>initialResults.filter(item=>
    (area==="ALL"||item.area===area)&&(role==="ALL"||item.role===role)&&(viewport==="ALL"||item.viewport.id===viewport)&&
    (status==="ALL"||item.auditStatus===status)&&(`${item.route} ${item.scenarioId}`.toLowerCase().includes(query.toLowerCase()))
  ),[initialResults,area,role,viewport,status,query]);
  const selected=initialResults.find(item=>item.id===selectedId)??filtered[0];
  const note=selected?saved[selected.id]??EMPTY:EMPTY;
  const marks=tab==="redesign"?note.redesignMarks:note.marks;
  const imageUrl=selected?.screenshotPath?`/api/qa/ui-audit/evidence?path=${encodeURIComponent(selected.screenshotPath)}`:"";

  function mutate(next:SavedNotes){setHistory(items=>[...items.slice(-49),saved]);setFuture([]);setSaved(next);}
  function updateNote(patch:Partial<typeof EMPTY>){if(!selected)return;mutate({...saved,[selected.id]:{...note,...patch}});}
  async function persist(){await fetch("/api/qa/ui-audit/notes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(saved)});}
  function coordinates(event:React.PointerEvent){const rect=frameRef.current!.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  function pointerDown(event:React.PointerEvent){if(tool==="select"||tab==="notes"||!selected)return;event.currentTarget.setPointerCapture(event.pointerId);setDraft(coordinates(event));}
  function pointerUp(event:React.PointerEvent){if(!draft||!selected)return;const end=coordinates(event);const x=Math.min(draft.x,end.x),y=Math.min(draft.y,end.y),width=Math.max(.01,Math.abs(end.x-draft.x)),height=Math.max(.01,Math.abs(end.y-draft.y));const text=tool==="text"?prompt("Annotation text")??"":undefined;const mark:Mark={id:crypto.randomUUID(),tool,x,y,width,height,text,color:tool==="highlight"?"#facc15":tool==="blur"?"#64748b":"#e11d48"};const next=[...marks,mark];updateNote(tab==="redesign"?{redesignMarks:next}:{marks:next});setDraft(null);}
  function removeMark(id:string){const next=marks.filter(mark=>mark.id!==id);updateNote(tab==="redesign"?{redesignMarks:next}:{marks:next});}
  function undo(){const previous=history.at(-1);if(!previous)return;setFuture(items=>[saved,...items]);setSaved(previous);setHistory(items=>items.slice(0,-1));}
  function redo(){const next=future[0];if(!next)return;setHistory(items=>[...items,saved]);setSaved(next);setFuture(items=>items.slice(1));}
  function exportJson(){const blob=new Blob([JSON.stringify(saved,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="synthetic-ui-audit-notes.json";a.click();URL.revokeObjectURL(a.href);}
  async function importJson(file:File){const parsed=JSON.parse(await file.text()) as SavedNotes;mutate(parsed);}
  function duplicateToRedesign(){updateNote({redesignMarks:structuredClone(note.marks)});setTab("redesign");}

  const unique=(key:keyof AuditResult)=>[...new Set(initialResults.map(item=>String(item[key])))].sort();
  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-700 px-4 py-3">
      <div><p className="text-xs font-black uppercase text-pink-400">Private synthetic staging</p><h1 className="text-xl font-black">UI Audit Studio</h1></div>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search route or state" className="ml-auto min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3"/>
      <button onClick={()=>void persist()} className="min-h-11 rounded-lg bg-pink-700 px-4 font-bold">Save notes</button>
      <button onClick={exportJson} className="min-h-11 rounded-lg border px-4 font-bold">Export JSON</button>
      <label className="min-h-11 cursor-pointer rounded-lg border px-4 py-2 font-bold">Import JSON<input type="file" accept="application/json" className="hidden" onChange={e=>e.target.files?.[0]&&void importJson(e.target.files[0])}/></label>
    </header>
    <div className="grid min-h-[calc(100vh-70px)] lg:grid-cols-[320px_1fr_320px]">
      <aside className="border-r border-slate-700 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Filter value={area} set={setArea} values={unique("area")} label="Area"/>
          <Filter value={role} set={setRole} values={unique("role")} label="Role"/>
          <Filter value={viewport} set={setViewport} values={[...new Set(initialResults.map(i=>i.viewport.id))]} label="Viewport"/>
          <Filter value={status} set={setStatus} values={unique("auditStatus")} label="Status"/>
        </div>
        <p className="my-3 text-xs text-slate-400">{filtered.length} captures</p>
        <nav className="max-h-[calc(100vh-210px)] space-y-1 overflow-y-auto">{filtered.map(item=><button key={item.id} onClick={()=>setSelectedId(item.id)} className={`w-full rounded-lg p-2 text-left text-xs ${selected?.id===item.id?"bg-pink-800":"bg-slate-900 hover:bg-slate-800"}`}><span className="block font-black">{item.scenarioId}</span><span className="block truncate text-slate-400">{item.route} · {item.viewport.id}</span></button>)}</nav>
      </aside>
      <section className="min-w-0 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["current","redesign","notes"] as const).map(value=><button key={value} onClick={()=>setTab(value)} className={`min-h-11 rounded-lg px-4 font-bold ${tab===value?"bg-pink-700":"bg-slate-800"}`}>{value[0].toUpperCase()+value.slice(1)}</button>)}
          <button onClick={duplicateToRedesign} className="min-h-11 rounded-lg border px-3">Duplicate to redesign</button>
          <button onClick={()=>updateNote({redesignMarks:[]})} className="min-h-11 rounded-lg border px-3">Reset redesign</button>
          <button onClick={undo} disabled={!history.length} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Undo</button>
          <button onClick={redo} disabled={!future.length} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Redo</button>
        </div>
        {tab!=="notes"?<div className="overflow-auto rounded-xl bg-slate-900 p-3">
          <div ref={frameRef} onPointerDown={pointerDown} onPointerUp={pointerUp} className="relative mx-auto w-fit max-w-full touch-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imageUrl?<img src={imageUrl} alt={selected?.scenarioId??"Audit capture"} className="max-h-[calc(100vh-190px)] max-w-full select-none object-contain"/>:<div className="grid h-96 w-[600px] max-w-full place-items-center border border-dashed text-slate-500">Run browser capture to populate evidence.</div>}
            <svg className="pointer-events-none absolute inset-0 h-full w-full">{marks.filter(mark=>!mark.hidden).map(mark=><MarkShape key={mark.id} mark={mark}/>)}</svg>
          </div>
        </div>:<textarea value={note.ownerNotes} onChange={e=>updateNote({ownerNotes:e.target.value})} placeholder="Owner review notes" className="min-h-[60vh] w-full rounded-xl bg-slate-900 p-4"/>}
      </section>
      <aside className="border-l border-slate-700 p-3">
        <h2 className="font-black">{selected?.scenarioId??"No capture"}</h2><p className="break-all text-xs text-slate-400">{selected?.route}</p>
        <div className="my-3 flex flex-wrap gap-1">{TAGS.map(tag=><button key={tag} onClick={()=>updateNote({ownerNotes:`${note.ownerNotes}${note.ownerNotes?"\n":""}[${tag}] `})} className="rounded bg-slate-800 px-2 py-1 text-xs">{tag}</button>)}</div>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={note.completed} onChange={e=>updateNote({completed:e.target.checked})}/> Completed review</label>
        <h3 className="mt-4 text-sm font-black">Overlay tools</h3><div className="grid grid-cols-2 gap-1">{(["select","text","rectangle","ellipse","arrow","line","freehand","highlight","blur"] as Tool[]).map(value=><button key={value} onClick={()=>setTool(value)} className={`min-h-10 rounded border text-xs font-bold ${tool===value?"bg-pink-700":"bg-slate-900"}`}>{value}</button>)}</div>
        <div className="mt-3 max-h-40 space-y-1 overflow-auto">{marks.map(mark=><div key={mark.id} className="flex items-center justify-between rounded bg-slate-900 p-2 text-xs"><span>{mark.tool} {mark.text}</span><button onClick={()=>removeMark(mark.id)} className="text-pink-300">Delete</button></div>)}</div>
        <h3 className="mt-4 text-sm font-black">Evidence</h3><dl className="text-xs text-slate-300"><dt>Console</dt><dd>{selected?.consoleStatus}</dd><dt>Network</dt><dd>{selected?.networkStatus}</dd><dt>Controls</dt><dd>{selected?.controlCount}</dd><dt>Status</dt><dd>{selected?.auditStatus}</dd></dl>
        {selected?<a href={selected.route} target="_blank" className="mt-4 inline-flex min-h-11 items-center rounded-lg border px-3 font-bold">Open actual route</a>:null}
      </aside>
    </div>
  </main>;
}

function Filter({value,set,values,label}:{value:string;set:(value:string)=>void;values:string[];label:string}){return <label className="text-xs text-slate-400">{label}<select value={value} onChange={e=>set(e.target.value)} className="mt-1 min-h-10 w-full rounded bg-slate-900 px-2 text-slate-100"><option>ALL</option>{values.map(item=><option key={item}>{item}</option>)}</select></label>;}
function MarkShape({mark}:{mark:Mark}){const x=`${mark.x*100}%`,y=`${mark.y*100}%`,width=`${mark.width*100}%`,height=`${mark.height*100}%`;if(mark.tool==="text")return <text x={x} y={y} fill={mark.color} fontSize="18" fontWeight="800">{mark.text}</text>;if(mark.tool==="ellipse")return <ellipse cx={`${(mark.x+mark.width/2)*100}%`} cy={`${(mark.y+mark.height/2)*100}%`} rx={`${mark.width*50}%`} ry={`${mark.height*50}%`} fill="none" stroke={mark.color} strokeWidth="3"/>;if(["line","arrow","freehand"].includes(mark.tool))return <line x1={x} y1={y} x2={`${(mark.x+mark.width)*100}%`} y2={`${(mark.y+mark.height)*100}%`} stroke={mark.color} strokeWidth="4"/>;return <rect x={x} y={y} width={width} height={height} fill={mark.tool==="highlight"?`${mark.color}66`:mark.tool==="blur"?`${mark.color}aa`:"none"} stroke={mark.color} strokeWidth="3"/>;}
