"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeAwb, isValidAwb } from "@/lib/awb";
import { ProductImage } from "./ProductImage";
import { SubmitButton } from "./SubmitButton";

type AwbBarcodeScannerProps = {
  action: (formData: FormData) => void | Promise<void>;
  defaultAwb?: string;
};

type BarcodeResult = {
  getText: () => string;
};

type AwbSuggestion = {
  awb: string;
  trackingId?: string | null;
  sku: string;
  cachedImageUrl?: string | null;
  cacheStatus?: string | null;
  color?: string | null;
  qty: number;
  courier?: string | null;
  packStatus: string;
  matchType: "EXACT" | "SUFFIX" | "CONTAINS";
  matchedField: "AWB" | "TRACKING_ID";
};

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function AwbBarcodeScanner({ action, defaultAwb }: AwbBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const hiddenFormRef = useRef<HTMLFormElement | null>(null);
  const hiddenAwbRef = useRef<HTMLInputElement | null>(null);
  const lastScanAtRef = useRef(0);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "scanning" | "stopped" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [httpsWarning, setHttpsWarning] = useState(false);
  const [detectedAwb, setDetectedAwb] = useState<string | null>(null);
  const [manualAwb, setManualAwb] = useState(defaultAwb ?? "");
  const [suggestions, setSuggestions] = useState<AwbSuggestion[]>([]);
  const [suggestionState, setSuggestionState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const stopVideoTracks = useCallback(() => {
    const stream = videoRef.current?.srcObject;

    if (stream instanceof MediaStream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    stopVideoTracks();
    setCameraState((state) => (state === "scanning" || state === "starting" ? "stopped" : state));
  }, [stopVideoTracks]);

  useEffect(() => {
    setHttpsWarning(window.location.protocol !== "https:" && !isLocalhost(window.location.hostname));

    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      stopVideoTracks();
    };
  }, [stopVideoTracks]);

  useEffect(() => {
    const query = normalizeAwb(manualAwb);

    if (query.length < 5) {
      setSuggestions([]);
      setSuggestionState("idle");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSuggestionState("loading");
      fetch(`/packing/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json"
        }
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Search failed");
          }

          return response.json() as Promise<{ results?: AwbSuggestion[] }>;
        })
        .then((payload) => {
          setSuggestions(payload.results ?? []);
          setSuggestionState("ready");
        })
        .catch((caughtError) => {
          if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
            return;
          }

          setSuggestionState("error");
          setSuggestions([]);
        });
    }, 150);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [manualAwb]);

  function submitDetectedAwb(awb: string) {
    setDetectedAwb(awb);
    stopScanner();

    if (hiddenAwbRef.current && hiddenFormRef.current) {
      hiddenAwbRef.current.value = awb;
      hiddenFormRef.current.requestSubmit();
    }
  }

  async function startScanner() {
    setError(null);
    setDetectedAwb(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setError("Camera scanner is not supported in this browser. Use manual Tracking ID / AWB entry.");
      return;
    }

    if (!videoRef.current) {
      return;
    }

    try {
      setCameraState("starting");
      const reader = new BrowserMultiFormatReader();
      const callback = (result: BarcodeResult | undefined) => {
        if (!result) {
          return;
        }

        const now = Date.now();

        if (now - lastScanAtRef.current < 2000) {
          return;
        }

        const awb = normalizeAwb(result.getText());

        if (!isValidAwb(awb)) {
          setError("Barcode scanned, but it did not look like a valid Tracking ID / AWB. Try again or enter it manually.");
          lastScanAtRef.current = now;
          return;
        }

        lastScanAtRef.current = now;
        navigator.vibrate?.(80);
        submitDetectedAwb(awb);
      };

      controlsRef.current = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        videoRef.current,
        callback
      );
      setCameraState("scanning");
    } catch (caughtError) {
      stopVideoTracks();
      setCameraState("error");

      if (caughtError instanceof DOMException && caughtError.name === "NotAllowedError") {
        setError("Camera permission was denied. Allow camera access or use manual Tracking ID / AWB entry.");
      } else if (caughtError instanceof DOMException && caughtError.name === "NotFoundError") {
        setError("No camera was found on this device. Use manual Tracking ID / AWB entry.");
      } else {
        setError("Camera could not start. Use manual Tracking ID / AWB entry.");
      }
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-md border border-slate-200 bg-slate-950 p-4 text-white shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-lg">Camera scanner</h2>
            <p className="mt-1 text-base leading-6 text-slate-300 sm:text-sm">Point the frame at the Tracking ID / AWB barcode on the shipping label.</p>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
            {cameraState === "scanning" ? "Scanning" : cameraState === "starting" ? "Starting" : "Ready"}
          </span>
        </div>

        {httpsWarning ? (
          <div className="mt-4 rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
            Camera scanner may not work on insecure HTTP. Use HTTPS domain or manual Tracking ID / AWB entry.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md border border-rose-300/40 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-md border border-slate-700 bg-slate-900 sm:aspect-video">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-64 max-w-[78%] rounded-md border-2 border-white shadow-[0_0_0_999px_rgba(2,6,23,0.45)]">
              <div className="mx-auto mt-1 h-0.5 w-28 bg-berry" />
            </div>
          </div>
        </div>

        {detectedAwb ? (
          <p className="mt-3 rounded-md bg-teal-400/10 px-3 py-2 text-sm font-semibold text-teal-100">
            Scanned {detectedAwb}. Opening order...
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={startScanner}
            disabled={cameraState === "starting" || cameraState === "scanning"}
            className="min-h-14 rounded-md bg-white px-5 py-3 text-base font-bold text-slate-950 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-12 sm:text-sm"
          >
            Start camera
          </button>
          <button
            type="button"
            onClick={stopScanner}
            className="min-h-14 rounded-md border border-slate-600 px-5 py-3 text-base font-semibold text-slate-100 transition hover:bg-slate-800 sm:min-h-12 sm:text-sm"
          >
            Stop
          </button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950 sm:text-lg sm:font-semibold">Manual Tracking ID / AWB entry</h2>
        <p className="mt-1 text-base leading-6 text-slate-600 sm:text-sm">Manual search is always available if camera scanning fails.</p>
        <form action={action} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-base font-semibold text-slate-700 sm:text-sm sm:font-medium">Tracking ID / AWB</span>
            <input
              name="awb"
              inputMode="text"
              autoComplete="off"
              value={manualAwb}
              onChange={(event) => setManualAwb(event.target.value)}
              placeholder="FMPC0000000000"
              className="mt-2 min-h-16 w-full rounded-md border border-slate-300 px-4 py-3 text-2xl font-black uppercase outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100 sm:min-h-14 sm:text-xl"
              required
            />
          </label>
          <div className="min-h-20">
            {normalizeAwb(manualAwb).length > 0 && normalizeAwb(manualAwb).length < 5 ? (
              <p className="text-base text-slate-500 sm:text-sm">Type at least last 5 Tracking ID / AWB characters for live suggestions.</p>
            ) : null}
            {suggestionState === "loading" ? (
              <p className="text-base font-medium text-slate-500 sm:text-sm">Searching...</p>
            ) : null}
            {suggestionState === "error" ? (
              <p className="text-base font-medium text-rose-700 sm:text-sm">Live suggestions failed. Manual submit still works.</p>
            ) : null}
            {suggestionState === "ready" && suggestions.length === 0 ? (
              <p className="text-base font-medium text-amber-800 sm:text-sm">No matching Tracking ID / AWB found for this account.</p>
            ) : null}
            {suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.length === 1 ? (
                  <p className="text-base font-medium text-teal-700 sm:text-sm">One match found. Open it or submit the search.</p>
                ) : (
                  <p className="text-base font-medium text-slate-600 sm:text-sm">{suggestions.length} matches found. Choose the correct Tracking ID / AWB.</p>
                )}
                <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {suggestions.map((suggestion) => {
                    const displayId = suggestion.trackingId ?? suggestion.awb;

                    return (
                      <a
                        key={suggestion.awb}
                        href={`/packing/${encodeURIComponent(suggestion.awb)}`}
                        className="grid grid-cols-[4rem_1fr] gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm transition hover:border-berry hover:bg-slate-50 sm:grid-cols-[auto_1fr_auto]"
                      >
                        <ProductImage
                          src={suggestion.cachedImageUrl}
                          alt={`${suggestion.sku} ${displayId}`}
                          size="sm"
                          showBadge={false}
                          cacheStatus={suggestion.cacheStatus}
                        />
                        <span className="min-w-0">
                          <span className="block break-all text-lg font-black text-slate-950 sm:text-sm sm:font-bold">{displayId}</span>
                          <span className="mt-1 block text-base font-semibold text-slate-800 sm:text-sm sm:font-normal sm:text-slate-600">
                            {suggestion.sku}
                          </span>
                          <span className="mt-1 block text-sm font-medium text-slate-600">
                            Qty {suggestion.qty} / {suggestion.color ?? "Color unknown"} / {suggestion.courier ?? "Courier pending"}
                          </span>
                          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                            {suggestion.packStatus}
                          </span>
                        </span>
                        <span className="col-span-2 justify-self-start rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 sm:col-span-1 sm:self-center sm:justify-self-auto">
                          {suggestion.matchedField} {suggestion.matchType}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <SubmitButton pendingText="Searching..." className="w-full">
            Find order
          </SubmitButton>
        </form>
      </section>

      <form ref={hiddenFormRef} action={action} className="hidden">
        <input ref={hiddenAwbRef} type="hidden" name="awb" />
        <input type="hidden" name="source" value="camera" />
      </form>
    </div>
  );
}
