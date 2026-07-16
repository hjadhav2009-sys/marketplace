"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { PickerSkuGroup } from "@/lib/operations/picking";
import { markSkuGroupProblemInlineAction } from "@/app/picker/[sku]/actions";
import { ProductDetailsDrawer } from "./ProductDetailsDrawer";
import { ProductImageGallery } from "./ProductImageGallery";

type PickerProductCardProps = {
  group: PickerSkuGroup;
  encodedColor: string;
  encodedSize: string;
  detailsUrl: string;
  activeFilter: string;
  compactMode: boolean;
};

type LocalState = {
  pickedCount: number;
  pendingCount: number;
  problemCount: number;
  status: string;
  hidden: boolean;
};

const statusTone: Record<string, string> = {
  READY: "bg-blue-50 text-blue-700 ring-blue-200",
  PICKED: "bg-teal-50 text-teal-700 ring-teal-200",
  PROBLEM: "bg-amber-50 text-amber-800 ring-amber-200"
};

function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function PickerProductCard({ group, encodedColor, encodedSize, detailsUrl, compactMode }: PickerProductCardProps) {
  const [local, setLocal] = useState<LocalState>({
    pickedCount: group.pickedCount,
    pendingCount: group.pendingCount,
    problemCount: group.problemCount,
    status: group.status,
    hidden: false
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemError, setProblemError] = useState<string | null>(null);
  const [isSavingProblem, startProblemTransition] = useTransition();
  const imageStatus =
    group.missingImage ? "No image" : group.mapping?.cacheStatus === "CACHED" ? "Cached image" : "Listing image";
  const productTitle = group.productName ?? (group.mapping?.imageUrl ? "Mapped image, no product name" : "Product name not mapped");
  const imageAlt = group.productName ?? group.sku;

  if (local.hidden) {
    return null;
  }

  function formData() {
    const data = new FormData();
    data.set("sku", group.sku);
    data.set("color", encodedColor);
    data.set("size", encodedSize);
    return data;
  }

  function markPicked() {
    window.location.assign(`/picker/${encodeURIComponent(group.sku)}?color=${encodeURIComponent(encodedColor)}&size=${encodeURIComponent(encodedSize)}`);
  }

  function saveProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = formData();
    const problemForm = new FormData(event.currentTarget);
    data.set("reason", String(problemForm.get("reason") ?? ""));
    data.set("details", String(problemForm.get("details") ?? ""));
    setProblemError(null);

    startProblemTransition(async () => {
      const result = await markSkuGroupProblemInlineAction(data);

      if (!result.ok) {
        setProblemError(result.error ?? "Problem could not be saved.");
        return;
      }

      setLocal((current) => ({
        ...current,
        pickedCount: 0,
        pendingCount: 0,
        problemCount: group.orderCount,
        status: "PROBLEM",
        hidden: activeFilter === "pending"
      }));
      setProblemOpen(false);
    });
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      {compactMode ? null : (
        <div className="relative border-b border-slate-100 bg-slate-50">
          <ProductImageGallery
            primarySrc={group.imageUrl}
            images={group.mapping?.galleryImages ?? []}
            alt={imageAlt}
            mappingId={group.mapping?.id}
            showBadge={false}
            showInlineThumbnails={false}
            imageHealth={group.mapping?.imageHealth}
            cacheStatus={group.mapping?.cacheStatus}
            originalImageUrl={group.mapping?.imageUrl}
          />
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusTone[local.status] ?? statusTone.READY}`}>
            {statusLabel(local.status)}
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
            {imageStatus}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          {compactMode ? (
            <div className="mb-2 flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusTone[local.status] ?? statusTone.READY}`}>
                {statusLabel(local.status)}
              </span>
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">{imageStatus}</span>
            </div>
          ) : null}
          <h2 className="break-words text-xl font-black leading-tight text-slate-950">{group.sku}</h2>
          <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{productTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {group.color ?? group.mapping?.color ?? "Color unknown"}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {group.size ?? group.mapping?.size ?? "Size unknown"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-md bg-slate-950 px-3 py-2 text-white">
            <p className="text-[10px] font-bold uppercase text-slate-300">Qty</p>
            <p className="text-xl font-black">{group.totalQuantity}</p>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">Pending</p>
            <p className="text-lg font-black text-slate-950">{local.pendingCount}</p>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">Picked</p>
            <p className="text-lg font-black text-slate-950">{local.pickedCount}</p>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">Problem</p>
            <p className="text-lg font-black text-slate-950">{local.problemCount}</p>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-3" data-card-actions="3" data-mobile-worker-actions>
          <button
            type="button"
            onClick={markPicked}
            disabled={local.pendingCount === 0 || local.status === "PROBLEM"}
            className="col-span-2 min-h-12 rounded-md bg-berry px-3 py-2 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 sm:col-span-1"
          >
            Picked
          </button>
          <button
            type="button"
            onClick={() => setProblemOpen(true)}
            disabled={local.status === "PROBLEM"}
            className="min-h-12 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            Problem
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="min-h-12 rounded-md bg-slate-950 px-3 py-2 text-sm font-black text-white shadow-sm"
          >
            Details
          </button>
        </div>
      </div>

      {problemOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true">
          <form onSubmit={saveProblem} className="w-full max-w-md rounded-md bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-950">Mark problem</h3>
                <p className="mt-1 text-sm text-slate-600">{group.sku}</p>
              </div>
              <button type="button" onClick={() => setProblemOpen(false)} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                Close
              </button>
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-bold text-slate-700">Reason</span>
              <input
                name="reason"
                required
                placeholder="Stock missing, wrong color..."
                className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-bold text-slate-700">Details</span>
              <textarea
                name="details"
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            {problemError ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{problemError}</p> : null}
            <button type="submit" disabled={isSavingProblem} className="mt-4 min-h-12 w-full rounded-md bg-slate-950 px-4 py-3 text-base font-black text-white disabled:bg-slate-300">
              {isSavingProblem ? "Saving..." : "Save problem"}
            </button>
          </form>
        </div>
      ) : null}

      <ProductDetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        detailsUrl={detailsUrl}
        fallbackTitle={productTitle}
        fallbackSku={group.sku}
        fallbackQuantity={group.totalQuantity}
        fallbackColor={group.color ?? group.mapping?.color}
        fallbackSize={group.size ?? group.mapping?.size}
        primaryImageUrl={group.imageUrl}
        galleryImages={group.mapping?.galleryImages ?? []}
        mappingId={group.mapping?.id}
        imageHealth={group.mapping?.imageHealth}
        cacheStatus={group.mapping?.cacheStatus}
        originalImageUrl={group.mapping?.imageUrl}
      />
    </article>
  );
}
