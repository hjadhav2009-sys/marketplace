"use client";

import { useMemo, useState } from "react";
import type { DynamicListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { SubmitButton } from "./SubmitButton";

type Props={action:(formData:FormData)=>Promise<void>;issueId:string;issueVersion:number;clientRequestId:string;marketplace:string;sellerSku:string;knownIdentifiers:Array<{type:string;value:string}>;profiles:Array<{id:string;name:string;schema:DynamicListingFormSchema|null}>;contextFields?:Record<string,string>};

export function DynamicMarketplaceListingForm({action,issueId,issueVersion,clientRequestId,marketplace,sellerSku,knownIdentifiers,profiles,contextFields={}}:Props){
 const [profileId,setProfileId]=useState(profiles[0]?.id??"");
 const [advancedSearch,setAdvancedSearch]=useState("");
 const selectedProfile=profiles.find(profile=>profile.id===profileId);
 const dynamic=useMemo(()=>(selectedProfile?.schema?.fields??[]).filter(field=>field.dynamicAttributeTarget).slice(0,250),[selectedProfile]);
 const searchQuery=advancedSearch.normalize("NFKC").trim().toLowerCase();
 const visibleKeys=new Set(dynamic.filter(field=>!searchQuery||`${field.label} ${field.technicalKey}`.toLowerCase().includes(searchQuery)).map(field=>field.technicalKey));
 return <form action={action} className="space-y-5 overflow-hidden">
  <input type="hidden" name="issueId" value={issueId}/><input type="hidden" name="expectedIssueVersion" value={issueVersion}/><input type="hidden" name="clientRequestId" value={clientRequestId}/>
  {Object.entries(contextFields).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
  <section className="rounded-md border bg-white p-4"><h2 className="text-lg font-black">Product identity</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><ReadOnly label="Marketplace" value={marketplace}/><ReadOnly label="Protected Seller SKU" value={sellerSku}/>{knownIdentifiers.map(item=><ReadOnly key={`${item.type}:${item.value}`} label={item.type} value={item.value}/>)}</div></section>
  {profiles.length?<section className="rounded-md border bg-white p-4"><label className="block text-sm font-bold">Marketplace template<select name="profileId" value={profileId} onChange={event=>setProfileId(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border px-3"><option value="">Common fields only</option>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><p className="mt-2 text-xs text-slate-600">Only the selected profile is shown. Advanced fields are collapsed and searchable.</p></section>:null}
  <FieldSection title="Basic information"><Input name="productTitle" label="Title" maxLength={500}/><Input name="brand" label="Brand" maxLength={240}/><Input name="category" label="Category" maxLength={240}/><Input name="subCategory" label="Sub-category" maxLength={240}/></FieldSection>
  <FieldSection title="Images"><label className="block sm:col-span-2"><span className="text-sm font-bold">Image URLs (one per line, maximum 10)</span><textarea name="images" rows={5} className="mt-1 w-full rounded-md border px-3 py-2" placeholder="https://..."/></label></FieldSection>
  <FieldSection title="Pricing"><Input name="mrp" label="MRP" inputMode="decimal"/><Input name="sellingPrice" label="Selling price" inputMode="decimal"/></FieldSection>
  <FieldSection title="Description"><TextArea name="productHighlights" label="Product highlights"/><TextArea name="description" label="Description"/><TextArea name="specifications" label="Specifications"/></FieldSection>
  {selectedProfile?<details className="rounded-md border bg-white p-4"><summary className="cursor-pointer text-lg font-black">Advanced fields ({dynamic.length})</summary><label className="mt-4 block"><span className="text-sm font-bold">Search advanced fields</span><input type="search" value={advancedSearch} onChange={event=>setAdvancedSearch(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border px-3" placeholder="Field label or technical key"/></label><div className="mt-4 grid gap-3 sm:grid-cols-2">{dynamic.map(field=><div key={field.technicalKey} hidden={!visibleKeys.has(field.technicalKey)}><Input name={`attribute:${field.technicalKey}`} label={field.label} maxLength={field.maxLength}/></div>)}</div>{visibleKeys.size===0?<p className="mt-3 text-sm text-slate-600">No fields match this search.</p>:null}</details>:null}
  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-white p-3 text-sm font-bold"><input type="checkbox" name="manualLocked" defaultChecked/> Protect entered values from automated refresh</label>
  <div className="sticky bottom-2 flex flex-wrap gap-2 rounded-md border bg-white p-3 shadow-lg"><SubmitButton pendingText="Saving and releasing work...">Save and Resolve This Work</SubmitButton><button name="resolutionAction" value="CREATE_MINIMAL" className="min-h-11 rounded-md border px-4 font-bold">Create Minimal Listing</button></div>
 </form>;
}
function ReadOnly({label,value}:{label:string;value:string}){return <div className="min-w-0 rounded-md bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 break-all font-bold">{value}</p></div>}
function FieldSection({title,children}:{title:string;children:React.ReactNode}){return <section className="rounded-md border bg-white p-4"><h2 className="text-lg font-black">{title}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div></section>}
function Input({name,label,maxLength=500,inputMode}:{name:string;label:string;maxLength?:number;inputMode?:"decimal"}){return <label className="block min-w-0"><span className="text-sm font-bold">{label}</span><input name={name} maxLength={maxLength} inputMode={inputMode} className="mt-1 min-h-11 w-full min-w-0 rounded-md border px-3"/></label>}
function TextArea({name,label}:{name:string;label:string}){return <label className="block sm:col-span-2"><span className="text-sm font-bold">{label}</span><textarea name={name} rows={4} maxLength={12000} className="mt-1 w-full rounded-md border px-3 py-2"/></label>}
