"use client";

import { useState } from "react";

export type DetailField={label:string;value:string|number|null|undefined;href?:string|null;sensitive?:boolean};
export type DetailSection={title:string;fields:DetailField[];description?:string};

export function StructuredDetails({sections}:{sections:DetailSection[]}){
 const [showEmpty,setShowEmpty]=useState(false);
 return <div><label className="mb-4 flex min-h-11 items-center gap-3 rounded-xl border bg-white px-4 text-sm font-black"><input type="checkbox" checked={showEmpty} onChange={event=>setShowEmpty(event.target.checked)}/>Show empty fields</label><div className="space-y-4">{sections.map(section=>{const fields=showEmpty?section.fields:section.fields.filter(field=>field.value!==null&&field.value!==undefined&&String(field.value).trim()!=="");if(!fields.length&&!showEmpty)return null;return <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-details-section={section.title}><h2 className="text-lg font-black">{section.title}</h2>{section.description?<p className="mt-1 text-sm text-slate-600">{section.description}</p>:null}<dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map(field=><div key={field.label} className={`min-w-0 rounded-xl p-3 ${field.sensitive?"border border-amber-200 bg-amber-50":"bg-slate-50"}`}><dt className="text-xs font-black uppercase tracking-wide text-slate-500">{field.label}</dt><dd className="mt-1 break-words text-sm font-semibold">{field.href&&field.value?<a href={field.href} target="_blank" rel="noreferrer" className="text-berry underline">{String(field.value)}</a>:field.value===null||field.value===undefined||String(field.value).trim()===""?<span className="font-medium text-slate-400">Not provided</span>:String(field.value)}</dd></div>)}</dl></section>})}</div></div>;
}
