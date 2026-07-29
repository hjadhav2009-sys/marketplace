"use client";

import { useState } from "react";
import { ProductImage } from "./ProductImage";

export function WorkImageGallery({
  images,
  alt,
  priority = false,
  compact = false
}: {
  images: Array<string | null | undefined>;
  alt: string;
  priority?: boolean;
  compact?: boolean;
}) {
  const available = [...new Set(images.filter((value): value is string => Boolean(value)))];
  const [index, setIndex] = useState(0);
  const current = available[index] ?? null;
  const move = (offset: number) => {
    setIndex((value) => (value + offset + Math.max(available.length, 1)) % Math.max(available.length, 1));
  };

  return (
    <div
      role="region"
      aria-label={`${alt} image gallery`}
      tabIndex={available.length > 1 ? 0 : undefined}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}
      className={compact
        ? "relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-28 sm:w-28"
        : `relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 ${available.length ? "aspect-square" : "aspect-[4/3]"}`
      }
      data-work-gallery
      data-image-count={available.length}
    >
      <ProductImage
        src={current}
        alt={`${alt}${available.length > 1 ? ` image ${index + 1} of ${available.length}` : ""}`}
        size={compact ? "work" : "lg"}
        showBadge={false}
        priority={priority}
      />
      {available.length > 1 ? (
        <>
          <button
            type="button"
            aria-label={`Previous image. Showing ${index + 1} of ${available.length}`}
            onClick={() => move(-1)}
            className="absolute left-2 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-800 shadow-sm"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={`Next image. Showing ${index + 1} of ${available.length}`}
            onClick={() => move(1)}
            className="absolute right-2 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-800 shadow-sm"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <span
            aria-live="polite"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white"
          >
            Image {index + 1} of {available.length}
          </span>
        </>
      ) : null}
    </div>
  );
}
