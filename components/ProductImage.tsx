"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { getInitialProductImageState, isLoadableImageUrl, productImageStateText, type ProductImageState } from "@/lib/product-image";
import { markProductImageBrokenAction, markProductImageMappedAction } from "./product-image-actions";

type ProductImageProps = {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  mappingId?: string | null;
  showDebug?: boolean;
  imageHealth?: string | null;
};

const sizeClass = {
  sm: "h-16 w-16",
  md: "h-28 w-28",
  lg: "h-40 w-full sm:h-52"
};

function initialState(src: string | null | undefined, imageHealth: string | null | undefined) {
  return imageHealth === "BROKEN" && src ? "broken" : getInitialProductImageState(src);
}

export function ProductImage({ src, alt, size = "md", showBadge = true, mappingId, showDebug = false, imageHealth }: ProductImageProps) {
  const [state, setState] = useState<ProductImageState>(initialState(src, imageHealth));
  const [slowLoading, setSlowLoading] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const validSrc = isLoadableImageUrl(src) ? src : null;
  const hasSource = Boolean(validSrc);
  const stateText = productImageStateText(state, hasSource, slowLoading);

  useEffect(() => {
    setState(initialState(src, imageHealth));
    setSlowLoading(false);
    if (src && !validSrc && mappingId) {
      void markProductImageBrokenAction(mappingId);
    }
  }, [imageHealth, mappingId, src, validSrc]);

  useEffect(() => {
    if (!validSrc || state !== "loading") {
      setSlowLoading(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSlowLoading(true);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [retryVersion, state, validSrc]);

  function stopParentNavigation(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function retryImage(event: MouseEvent<HTMLButtonElement>) {
    stopParentNavigation(event);
    setSlowLoading(false);
    setState(validSrc ? "loading" : getInitialProductImageState(src));
    setRetryVersion((version) => version + 1);
  }

  function openImageUrl(event: MouseEvent<HTMLButtonElement>) {
    stopParentNavigation(event);

    if (src) {
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }

  const badge =
    state === "loaded"
      ? { label: "Image mapped", className: "bg-teal-50 text-teal-700 ring-teal-200" }
      : state === "broken"
        ? { label: showDebug ? stateText : "Image issue", className: "bg-rose-50 text-rose-700 ring-rose-200" }
        : { label: stateText, className: "bg-amber-50 text-amber-800 ring-amber-200" };

  return (
    <div
      className={`relative flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${sizeClass[size]}`}
      title={src ? `${stateText}: ${src}` : stateText}
    >
      {state === "loading" ? <div className="absolute inset-0 animate-pulse bg-slate-200" /> : null}
      {validSrc && state !== "broken" ? (
        // Loading directly from the source URL avoids proxying or storing product images.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${validSrc}-${retryVersion}`}
          src={validSrc}
          alt={alt}
          className={`h-full w-full object-cover transition-opacity ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          onLoad={() => {
            setState("loaded");
            setSlowLoading(false);
            if (mappingId) {
              void markProductImageMappedAction(mappingId);
            }
          }}
          onError={() => {
            setState("broken");
            setSlowLoading(false);
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
          <span className="mt-1 text-xs text-slate-500">{stateText}</span>
          {state === "broken" && validSrc ? (
            <button
              type="button"
              onClick={retryImage}
              className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              Retry image
            </button>
          ) : null}
        </div>
      )}
      {state === "loading" && slowLoading ? (
        <div className="absolute inset-x-2 bottom-2 rounded bg-white/90 px-2 py-1 text-center text-xs font-semibold text-amber-800">
          Still loading image
        </div>
      ) : null}
      {showBadge ? (
        <span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${badge.className}`}>
          {badge.label}
        </span>
      ) : null}
      {showDebug && state === "broken" && src ? (
        <div className="absolute inset-x-2 bottom-2 rounded bg-white/95 px-2 py-1 text-[10px] font-medium text-slate-600">
          <button type="button" onClick={openImageUrl} className="font-semibold text-berry underline">
            Open image URL
          </button>
          <p className="mt-1 truncate">{src}</p>
        </div>
      ) : null}
    </div>
  );
}
