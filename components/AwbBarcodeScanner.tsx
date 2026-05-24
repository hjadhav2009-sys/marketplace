"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeAwb, isValidAwb } from "@/lib/awb";
import { SubmitButton } from "./SubmitButton";

type AwbBarcodeScannerProps = {
  action: (formData: FormData) => void | Promise<void>;
  defaultAwb?: string;
};

type BarcodeResult = {
  getText: () => string;
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
      setError("Camera scanner is not supported in this browser. Use manual AWB entry.");
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
          setError("Barcode scanned, but it did not look like a valid AWB. Try again or enter it manually.");
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
        setError("Camera permission was denied. Allow camera access or use manual AWB entry.");
      } else if (caughtError instanceof DOMException && caughtError.name === "NotFoundError") {
        setError("No camera was found on this device. Use manual AWB entry.");
      } else {
        setError("Camera could not start. Use manual AWB entry.");
      }
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-md border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Camera scanner</h2>
            <p className="mt-1 text-sm text-slate-300">Point the frame at the AWB barcode on the shipping label.</p>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
            {cameraState === "scanning" ? "Scanning" : cameraState === "starting" ? "Starting" : "Ready"}
          </span>
        </div>

        {httpsWarning ? (
          <div className="mt-4 rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
            Camera scanner may not work on insecure HTTP. Use HTTPS domain or manual AWB entry.
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
            Scanned AWB {detectedAwb}. Opening order...
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={startScanner}
            disabled={cameraState === "starting" || cameraState === "scanning"}
            className="min-h-12 rounded-md bg-white px-5 py-2 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Start camera
          </button>
          <button
            type="button"
            onClick={stopScanner}
            className="min-h-12 rounded-md border border-slate-600 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
          >
            Stop
          </button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Manual AWB entry</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Manual search is always available if camera scanning fails.</p>
        <form action={action} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">AWB</span>
            <input
              name="awb"
              inputMode="text"
              autoComplete="off"
              defaultValue={defaultAwb}
              placeholder="1490834915493571"
              className="mt-1 min-h-14 w-full rounded-md border border-slate-300 px-3 py-2 text-xl font-semibold uppercase outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              required
            />
          </label>
          <SubmitButton pendingText="Searching...">Find order</SubmitButton>
        </form>
      </section>

      <form ref={hiddenFormRef} action={action} className="hidden">
        <input ref={hiddenAwbRef} type="hidden" name="awb" />
        <input type="hidden" name="source" value="camera" />
      </form>
    </div>
  );
}
