"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { DynamicListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { SubmitButton } from "./SubmitButton";
import { Surface } from "./ui/Surface";
import { Field, fieldControlStyles } from "./ui/Field";
import { buttonStyles } from "./ui/buttonStyles";

export const ADVANCED_PAGE_SIZE = 40;
export const MAX_PROFILE_FIELDS = 1000;
export const MAX_NONBLANK_DYNAMIC_ATTRIBUTES = 250;

type Props = {
  action: (formData: FormData) => Promise<void>;
  issueId: string;
  issueVersion: number;
  clientRequestId: string;
  marketplace: string;
  sellerSku: string;
  knownIdentifiers: Array<{ type: string; value: string }>;
  profiles: Array<{ id: string; name: string; schema: DynamicListingFormSchema | null }>;
  contextFields?: Record<string, string>;
  showMinimalAction?: boolean;
};

export function BoundedMarketplaceListingForm({ action, issueId, issueVersion, clientRequestId, marketplace, sellerSku, knownIdentifiers, profiles, contextFields = {}, showMinimalAction = true }: Props) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [advancedSearch, setAdvancedSearch] = useState("");
  const [advancedPage, setAdvancedPage] = useState(1);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const selectedFields = useMemo(() => selectedProfile?.schema?.fields ?? [], [selectedProfile]);
  const profileTooLarge = selectedFields.length > MAX_PROFILE_FIELDS;
  const dynamic = useMemo(() => profileTooLarge ? [] : selectedFields.filter((field) => field.dynamicAttributeTarget), [profileTooLarge, selectedFields]);
  const filtered = useMemo(() => {
    const query = advancedSearch.normalize("NFKC").trim().toLowerCase();
    return dynamic.filter((field) => !query || `${field.label} ${field.technicalKey}`.toLowerCase().includes(query));
  }, [advancedSearch, dynamic]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / ADVANCED_PAGE_SIZE));
  const page = Math.min(advancedPage, pageCount);
  const visible = filtered.slice((page - 1) * ADVANCED_PAGE_SIZE, page * ADVANCED_PAGE_SIZE);
  const visibleKeys = new Set(visible.map((field) => field.technicalKey));
  const nonblankAttributeCount = Object.values(attributeValues).filter((value) => value.trim()).length;
  const attributeLimitExceeded = nonblankAttributeCount > MAX_NONBLANK_DYNAMIC_ATTRIBUTES;
  useEffect(() => { setAdvancedPage(1); }, [advancedSearch, profileId]);

  return <form action={action} className="space-y-4 overflow-hidden">
    <input type="hidden" name="issueId" value={issueId}/><input type="hidden" name="expectedIssueVersion" value={issueVersion}/><input type="hidden" name="clientRequestId" value={clientRequestId}/><input type="hidden" name="expectedProfileTechnicalFingerprint" value={selectedProfile?.schema?.technicalHeaderFingerprint ?? ""}/>
    {Object.entries(contextFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
    {Object.entries(attributeValues).filter(([key, value]) => value.trim() && !visibleKeys.has(key)).map(([key, value]) => <input key={key} type="hidden" name={`attribute:${key}`} value={value}/>)}
    <Surface padding="compact"><Heading title="Protected product identity" description="These values come from the retained work row and selected seller account."/><div className="mt-4 grid gap-3 sm:grid-cols-2"><ReadOnly label="Marketplace" value={marketplace}/><ReadOnly label="Seller SKU" value={sellerSku}/>{knownIdentifiers.map((item) => <ReadOnly key={`${item.type}:${item.value}`} label={item.type} value={item.value}/>)}</div></Surface>
    {profiles.length ? <Surface padding="compact"><Field id="catalog-profile" label="Marketplace template" help="Every validated field in this account/global profile can be searched; at most 40 render at once.">{(attributes) => <select {...attributes} name="profileId" value={profileId} onChange={(event) => { setProfileId(event.target.value); setAttributeValues({}); }} className={fieldControlStyles()}><option value="">Common fields only</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>}</Field></Surface> : null}
    <FormSection title="Basic information"><TextInput id="full-title" name="productTitle" label="Title" maxLength={500}/><TextInput id="full-brand" name="brand" label="Brand" maxLength={240}/><TextInput id="full-category" name="category" label="Category" maxLength={240}/><TextInput id="full-subcategory" name="subCategory" label="Sub-category" maxLength={240}/></FormSection>
    <FormSection title="Pricing"><TextInput id="full-mrp" name="mrp" label="MRP" inputMode="decimal"/><TextInput id="full-selling-price" name="sellingPrice" label="Selling price" inputMode="decimal"/></FormSection>
    <Surface padding="compact"><Heading title="Images and description" description="Image URLs are stored as catalog references; no remote file is fetched by this form."/><div className="mt-4 grid gap-4"><Field id="full-images" label="Image URLs" help="One per line, maximum 10.">{(attributes) => <textarea {...attributes} name="images" rows={5} className={fieldControlStyles({ className: "min-h-28 py-2" })}/>}</Field><TextArea id="full-highlights" name="productHighlights" label="Product highlights"/><TextArea id="full-description" name="description" label="Description"/><TextArea id="full-specifications" name="specifications" label="Specifications"/></div></Surface>
    {selectedProfile ? <Surface padding="compact">{profileTooLarge ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">This marketplace template exceeds the supported {MAX_PROFILE_FIELDS.toLocaleString()}-field safety maximum. Choose another template.</p> : <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-slate-950">Advanced marketplace attributes ({dynamic.length})</summary><div className="mt-4"><Field id="advanced-search" label="Search advanced attributes" help={`Search covers all ${dynamic.length.toLocaleString()} advanced fields. At most ${ADVANCED_PAGE_SIZE} controls are rendered at once.`}>{(attributes) => <input {...attributes} type="search" value={advancedSearch} onChange={(event) => setAdvancedSearch(event.target.value)} className={fieldControlStyles()} placeholder="Field label or technical key"/>}</Field>{visible.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2">{visible.map((field) => <Field key={field.technicalKey} id={`attribute-${field.technicalKey}`} label={field.label} help={field.technicalKey}>{(attributes) => <input {...attributes} name={`attribute:${field.technicalKey}`} value={attributeValues[field.technicalKey] ?? ""} onChange={(event) => setAttributeValues((current) => ({ ...current, [field.technicalKey]: event.target.value }))} maxLength={field.maxLength} className={fieldControlStyles()}/>}</Field>)}</div> : <p className="mt-4 rounded-md border border-dashed p-4 text-sm text-slate-600">No advanced attributes match this search.</p>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-600">Showing {filtered.length ? (page - 1) * ADVANCED_PAGE_SIZE + 1 : 0}-{Math.min(page * ADVANCED_PAGE_SIZE, filtered.length)} of {filtered.length}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setAdvancedPage((current) => Math.max(1, current - 1))} className={buttonStyles({ variant: "secondary" })}>Previous</button><button type="button" disabled={page >= pageCount} onClick={() => setAdvancedPage((current) => Math.min(pageCount, current + 1))} className={buttonStyles({ variant: "secondary" })}>Next</button></div></div></div></details>}</Surface> : null}
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm font-semibold"><input type="checkbox" name="manualLocked" defaultChecked/> Protect entered values from automated refresh</label>
    <div className="sticky bottom-3 z-10 rounded-md border border-slate-200 bg-white p-3 shadow-lg">{attributeLimitExceeded ? <p role="alert" className="mb-3 text-sm font-semibold text-rose-800">You entered {nonblankAttributeCount} advanced values. Keep at most {MAX_NONBLANK_DYNAMIC_ATTRIBUTES} nonblank values before creating the listing.</p> : null}<div className="flex flex-wrap gap-2"><SubmitButton disabled={profileTooLarge || attributeLimitExceeded} pendingText="Saving and releasing work...">Create full listing</SubmitButton>{showMinimalAction ? <button name="resolutionAction" value="CREATE_MINIMAL" className={buttonStyles({ variant: "secondary" })}>Create minimal listing</button> : null}</div></div>
  </form>;
}

function Heading({ title, description }: { title: string; description: string }) { return <div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-md border border-slate-200 bg-stone-50 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 break-all font-semibold text-slate-900">{value || "Not provided"}</p></div>; }
function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <Surface padding="compact"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div></Surface>; }
function TextInput({ id, name, label, maxLength = 500, inputMode }: { id: string; name: string; label: string; maxLength?: number; inputMode?: "decimal" }) { return <Field id={id} label={label}>{(attributes) => <input {...attributes} name={name} maxLength={maxLength} inputMode={inputMode} className={fieldControlStyles()}/>}</Field>; }
function TextArea({ id, name, label }: { id: string; name: string; label: string }) { return <Field id={id} label={label}>{(attributes) => <textarea {...attributes} name={name} rows={4} maxLength={12000} className={fieldControlStyles({ className: "min-h-24 py-2" })}/>}</Field>; }
