"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductImage } from "./ProductImage";

type ProductImageGalleryProps = {
  images: string[];
  primarySrc?: string | null;
  alt: string;
  mappingId?: string | null;
  imageHealth?: string | null;
  cacheStatus?: string | null;
  originalImageUrl?: string | null;
  showBadge?: boolean;
  showInlineThumbnails?: boolean;
};

function uniqueImages(images: Array<string | null | undefined>) {
  return images.reduce<string[]>((result, imageUrl) => {
    const normalized = imageUrl?.trim();

    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }

    return result;
  }, []);
}

export function ProductImageGallery({
  images,
  primarySrc,
  alt,
  mappingId,
  imageHealth,
  cacheStatus,
  originalImageUrl,
  showBadge = false,
  showInlineThumbnails = true
}: ProductImageGalleryProps) {
  const galleryImages = useMemo(() => uniqueImages([primarySrc, ...images]), [images, primarySrc]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = galleryImages[activeIndex] ?? primarySrc ?? null;
  const displayImage = primarySrc ?? galleryImages[0] ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((index) => (index + 1) % Math.max(galleryImages.length, 1));
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((index) => (index - 1 + galleryImages.length) % Math.max(galleryImages.length, 1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryImages.length, open]);

  function openAt(index: number) {
    setActiveIndex(galleryImages.length === 0 ? 0 : Math.max(0, Math.min(index, galleryImages.length - 1)));
    setOpen(true);
  }

  return (
    <>
      <button type="button" onClick={() => openAt(0)} className="block w-full text-left" aria-label="Open product image gallery">
        <ProductImage
          src={displayImage}
          alt={alt}
          size="lg"
          mappingId={mappingId}
          showBadge={showBadge}
          imageHealth={imageHealth}
          cacheStatus={cacheStatus}
          originalImageUrl={originalImageUrl}
        />
      </button>

      {showInlineThumbnails && galleryImages.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-white px-3 py-3">
          {galleryImages.slice(0, 8).map((imageUrl, index) => (
            <button
              key={`${imageUrl}-${index}`}
              type="button"
              onClick={() => openAt(index)}
              className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white"
              aria-label={`Open product image ${index + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={`${alt} thumbnail ${index + 1}`} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/95 p-3 text-white sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full max-w-6xl flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-200">
                {alt} {galleryImages.length > 0 ? `/${activeIndex + 1} of ${galleryImages.length}` : ""}
              </p>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-white px-4 py-2 text-sm font-bold text-slate-950">
                Close
              </button>
            </div>

            <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center rounded-md bg-slate-900">
              {galleryImages.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveIndex((index) => (index - 1 + galleryImages.length) % galleryImages.length)}
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-md bg-white/95 px-3 py-3 text-sm font-bold text-slate-950"
                >
                  Prev
                </button>
              ) : null}
              {activeImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeImage} alt={alt} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="rounded-md bg-white px-6 py-5 text-center text-sm font-semibold text-slate-700">No product image available</div>
              )}
              {galleryImages.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveIndex((index) => (index + 1) % galleryImages.length)}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-md bg-white/95 px-3 py-3 text-sm font-bold text-slate-950"
                >
                  Next
                </button>
              ) : null}
            </div>

            {galleryImages.length > 1 ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {galleryImages.map((imageUrl, index) => (
                  <button
                    key={`${imageUrl}-${index}`}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border ${
                      activeIndex === index ? "border-white" : "border-slate-700"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt={`${alt} thumbnail ${index + 1}`} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
