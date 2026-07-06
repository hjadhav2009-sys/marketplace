"use client";

import { useEffect, useState } from "react";
import { buildListingImageGallery } from "@/lib/product-image";
import { ProductImageGallery } from "./ProductImageGallery";

type DetailOrder = {
  id: string;
  awb: string;
  trackingId?: string | null;
  shipmentId?: string | null;
  orderItemId?: string | null;
  fsn?: string | null;
  sku: string;
  qty: number;
  color?: string | null;
  size?: string | null;
  courier?: string | null;
  orderNo: string;
  productDescription?: string | null;
  pickStatus: string;
  packStatus: string;
};

type DetailListing = {
  sku: string;
  sellerSkuId: string;
  productTitle?: string | null;
  liveTitle?: string | null;
  liveBrand?: string | null;
  liveCategory?: string | null;
  subCategory?: string | null;
  fsn?: string | null;
  listingId?: string | null;
  mrp?: number | null;
  sellingPrice?: number | null;
  livePrice?: number | null;
  liveMrp?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  productHighlights?: string | null;
  description?: string | null;
  allSpecifications?: string | null;
  mainImageUrl?: string | null;
} & Record<string, string | number | null | undefined>;

type DetailMapping = {
  id?: string | null;
  sku: string;
  imageUrl?: string | null;
  cachedImageUrl?: string | null;
  galleryImages?: string[];
  productName?: string | null;
  imageHealth?: string | null;
  cacheStatus?: string | null;
};

type PickerDetail = {
  sku: string;
  totalQuantity: number;
  pickedCount: number;
  pendingCount: number;
  problemCount: number;
  courierCounts: Record<string, number>;
  mapping?: DetailMapping | null;
  listing?: DetailListing | null;
  orders: DetailOrder[];
};

type ProductDetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  detailsUrl: string;
  fallbackTitle: string;
  fallbackSku: string;
  fallbackQuantity: number;
  fallbackColor?: string | null;
  fallbackSize?: string | null;
  primaryImageUrl?: string | null;
  galleryImages: string[];
  mappingId?: string | null;
  imageHealth?: string | null;
  cacheStatus?: string | null;
  originalImageUrl?: string | null;
};

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "Not mapped";
  }

  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function text(value: string | number | null | undefined) {
  return value == null || value === "" ? "Not mapped" : String(value);
}

export function ProductDetailsDrawer({
  open,
  onClose,
  detailsUrl,
  fallbackTitle,
  fallbackSku,
  fallbackQuantity,
  fallbackColor,
  fallbackSize,
  primaryImageUrl,
  galleryImages,
  mappingId,
  imageHealth,
  cacheStatus,
  originalImageUrl
}: ProductDetailsDrawerProps) {
  const [detail, setDetail] = useState<PickerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || detail || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    fetch(detailsUrl, { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Details failed to load.");
        }

        setDetail((await response.json()) as PickerDetail);
      })
      .catch(() => setError("Details failed to load."))
      .finally(() => setLoading(false));
  }, [detail, detailsUrl, loading, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const listing = detail?.listing ?? null;
  const mapping = detail?.mapping ?? null;
  const title = listing?.productTitle ?? listing?.liveTitle ?? mapping?.productName ?? fallbackTitle;
  const drawerGallery = detail
    ? buildListingImageGallery(listing, mapping?.imageUrl ?? mapping?.cachedImageUrl ?? primaryImageUrl)
    : galleryImages;
  const drawerPrimary = mapping?.cachedImageUrl ?? primaryImageUrl ?? drawerGallery[0] ?? null;
  const courierEntries = Object.entries(detail?.courierCounts ?? {});

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/40" role="dialog" aria-modal="true">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-slate-500">Product details</p>
            <h2 className="truncate text-lg font-black text-slate-950">{fallbackSku}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white">
            Close
          </button>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <ProductImageGallery
              primarySrc={drawerPrimary}
              images={drawerGallery}
              alt={title}
              mappingId={mapping?.id ?? mappingId}
              imageHealth={mapping?.imageHealth ?? imageHealth}
              cacheStatus={mapping?.cacheStatus ?? cacheStatus}
              originalImageUrl={mapping?.imageUrl ?? originalImageUrl}
            />
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="break-words text-2xl font-black leading-tight text-slate-950">{fallbackSku}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{title}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md bg-slate-950 p-3 text-white">
                <p className="text-xs font-bold uppercase text-slate-300">Qty</p>
                <p className="text-2xl font-black">{detail?.totalQuantity ?? fallbackQuantity}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Pending</p>
                <p className="text-xl font-black text-slate-950">{detail?.pendingCount ?? "..."}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Picked</p>
                <p className="text-xl font-black text-slate-950">{detail?.pickedCount ?? "..."}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Problem</p>
                <p className="text-xl font-black text-slate-950">{detail?.problemCount ?? "..."}</p>
              </div>
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Color</dt>
                <dd className="mt-1 font-semibold text-slate-950">{text(fallbackColor)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Size</dt>
                <dd className="mt-1 font-semibold text-slate-950">{text(fallbackSize)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">FSN</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{text(listing?.fsn)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Listing ID</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{text(listing?.listingId)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Category</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{text(listing?.liveCategory ?? listing?.subCategory)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Brand</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{text(listing?.liveBrand)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Live price</dt>
                <dd className="mt-1 font-semibold text-slate-950">{money(listing?.livePrice ?? listing?.sellingPrice)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">MRP</dt>
                <dd className="mt-1 font-semibold text-slate-950">{money(listing?.liveMrp ?? listing?.mrp)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Rating</dt>
                <dd className="mt-1 font-semibold text-slate-950">{text(listing?.rating)}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase text-slate-500">Reviews</dt>
                <dd className="mt-1 font-semibold text-slate-950">{text(listing?.reviewCount)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="space-y-4 px-4 pb-6">
          {loading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">Loading details...</div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>
          ) : null}

          {courierEntries.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="font-bold text-slate-950">Courier split</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {courierEntries.map(([courier, count]) => (
                  <span key={courier} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                    {courier}: {count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {listing?.productHighlights || listing?.description || listing?.allSpecifications ? (
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="font-bold text-slate-950">Listing data</h3>
              {listing.productHighlights ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{listing.productHighlights}</p> : null}
              {listing.description ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{listing.description}</p> : null}
              {listing.allSpecifications ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{listing.allSpecifications}</p> : null}
            </div>
          ) : null}

          {detail?.orders.length ? (
            <div className="rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="font-bold text-slate-950">Orders under this SKU</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {detail.orders.map((order) => (
                  <div key={order.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="break-all text-sm font-black text-slate-950">AWB {order.awb}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Qty {order.qty} / {text(order.color)} / {text(order.size)} / {text(order.courier)}
                      </p>
                    </div>
                    <p className="text-xs font-bold uppercase text-slate-500">
                      {order.pickStatus} / {order.packStatus}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
