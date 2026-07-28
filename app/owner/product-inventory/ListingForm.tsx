"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

type ListingFormValue = {
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

export function ListingForm({
  action,
  marketplace,
  clientRequestId,
  listing
}: {
  action: (data: FormData) => Promise<void>;
  marketplace: string;
  clientRequestId: string;
  listing?: ListingFormValue;
}) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form action={action} onChange={() => setDirty(true)} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <input type="hidden" name="clientRequestId" value={clientRequestId} />
      {listing ? (
        <>
          <input type="hidden" name="marketplaceListingId" value={listing.id} />
          <input type="hidden" name="expectedUpdatedAt" value={listing.updatedAt.toISOString()} />
        </>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Read label="Marketplace" value={marketplace} />
        <label className="font-semibold text-slate-800">
          Seller SKU
          <input
            name="sellerSku"
            required
            maxLength={160}
            readOnly={Boolean(listing)}
            defaultValue={listing?.sellerSkuId}
            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 read-only:cursor-not-allowed read-only:border-slate-200 read-only:bg-slate-100 read-only:text-slate-600"
          />
          {listing ? <span className="mt-1 block text-xs font-normal text-slate-500">Seller identity cannot be changed after creation.</span> : null}
        </label>
        <Field name="productTitle" label="Title" value={listing?.productTitle} maxLength={500} />
        <Field name="brand" label="Brand" value={listing?.liveBrand} maxLength={240} />
        <Field name="category" label="Category" value={listing?.liveCategory} maxLength={240} />
        <Field name="subCategory" label="Sub-category" value={listing?.subCategory} maxLength={240} />
        <Field name="fsn" label="FSN / ASIN" value={listing?.fsn} maxLength={160} />
        <Field name="listingIdentifier" label="Listing ID" value={listing?.listingId} maxLength={160} />
        <Field name="listingStatus" label="Listing status" value={listing?.listingStatus} maxLength={80} />
        <Field name="mrp" label="MRP" value={listing?.mrp} />
        <Field name="sellingPrice" label="Selling price" value={listing?.sellingPrice} />
        <Field name="mainImageUrl" label="Main image URL" value={listing?.mainImageUrl} maxLength={2048} />
        <label className="font-semibold text-slate-800 sm:col-span-2">
          Description
          <textarea
            name="description"
            defaultValue={listing?.description ?? ""}
            maxLength={12000}
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" name="manualLocked" defaultChecked />
        Protect entered values from automated refresh
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <Link
          href={listing ? `/owner/product-inventory/${listing.id}` : "/owner/product-inventory"}
          onClick={(event) => {
            if (dirty && !window.confirm("Discard unsaved listing changes?")) event.preventDefault();
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </Link>
        <SubmitButton className="w-full sm:w-auto" pendingText="Saving listing...">
          Save Listing
        </SubmitButton>
        {dirty ? <p role="status" className="text-sm text-amber-800">Unsaved changes</p> : null}
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  value,
  maxLength
}: {
  name: string;
  label: string;
  value?: string | number | null;
  maxLength?: number;
}) {
  return (
    <label className="font-semibold text-slate-800">
      {label}
      <input
        name={name}
        defaultValue={value ?? ""}
        maxLength={maxLength}
        className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3"
      />
    </label>
  );
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
      <p className="mt-1 text-xs text-slate-500">Derived from the selected seller account.</p>
    </div>
  );
}
