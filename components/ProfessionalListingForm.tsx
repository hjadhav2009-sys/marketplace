"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SubmitButton } from "./SubmitButton";
import { Surface } from "./ui/Surface";
import { Field, fieldControlStyles } from "./ui/Field";
import { buttonStyles } from "./ui/buttonStyles";

export type ProfessionalListingValue = {
  id: string;
  sellerSkuId: string;
  productTitle: string | null;
  subCategory: string | null;
  fsn: string | null;
  listingId: string | null;
  listingStatus: string | null;
  mrp: number | null;
  sellingPrice: number | null;
  liveBrand: string | null;
  liveCategory: string | null;
  description: string | null;
  mainImageUrl: string | null;
  updatedAt: Date;
};

export function ProfessionalListingForm({ action, marketplace, listing }: {
  action: (data: FormData) => Promise<void>;
  marketplace: string;
  clientRequestId: string;
  listing: ProfessionalListingValue;
}) {
  const [dirty, setDirty] = useState(false);
  const clientRequestId = `listing-edit:${listing.updatedAt.toISOString()}:${listing.id}`.slice(0, 160);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return <form action={action} onChange={() => setDirty(true)} className="space-y-4">
    <input type="hidden" name="clientRequestId" value={clientRequestId}/><input type="hidden" name="marketplaceListingId" value={listing.id}/><input type="hidden" name="expectedUpdatedAt" value={listing.updatedAt.toISOString()}/>
    <Surface padding="compact"><SectionHeading title="Protected identity" description="Marketplace and seller identity establish account ownership and cannot be changed here."/><div className="mt-4 grid gap-3 sm:grid-cols-2"><ReadValue label="Marketplace" value={marketplace}/><Field id="edit-seller-sku" label="Seller SKU" help="Seller identity cannot be changed after creation.">{(attributes) => <input {...attributes} name="sellerSku" readOnly value={listing.sellerSkuId} className={fieldControlStyles({ className: "read-only:cursor-not-allowed read-only:bg-slate-100" })}/>}</Field></div></Surface>
    <Surface padding="compact"><SectionHeading title="Basic catalog information" description="Keep the title and classification concise enough for warehouse recognition."/><div className="mt-4 grid gap-4 sm:grid-cols-2"><TextField id="edit-title" name="productTitle" label="Title" value={listing.productTitle} maxLength={500}/><TextField id="edit-brand" name="brand" label="Brand" value={listing.liveBrand} maxLength={240}/><TextField id="edit-category" name="category" label="Category" value={listing.liveCategory} maxLength={240}/><TextField id="edit-subcategory" name="subCategory" label="Sub-category" value={listing.subCategory} maxLength={240}/></div></Surface>
    <Surface padding="compact"><SectionHeading title="Marketplace identity and state" description="These values support exact matching. They do not bypass marketplace identity validation."/><div className="mt-4 grid gap-4 sm:grid-cols-2"><TextField id="edit-fsn" name="fsn" label="FSN / ASIN" value={listing.fsn} maxLength={160}/><TextField id="edit-listing-id" name="listingIdentifier" label="Listing ID" value={listing.listingId} maxLength={160}/><TextField id="edit-listing-status" name="listingStatus" label="Listing status" value={listing.listingStatus} maxLength={80}/><div className="flex items-end"><Link href={`/owner/product-inventory/${listing.id}#marketplace-attributes`} className={buttonStyles({ variant: "quiet" })}>Review marketplace attributes</Link></div></div></Surface>
    <Surface padding="compact"><SectionHeading title="Commercial values" description="Prices remain optional and preserve the existing server validation."/><div className="mt-4 grid gap-4 sm:grid-cols-2"><TextField id="edit-mrp" name="mrp" label="MRP" value={listing.mrp} inputMode="decimal"/><TextField id="edit-selling-price" name="sellingPrice" label="Selling price" value={listing.sellingPrice} inputMode="decimal"/></div></Surface>
    <Surface padding="compact"><SectionHeading title="Product presentation" description="Use an HTTPS marketplace image where possible. Description remains plain catalog content."/><div className="mt-4 grid gap-4"><TextField id="edit-image" name="mainImageUrl" label="Main image URL" value={listing.mainImageUrl} maxLength={2048}/><Field id="edit-description" label="Description">{(attributes) => <textarea {...attributes} name="description" defaultValue={listing.description ?? ""} maxLength={12000} rows={6} className={fieldControlStyles({ className: "min-h-32 py-2" })}/>}</Field></div></Surface>
    <Surface padding="compact"><SectionHeading title="Refresh protection" description="When enabled, owner-entered values are protected from automated marketplace refresh."/><label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold"><input type="checkbox" name="manualLocked" defaultChecked/> Protect entered values from automated refresh</label></Surface>
    <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-lg sm:flex-row sm:items-center"><Link href={`/owner/product-inventory/${listing.id}`} onClick={(event) => { if (dirty && !window.confirm("Discard unsaved listing changes?")) event.preventDefault(); }} className={buttonStyles({ variant: "quiet" })}>Cancel</Link><SubmitButton className="w-full sm:w-auto" pendingText="Saving listing...">Save listing</SubmitButton>{dirty ? <p role="status" className="text-sm font-semibold text-amber-800">Unsaved changes</p> : null}</div>
  </form>;
}

function SectionHeading({ title, description }: { title: string; description: string }) { return <div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>; }
function ReadValue({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-slate-200 bg-stone-50 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 break-words font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">Derived from the selected seller account.</p></div>; }
function TextField({ id, name, label, value, maxLength, inputMode }: { id: string; name: string; label: string; value: string | number | null; maxLength?: number; inputMode?: "decimal" }) { return <Field id={id} label={label}>{(attributes) => <input {...attributes} name={name} defaultValue={value ?? ""} maxLength={maxLength} inputMode={inputMode} className={fieldControlStyles()}/>}</Field>; }
