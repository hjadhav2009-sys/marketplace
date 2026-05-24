"use client";

import { useEffect, useState } from "react";
import { getInitialProductImageState, isLoadableImageUrl } from "@/lib/product-image";
import { markProductImageBrokenAction } from "./product-image-actions";

type ProductImageProps = {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  mappingId?: string | null;
};

const sizeClass = {
  sm: "h-16 w-16",
  md: "h-28 w-28",
  lg: "h-40 w-full sm:h-52"
};

export function ProductImage({ src, alt, size = "md", showBadge = true, mappingId }: ProductImageProps) {
  const [state, setState] = useState<"loading" | "loaded" | "missing" | "broken">(getInitialProductImageState(src));
  const validSrc = isLoadableImageUrl(src) ? src : null;

  useEffect(() => {
    setState(validSrc ? "loading" : "missing");
  }, [validSrc]);

  const badge =
    state === "loaded"
      ? { label: "Image mapped", className: "bg-teal-50 text-teal-700 ring-teal-200" }
      : state === "broken"
        ? { label: "Broken image URL", className: "bg-rose-50 text-rose-700 ring-rose-200" }
        : { label: "Missing image", className: "bg-amber-50 text-amber-800 ring-amber-200" };

  return (
    <div className={`relative flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${sizeClass[size]}`}>
      {state === "loading" ? <div className="absolute inset-0 animate-pulse bg-slate-200" /> : null}
      {validSrc && state !== "broken" ? (
        // Loading directly from the source URL avoids proxying or storing product images.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={validSrc}
          alt={alt}
          className={`h-full w-full object-cover transition-opacity ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          onLoad={() => setState("loaded")}
          onError={() => {
            setState("broken");
            if (mappingId) {
              void markProductImageBrokenAction(mappingId);
            }
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center px-3 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {state === "broken" ? "Check URL" : "No image"}
          </span>
          {state === "broken" ? <span className="mt-1 text-xs text-slate-500">Broken image</span> : null}
        </div>
      )}
      {showBadge ? (
        <span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${badge.className}`}>
          {badge.label}
        </span>
      ) : null}
    </div>
  );
}
