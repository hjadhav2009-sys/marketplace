"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  getInitialDisplayImageState,
  isDisplayableImageSrc,
  isLoadableImageUrl,
  productImageStateText,
  type ProductImageState
} from "@/lib/product-image";
import { markProductImageBrokenAction, markProductImageMappedAction } from "./product-image-actions";

type ProductImageProps = {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  mappingId?: string | null;
  showDebug?: boolean;
  imageHealth?: string | null;
  cacheStatus?: string | null;
  originalImageUrl?: string | null;
};

const sizeClass = {
  sm: "h-16 w-16",
  md: "h-28 w-28",
  lg: "aspect-square w-full"
};

function initialState(src: string | null | undefined, imageHealth: string | null | undefined, cacheStatus: string | null | undefined) {
  return (imageHealth === "BROKEN" || cacheStatus === "BROKEN") && !src ? "broken" : getInitialDisplayImageState(src);
}

export function ProductImage({
  src,
  alt,
  size = "md",
  showBadge = true,
  mappingId,
  showDebug = false,
  imageHealth,
  cacheStatus,
  originalImageUrl
}: ProductImageProps) {
  const [state, setState] = useState<ProductImageState>(initialState(src, imageHealth, cacheStatus));
  const [slowLoading, setSlowLoading] = useState(false);
  const [manualCheck, setManualCheck] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const validSrc = isDisplayableImageSrc(src) ? src : null;
  const isExternalSrc = isLoadableImageUrl(validSrc);
  const hasSource = Boolean(validSrc);
  const stateText = productImageStateText(state, hasSource, slowLoading, cacheStatus);

  useEffect(() => {
    setState(initialState(src, imageHealth, cacheStatus));
    setSlowLoading(false);
    setManualCheck(false);
    if (src && !validSrc && mappingId) {
      void markProductImageBrokenAction(mappingId);
    }
  }, [cacheStatus, imageHealth, mappingId, src, validSrc]);

  useEffect(() => {
    if (!validSrc || state !== "loading" || !isExternalSrc) {
      setSlowLoading(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSlowLoading(true);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [isExternalSrc, retryVersion, state, validSrc]);

  function stopParentNavigation(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function retryImage(event: MouseEvent<HTMLButtonElement>) {
    stopParentNavigation(event);
    setSlowLoading(false);
    setManualCheck(true);
    setState(validSrc ? "loading" : getInitialDisplayImageState(src));
    setRetryVersion((version) => version + 1);
  }

  function openImageUrl(event: MouseEvent<HTMLButtonElement>) {
    stopParentNavigation(event);

    if (originalImageUrl ?? src) {
      window.open(originalImageUrl ?? src ?? "", "_blank", "noopener,noreferrer");
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
      className={`relative flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white ${sizeClass[size]}`}
      title={src ? `${stateText}: ${src}` : stateText}
    >
      {state === "loading" ? <div className="absolute inset-0 animate-pulse bg-slate-100" /> : null}
      {validSrc && state !== "broken" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${validSrc}-${retryVersion}`}
          src={validSrc}
          alt={alt}
          className={`h-full w-full object-contain p-2 transition-opacity ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
          decoding="async"
          loading="lazy"
          onLoad={() => {
            setState("loaded");
            setSlowLoading(false);
            if (isExternalSrc && mappingId && (imageHealth === "BROKEN" || manualCheck)) {
              void markProductImageMappedAction(mappingId);
            }
            setManualCheck(false);
          }}
          onError={() => {
            setState("broken");
            setSlowLoading(false);
            setManualCheck(false);
            if (isExternalSrc && mappingId) {
              void markProductImageBrokenAction(mappingId);
            }
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-black text-slate-400">
            IMG
          </span>
          <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {state === "broken" ? "Image failed" : state === "missing" ? "No image" : stateText}
          </span>
          <span className="mt-1 max-w-36 text-xs text-slate-500">{state === "missing" ? "Use Listing Master or cache today's images" : stateText}</span>
          {showDebug && state === "broken" && validSrc && isExternalSrc ? (
            <button
              type="button"
              onClick={retryImage}
              className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              Check this image
            </button>
          ) : null}
          {showDebug && originalImageUrl ? (
            <button type="button" onClick={openImageUrl} className="mt-2 text-xs font-semibold text-berry underline">
              Open original URL
            </button>
          ) : null}
        </div>
      )}
      {state === "loading" && slowLoading && isExternalSrc ? (
        <div className="absolute inset-x-2 bottom-2 rounded bg-white/90 px-2 py-1 text-center text-xs font-semibold text-slate-700">
          Still loading
        </div>
      ) : null}
      {showBadge ? (
        <span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${badge.className}`}>
          {badge.label}
        </span>
      ) : null}
      {showDebug && state === "broken" && (originalImageUrl ?? src) ? (
        <div className="absolute inset-x-2 bottom-2 rounded bg-white/95 px-2 py-1 text-[10px] font-medium text-slate-600">
          <button type="button" onClick={openImageUrl} className="font-semibold text-berry underline">
            Open original URL
          </button>
          <p className="mt-1 truncate">{originalImageUrl ?? src}</p>
        </div>
      ) : null}
    </div>
  );
}
