"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeAwb, isValidAwb } from "@/lib/awb";
import { isMarketplaceNativeApp, listenForNativeScanResult, requestNativeScanner } from "@/lib/native-app-bridge";
import { ProductImageGallery } from "./ProductImageGallery";
import { SubmitButton } from "./SubmitButton";

type AwbBarcodeScannerProps = {
  action: (formData: FormData) => void | Promise<void>;
  directPackAction: (formData: FormData) => void | Promise<void>;
  sendAssemblyAction: (formData: FormData) => void | Promise<void>;
  defaultAwb?: string;
};

type BarcodeResult = {
  getText: () => string;
};

type ScannerControls = {
  stop: () => void;
};

type AwbSuggestion = {
  id: string;
  awb: string;
  marketplace?: string | null;
  accountName?: string | null;
  trackingId?: string | null;
  sku: string;
  cachedImageUrl?: string | null;
  cacheStatus?: string | null;
  color?: string | null;
  qty: number;
  courier?: string | null;
  pickStatus: string;
  packStatus: string;
  canPack: boolean;
  assemblyState?: string;
  canOfferManualAssembly?: boolean;
  packBlockedReason?: string;
  listingTitle?: string | null;
  listingId?: string | null;
  listingCategory?: string | null;
  matchType: "EXACT" | "SUFFIX" | "CONTAINS";
  matchedField: "AWB" | "TRACKING_ID";
};

export function maskScanValue(value: string) {
  const normalized = normalizeAwb(value);

  if (normalized.length <= 8) {
    return normalized;
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function shouldAcceptScannerValue(input: { value: string; lastValue: string | null; lastScanAt: number; now: number; debounceMs?: number }) {
  const normalized = normalizeAwb(input.value);

  if (!isValidAwb(normalized)) {
    return false;
  }

  return !(normalized === input.lastValue && input.now - input.lastScanAt < (input.debounceMs ?? 2000));
}

export function playScannerSuccessFeedback() {
  navigator.vibrate?.(80);

  try {
    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.06;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  } catch {
    // Audio feedback is optional. Scanning must keep working if the browser blocks sound.
  }
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function cameraStateLabel(state: "idle" | "starting" | "scanning" | "found" | "opening" | "stopped" | "permission-denied" | "unsupported" | "error") {
  if (state === "starting") {
    return "Camera starting";
  }

  if (state === "scanning") {
    return "Scanning";
  }

  if (state === "found") {
    return "Code found";
  }

  if (state === "opening") {
    return "Opening result";
  }

  if (state === "permission-denied") {
    return "Permission needed";
  }

  if (state === "unsupported") {
    return "Manual only";
  }

  if (state === "error") {
    return "Camera error";
  }

  return state === "stopped" ? "Stopped" : "Ready";
}

export function AwbBarcodeScanner({ action, directPackAction, sendAssemblyAction, defaultAwb }: AwbBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const hiddenFormRef = useRef<HTMLFormElement | null>(null);
  const hiddenAwbRef = useRef<HTMLInputElement | null>(null);
  const manualAwbRef = useRef<HTMLInputElement | null>(null);
  const lastScanAtRef = useRef(0);
  const lastScanValueRef = useRef<string | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "scanning" | "found" | "opening" | "stopped" | "permission-denied" | "unsupported" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [httpsWarning, setHttpsWarning] = useState(false);
  const [detectedAwb, setDetectedAwb] = useState<string | null>(null);
  const [manualAwb, setManualAwb] = useState(defaultAwb ?? "");
  const [suggestions, setSuggestions] = useState<AwbSuggestion[]>([]);
  const [suggestionState, setSuggestionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nativeApp, setNativeApp] = useState(false);

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
    manualAwbRef.current?.focus();

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

  const submitDetectedAwb = useCallback((awb: string) => {
    setDetectedAwb(awb);
    setCameraState("opening");
    stopScanner();

    if (hiddenAwbRef.current && hiddenFormRef.current) {
      hiddenAwbRef.current.value = awb;
      hiddenFormRef.current.requestSubmit();
    }
  }, [stopScanner]);

  useEffect(() => {
    const runningNative = isMarketplaceNativeApp();
    setNativeApp(runningNative);

    if (!runningNative) return;

    return listenForNativeScanResult(({ code }) => {
      const awb = normalizeAwb(code);
      if (!isValidAwb(awb)) {
        setError("The scanned barcode did not look like a valid Tracking ID / AWB. Enter it manually.");
        return;
      }
      setManualAwb(awb);
      submitDetectedAwb(awb);
    });
  }, [submitDetectedAwb]);

  async function startScanner() {
    setError(null);
    setDetectedAwb(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setError("Camera scanner is not supported in this browser. Use manual Tracking ID / AWB entry.");
      setCameraState("unsupported");
      return;
    }

    if (!videoRef.current) {
      return;
    }

    try {
      setCameraState("starting");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const callback = (result: BarcodeResult | undefined) => {
        if (!result) {
          return;
        }

        const now = Date.now();
        const awb = normalizeAwb(result.getText());

        if (!isValidAwb(awb)) {
          setError("Barcode scanned, but it did not look like a valid Tracking ID / AWB. Try again or enter it manually.");
          lastScanAtRef.current = now;
          return;
        }

        if (!shouldAcceptScannerValue({ value: awb, lastValue: lastScanValueRef.current, lastScanAt: lastScanAtRef.current, now })) {
          return;
        }

        lastScanAtRef.current = now;
        lastScanValueRef.current = awb;
        setCameraState("found");
        playScannerSuccessFeedback();
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
        setCameraState("permission-denied");
        setError("Camera permission was denied. Allow camera access or use manual Tracking ID / AWB entry.");
      } else if (caughtError instanceof DOMException && caughtError.name === "NotFoundError") {
        setError("No camera was found on this device. Use manual Tracking ID / AWB entry.");
      } else {
        setError("Camera could not start. Use manual Tracking ID / AWB entry.");
      }
    }
  }

  return (
    <div className="space-y-4" data-packing-mobile-flow>
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:hidden" data-mobile-manual-search>
        <h2 className="text-lg font-black text-slate-950">Manual Tracking ID / AWB</h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">Type or paste the barcode value. This is the fastest warehouse fallback.</p>
        <form action={action} className="mt-4 space-y-3">
          <label className="block">
            <span className="sr-only">Tracking ID / AWB</span>
            <input
              name="awb"
              inputMode="text"
              autoComplete="off"
              defaultValue={manualAwb}
              placeholder="FMPC0000000000"
              className="min-h-14 w-full rounded-md border border-slate-300 px-4 py-3 text-xl font-black uppercase outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              required
            />
          </label>
          <SubmitButton pendingText="Searching..." className="min-h-12 w-full text-base">
            Find order
          </SubmitButton>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      {nativeApp ? (
        <section className="rounded-md border border-pink-200 bg-pink-50 p-4 shadow-sm" data-native-scanner-launcher>
          <h2 className="text-lg font-black text-slate-950">Native label scanner</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">Uses the Android camera and returns the code directly to this packing search.</p>
          <button type="button" onClick={() => requestNativeScanner()} className="mt-4 min-h-12 w-full rounded-md bg-berry px-5 py-3 text-base font-bold text-white">
            Scan with Android camera
          </button>
        </section>
      ) : null}
      <details open={!nativeApp} className="rounded-md border border-slate-200 bg-slate-950 p-4 text-white shadow-sm sm:p-5" data-mobile-scanner-panel>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 lg:cursor-default">
          <span>
            <span className="block text-lg font-black lg:text-xl">Camera scanner</span>
            <span className="mt-1 block text-sm leading-5 text-slate-300 lg:text-base">Optional scanner. Manual search stays ready above.</span>
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
            {cameraStateLabel(cameraState)}
          </span>
        </summary>
        <div className="flex items-start justify-between gap-3">
          <div className="hidden lg:block">
            <h2 className="text-xl font-bold sm:text-lg">Camera scanner</h2>
            <p className="mt-1 text-base leading-6 text-slate-300 sm:text-sm">Point the frame at the Tracking ID / AWB barcode on the shipping label.</p>
          </div>
          <span className="hidden rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 lg:inline-flex">
            {cameraStateLabel(cameraState)}
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

        <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-md border border-slate-700 bg-slate-900 lg:aspect-video">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-64 max-w-[78%] rounded-md border-2 border-white shadow-[0_0_0_999px_rgba(2,6,23,0.45)]">
              <div className="mx-auto mt-1 h-0.5 w-28 bg-berry" />
            </div>
          </div>
        </div>

        {detectedAwb ? (
          <p className="mt-3 rounded-md bg-teal-400/10 px-3 py-2 text-sm font-semibold text-teal-100">
            Scanned {maskScanValue(detectedAwb)}. Opening result...
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
      </details>

      <section className="hidden rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:block">
        <h2 className="text-xl font-bold text-slate-950 sm:text-lg sm:font-semibold">Manual Tracking ID / AWB entry</h2>
        <p className="mt-1 text-base leading-6 text-slate-600 sm:text-sm">Manual search is always available if camera scanning fails.</p>
        <form action={action} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-base font-semibold text-slate-700 sm:text-sm sm:font-medium">Tracking ID / AWB</span>
            <input
              ref={manualAwbRef}
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
          <SubmitButton pendingText="Searching..." className="w-full">
            Find order
          </SubmitButton>
        </form>

        <div className="mt-4 min-h-20">
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
                <p className="text-base font-medium text-teal-700 sm:text-sm">One match found. Use Pack now only after checking the SKU and image.</p>
              ) : (
                <p className="text-base font-medium text-slate-600 sm:text-sm">{suggestions.length} matches found. Choose the correct Tracking ID / AWB.</p>
              )}
              <div className="max-h-[34rem] space-y-2 overflow-y-auto">
                {suggestions.map((suggestion) => {
                  const displayId = suggestion.trackingId ?? suggestion.awb;
                  const detailsHref = `/packing/${encodeURIComponent(suggestion.awb)}`;

                  return (
                    <article
                      key={suggestion.awb}
                      className="grid grid-cols-[4.5rem_1fr] gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[4.5rem_1fr_auto]"
                    >
                      <ProductImageGallery
                        primarySrc={suggestion.cachedImageUrl}
                        images={suggestion.cachedImageUrl ? [suggestion.cachedImageUrl] : []}
                        alt={`${suggestion.sku} ${displayId}`}
                        size="sm"
                        showBadge={false}
                        showInlineThumbnails={false}
                        cacheStatus={suggestion.cacheStatus}
                      />
                      <div className="min-w-0">
                        <p className="break-all text-lg font-black text-slate-950 sm:text-sm sm:font-bold">{displayId}</p>
                        <p className="mt-1 text-base font-semibold text-slate-800 sm:text-sm sm:font-normal sm:text-slate-600">{suggestion.sku}</p>
                        {suggestion.listingTitle ? (
                          <p className="mt-1 line-clamp-1 text-sm font-medium text-slate-700">
                            {suggestion.listingTitle}
                            {suggestion.listingCategory ? ` / ${suggestion.listingCategory}` : ""}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm font-medium text-slate-600">
                          Qty {suggestion.qty} / {suggestion.color ?? "Color unknown"} / {suggestion.courier ?? "Courier pending"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{suggestion.marketplace ?? "Marketplace"}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{suggestion.accountName ?? "Account"}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{suggestion.packStatus}</span>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                            {suggestion.matchedField} {suggestion.matchType}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2 grid gap-2 sm:col-span-1 sm:w-28">
                        {suggestion.canPack ? <form action={directPackAction}>
                          <input type="hidden" name="orderId" value={suggestion.id} />
                          <input type="hidden" name="returnQuery" value={normalizeAwb(manualAwb)} />
                          <SubmitButton pendingText="Packing..." className="w-full min-h-10 px-3 py-2 text-sm">
                            Pack now
                          </SubmitButton>
                        </form> : <p className="rounded-md bg-amber-50 p-2 text-xs font-bold text-amber-900">{suggestion.packBlockedReason ?? "Not ready to pack"}</p>}
                        {suggestion.pickStatus === "PICKED" && suggestion.canOfferManualAssembly ? (
                          <details className="rounded-md border p-2 text-xs">
                            <summary className="cursor-pointer font-bold">Send to Assembly</summary>
                            <form action={sendAssemblyAction} className="mt-2 grid gap-2">
                              <input type="hidden" name="orderId" value={suggestion.id}/><input type="hidden" name="returnPath" value="/packing"/><input type="hidden" name="clientRequestId" value={`packing-search:${suggestion.id}`}/>
                              <input name="manualTitle" maxLength={160} placeholder="Assembly title (optional)" className="min-h-10 rounded-md border px-2"/>
                              <textarea name="manualInstructions" maxLength={2000} placeholder="Instructions required when no process rule exists" className="min-h-20 rounded-md border p-2"/>
                              <input name="manualImageUrl" maxLength={2048} placeholder="Optional image URL" className="min-h-10 rounded-md border px-2"/>
                              <SubmitButton pendingText="Sending..." variant="secondary">Send</SubmitButton>
                            </form>
                          </details>
                        ) : null}
                        <Link href={detailsHref} prefetch className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
                          Details
                        </Link>
                        <Link href={`${detailsHref}#problem`} prefetch className="inline-flex min-h-10 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                          Problem
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <form ref={hiddenFormRef} action={action} className="hidden">
        <input ref={hiddenAwbRef} type="hidden" name="awb" />
        <input type="hidden" name="source" value="camera" />
      </form>
      </div>
    </div>
  );
}
