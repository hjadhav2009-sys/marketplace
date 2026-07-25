"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

type Viewport = { id: string; width: number; height: number };
type Control = { label: string; tag: string; type: string; disabled: boolean; href?: string | null; width: number; height: number };
export type AuditResult = {
  id: string; area: string; route: string; role: string; scenarioId: string; stateName: string;
  viewport: Viewport; screenshotPath: string | null; tracePath: string | null; consoleStatus: string;
  networkStatus: string; controlCount: number; controls?: Control[]; auditStatus: string; notes: string;
  viewportScreenshotPath?: string | null; fullPageMasterPath?: string | null; fullPageMasterWidth?: number | null;
  fullPageMasterHeight?: number | null; fullPageFileBytes?: number | null; fullPageSha256?: string | null;
  fullPageCaptureStatus?: string;
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
  const [tab,setTab]=useState<"viewport"|"full-page"|"compare"|"redesign"|"notes">("viewport");
  const [tool,setTool]=useState<Tool>("select");
  const [zoom,setZoom]=useState(100);
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
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(!selected)return;const index=filtered.findIndex(item=>item.id===selected.id);if(event.key==="ArrowRight"&&filtered[index+1])setSelectedId(filtered[index+1].id);if(event.key==="ArrowLeft"&&filtered[index-1])setSelectedId(filtered[index-1].id);};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[filtered,selected]);
  const note=selected?saved[selected.id]??EMPTY:EMPTY;
  const marks=tab==="redesign"?note.redesignMarks:note.marks;
  const viewportPath=selected?.viewportScreenshotPath??selected?.screenshotPath;
  const activePath=tab==="full-page"?selected?.fullPageMasterPath:viewportPath;
  const imageUrl=activePath?`/api/qa/ui-audit/evidence?path=${encodeURIComponent(activePath)}`:"";

  function mutate(next:SavedNotes){setHistory(items=>[...items.slice(-49),saved]);setFuture([]);setSaved(next);}
  function updateNote(patch:Partial<typeof EMPTY>){if(!selected)return;mutate({...saved,[selected.id]:{...note,...patch}});}
  async function persist(){await fetch("/api/qa/ui-audit/notes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(saved)});}
  function coordinates(event:React.PointerEvent){const rect=frameRef.current!.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  function pointerDown(event:React.PointerEvent){if(tool==="select"||tab==="notes"||tab==="compare"||!selected)return;event.currentTarget.setPointerCapture(event.pointerId);setDraft(coordinates(event));}
  function pointerUp(event:React.PointerEvent){if(!draft||!selected)return;const end=coordinates(event);const x=Math.min(draft.x,end.x),y=Math.min(draft.y,end.y),width=Math.max(.01,Math.abs(end.x-draft.x)),height=Math.max(.01,Math.abs(end.y-draft.y));const text=tool==="text"?prompt("Annotation text")??"":undefined;const mark:Mark={id:crypto.randomUUID(),tool,x,y,width,height,text,color:tool==="highlight"?"#facc15":tool==="blur"?"#64748b":"#e11d48"};const next=[...marks,mark];updateNote(tab==="redesign"?{redesignMarks:next}:{marks:next});setDraft(null);}
  function removeMark(id:string){const next=marks.filter(mark=>mark.id!==id);updateNote(tab==="redesign"?{redesignMarks:next}:{marks:next});}
  function undo(){const previous=history.at(-1);if(!previous)return;setFuture(items=>[saved,...items]);setSaved(previous);setHistory(items=>items.slice(0,-1));}
  function redo(){const next=future[0];if(!next)return;setHistory(items=>[...items,saved]);setSaved(next);setFuture(items=>items.slice(1));}
  function exportJson(){const blob=new Blob([JSON.stringify(saved,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="synthetic-ui-audit-notes.json";a.click();URL.revokeObjectURL(a.href);}
  async function exportPng(){if(!imageUrl||!selected)return;const image=new Image();image.src=imageUrl;await image.decode();const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context)return;context.drawImage(image,0,0);for(const mark of marks.filter(item=>!item.hidden)){context.strokeStyle=mark.color;context.fillStyle=mark.color;context.lineWidth=Math.max(3,canvas.width/300);const x=mark.x*canvas.width,y=mark.y*canvas.height,w=mark.width*canvas.width,h=mark.height*canvas.height;if(mark.tool==="text"){context.font=`bold ${Math.max(18,canvas.width/50)}px sans-serif`;context.fillText(mark.text??"",x,y);}else if(mark.tool==="ellipse"){context.beginPath();context.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);context.stroke();}else if(mark.tool==="highlight"||mark.tool==="blur"){context.globalAlpha=.45;context.fillRect(x,y,w,h);context.globalAlpha=1;}else if(["line","arrow","freehand"].includes(mark.tool)){context.beginPath();context.moveTo(x,y);context.lineTo(x+w,y+h);context.stroke();}else context.strokeRect(x,y,w,h);}canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${selected.scenarioId}-${selected.viewport.id}-annotated.png`;a.click();URL.revokeObjectURL(a.href);},"image/png");}
  async function importJson(file:File){const parsed=JSON.parse(await file.text()) as SavedNotes;mutate(parsed);}
  function duplicateToRedesign(){updateNote({redesignMarks:structuredClone(note.marks)});setTab("redesign");}

  const unique=(key:keyof AuditResult)=>[...new Set(initialResults.map(item=>String(item[key])))].sort();
  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-700 px-4 py-3">
      <div><p className="text-xs font-black uppercase text-pink-400">Private synthetic staging</p><h1 className="text-xl font-black">UI Audit Studio</h1></div>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search route or state" className="ml-auto min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3"/>
      <button onClick={()=>void persist()} className="min-h-11 rounded-lg bg-pink-700 px-4 font-bold">Save notes</button>
      <button onClick={exportJson} className="min-h-11 rounded-lg border px-4 font-bold">Export JSON</button>
      <button onClick={()=>void exportPng()} className="min-h-11 rounded-lg border px-4 font-bold">Export PNG</button>
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
        <nav className="max-h-[calc(100vh-210px)] space-y-1 overflow-y-auto">{filtered.map(item=>{const thumb=item.viewportScreenshotPath??item.screenshotPath;return <button key={item.id} onClick={()=>setSelectedId(item.id)} className={`grid w-full grid-cols-[56px_1fr] gap-2 rounded-lg p-2 text-left text-xs ${selected?.id===item.id?"bg-pink-800":"bg-slate-900 hover:bg-slate-800"}`}>{thumb?<img src={`/api/qa/ui-audit/evidence?thumbnail=1&path=${encodeURIComponent(thumb)}`} alt="" className="h-12 w-14 rounded object-cover"/>:<span className="h-12 w-14 rounded bg-slate-800"/>}<span className="min-w-0"><span className="block font-black">{item.scenarioId}</span><span className="block truncate text-slate-400">{item.route} · {item.viewport.id}</span></span></button>})}</nav>
      </aside>
      <section className="min-w-0 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["viewport","full-page","compare","redesign","notes"] as const).map(value=><button key={value} onClick={()=>setTab(value)} className={`min-h-11 rounded-lg px-4 font-bold ${tab===value?"bg-pink-700":"bg-slate-800"}`}>{value.replace("-"," ").replace(/\b\w/g,letter=>letter.toUpperCase())}</button>)}
          <button onClick={duplicateToRedesign} className="min-h-11 rounded-lg border px-3">Duplicate to redesign</button>
          <button onClick={()=>updateNote({redesignMarks:[]})} className="min-h-11 rounded-lg border px-3">Reset redesign</button>
          <button onClick={undo} disabled={!history.length} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Undo</button>
          <button onClick={redo} disabled={!future.length} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Redo</button>
          {[25,50,100,200].map(value=><button key={value} onClick={()=>setZoom(value)} className="min-h-11 rounded-lg border px-3">{value}%</button>)}<button onClick={()=>setZoom(100)} className="min-h-11 rounded-lg border px-3">Fit width</button><button onClick={()=>setZoom(50)} className="min-h-11 rounded-lg border px-3">Fit page</button><span className="self-center text-sm">{zoom}%</span>
        </div>
        {tab==="compare"?<div className="grid gap-3 overflow-auto rounded-xl bg-slate-900 p-3 xl:grid-cols-2">{[viewportPath,selected?.fullPageMasterPath].map((item,index)=>item?<div key={item}><p className="mb-2 font-bold">{index?"Full Page":"Viewport"}</p><img src={`/api/qa/ui-audit/evidence?path=${encodeURIComponent(item)}`} alt={index?"Full page master":"Viewport capture"} className="max-w-full"/></div>:<div key={index} className="grid h-96 place-items-center border border-dashed">Missing evidence</div>)}</div>:tab!=="notes"?<div className="overflow-auto rounded-xl bg-slate-900 p-3">
          <div ref={frameRef} onPointerDown={pointerDown} onPointerUp={pointerUp} style={{width:`${zoom}%`}} className="relative mx-auto w-fit max-w-none touch-none">
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
        <div className="mt-3 max-h-48 space-y-1 overflow-auto">{marks.map(mark=><div key={mark.id} className="rounded bg-slate-900 p-2 text-xs"><span>{mark.tool} {mark.text}</span><div className="mt-1 flex flex-wrap gap-1"><button onClick={()=>updateNote(tab==="redesign"?{redesignMarks:marks.map(item=>item.id===mark.id?{...item,hidden:!item.hidden}:item)}:{marks:marks.map(item=>item.id===mark.id?{...item,hidden:!item.hidden}:item)})}>{mark.hidden?"Show":"Hide"}</button><button onClick={()=>updateNote(tab==="redesign"?{redesignMarks:marks.map(item=>item.id===mark.id?{...item,x:Math.min(.98,item.x+.01)}:item)}:{marks:marks.map(item=>item.id===mark.id?{...item,x:Math.min(.98,item.x+.01)}:item)})}>Move</button><button onClick={()=>updateNote(tab==="redesign"?{redesignMarks:marks.map(item=>item.id===mark.id?{...item,width:Math.min(1-item.x,item.width+.02),height:Math.min(1-item.y,item.height+.02)}:item)}:{marks:marks.map(item=>item.id===mark.id?{...item,width:Math.min(1-item.x,item.width+.02),height:Math.min(1-item.y,item.height+.02)}:item)})}>Resize</button><button onClick={()=>removeMark(mark.id)} className="text-pink-300">Delete</button></div></div>)}</div>
        <h3 className="mt-4 text-sm font-black">Evidence</h3><dl className="text-xs text-slate-300"><dt>Console</dt><dd>{selected?.consoleStatus}</dd><dt>Network</dt><dd>{selected?.networkStatus}</dd><dt>Controls</dt><dd>{selected?.controlCount}</dd><dt>Status</dt><dd>{selected?.auditStatus}</dd></dl>
        <dl className="mt-3 text-xs text-slate-300"><dt>Full-page status</dt><dd>{selected?.fullPageCaptureStatus??"NOT_STARTED"}</dd><dt>Dimensions</dt><dd>{selected?.fullPageMasterWidth??"-"} × {selected?.fullPageMasterHeight??"-"}</dd><dt>File size</dt><dd>{selected?.fullPageFileBytes?.toString()??"-"} bytes</dd><dt>SHA-256</dt><dd className="break-all">{selected?.fullPageSha256??"-"}</dd></dl>
        {selected?.fullPageMasterPath?<a href={`/api/qa/ui-audit/evidence?path=${encodeURIComponent(selected.fullPageMasterPath)}`} target="_blank" className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-3 font-bold">Open original master</a>:null}
        {selected?<a href={selected.route} target="_blank" className="mt-4 inline-flex min-h-11 items-center rounded-lg border px-3 font-bold">Open actual route</a>:null}
      </aside>
    </div>
  </main>;
}

function Filter({value,set,values,label}:{value:string;set:(value:string)=>void;values:string[];label:string}){return <label className="text-xs text-slate-400">{label}<select value={value} onChange={e=>set(e.target.value)} className="mt-1 min-h-10 w-full rounded bg-slate-900 px-2 text-slate-100"><option>ALL</option>{values.map(item=><option key={item}>{item}</option>)}</select></label>;}
function MarkShape({mark}:{mark:Mark}){const x=`${mark.x*100}%`,y=`${mark.y*100}%`,width=`${mark.width*100}%`,height=`${mark.height*100}%`;if(mark.tool==="text")return <text x={x} y={y} fill={mark.color} fontSize="18" fontWeight="800">{mark.text}</text>;if(mark.tool==="ellipse")return <ellipse cx={`${(mark.x+mark.width/2)*100}%`} cy={`${(mark.y+mark.height/2)*100}%`} rx={`${mark.width*50}%`} ry={`${mark.height*50}%`} fill="none" stroke={mark.color} strokeWidth="3"/>;if(["line","arrow","freehand"].includes(mark.tool))return <line x1={x} y1={y} x2={`${(mark.x+mark.width)*100}%`} y2={`${(mark.y+mark.height)*100}%`} stroke={mark.color} strokeWidth="4"/>;return <rect x={x} y={y} width={width} height={height} fill={mark.tool==="highlight"?`${mark.color}66`:mark.tool==="blur"?`${mark.color}aa`:"none"} stroke={mark.color} strokeWidth="3"/>;}
