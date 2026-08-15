"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buttonStyles } from "@/components/ui/buttonStyles";

export type WorkerOverlayKind = "IMAGE" | "PROCESS_FLOW" | "PARTIAL_QUANTITY" | "PROBLEM" | "DETAILS";
export type WorkerOverlaySurface = "dialog" | "drawer" | "lightbox";

type OverlayDescriptor = { content: ReactNode; id: string; kind: WorkerOverlayKind; surface: WorkerOverlaySurface; title: string };
type WorkerOverlayContextValue = {
  activeId: string | null;
  closeOverlay: (options?: { preserveHistory?: boolean; returnFocus?: boolean }) => void;
  openOverlay: (overlay: OverlayDescriptor) => void;
};

const WorkerOverlayContext = createContext<WorkerOverlayContextValue | null>(null);
const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const HISTORY_KEY = "__marketplaceWorkerOverlay";

export function WorkerOverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<OverlayDescriptor | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const historyOwnedRef = useRef(false);

  const finishClose = useCallback((returnFocus = true) => {
    setOverlay(null);
    historyOwnedRef.current = false;
    if (returnFocus) requestAnimationFrame(() => {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
      else document.querySelector<HTMLElement>("#app-shell-main")?.focus();
    });
  }, []);

  const closeOverlay = useCallback((options?: { preserveHistory?: boolean; returnFocus?: boolean }) => {
    const returnFocus = options?.returnFocus !== false;
    if (!overlay) return;
    if (historyOwnedRef.current && options?.preserveHistory !== true) {
      history.back();
      return;
    }
    if (historyOwnedRef.current) {
      const state = { ...(history.state ?? {}) } as Record<string, unknown>;
      delete state[HISTORY_KEY];
      history.replaceState(state, "", location.href);
    }
    finishClose(returnFocus);
  }, [finishClose, overlay]);

  const openOverlay = useCallback((next: OverlayDescriptor) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.dispatchEvent(new CustomEvent("worker-overlay-open"));
    setOverlay(next);
    if (!historyOwnedRef.current) {
      history.pushState({ ...(history.state ?? {}), [HISTORY_KEY]: next.id }, "", location.href);
      historyOwnedRef.current = true;
    } else {
      history.replaceState({ ...(history.state ?? {}), [HISTORY_KEY]: next.id }, "", location.href);
    }
  }, []);

  useEffect(() => {
    const closeForMobileOverlay = () => {
      if (historyOwnedRef.current) {
        const state = { ...(history.state ?? {}) } as Record<string, unknown>;
        delete state[HISTORY_KEY];
        history.replaceState(state, "", location.href);
      }
      finishClose(false);
    };
    window.addEventListener("mobile-overlay-open", closeForMobileOverlay);
    return () => window.removeEventListener("mobile-overlay-open", closeForMobileOverlay);
  }, [finishClose]);

  useEffect(() => {
    const onPopState = () => { if (overlay) finishClose(true); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [finishClose, overlay]);

  useEffect(() => {
    if (!overlay) return;
    const shell = document.querySelector<HTMLElement>("[data-app-shell-root]");
    const wasInert = shell?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (shell) shell.inert = true;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-worker-overlay-title]")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeOverlay(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (shell) shell.inert = wasInert;
    };
  }, [closeOverlay, overlay]);

  const context = useMemo(() => ({ activeId: overlay?.id ?? null, closeOverlay, openOverlay }), [closeOverlay, openOverlay, overlay?.id]);
  const desktop = overlay?.surface === "drawer"
    ? "md:ml-auto md:h-full md:max-h-none md:max-w-[34rem] md:rounded-none"
    : overlay?.surface === "lightbox"
      ? "md:mx-auto md:max-h-[calc(100dvh-3rem)] md:max-w-4xl md:rounded-xl"
      : "md:mx-auto md:max-h-[calc(100dvh-3rem)] md:max-w-[34rem] md:rounded-xl";

  return <WorkerOverlayContext.Provider value={context}>
    {children}
    {overlay && typeof document !== "undefined" ? createPortal(
      <div
        className={`fixed inset-0 z-[90] flex items-end md:items-center ${overlay.surface === "drawer" ? "md:p-0" : "md:p-6"}`}
        data-worker-overlay={overlay.kind}
      >
        <div className="absolute inset-0 bg-slate-950/55" aria-hidden="true" onPointerDown={(event) => { if (event.currentTarget === event.target) closeOverlay(); }} />
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:p-5 ${desktop}`}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
            <h2 id={titleId} tabIndex={-1} data-worker-overlay-title className="min-w-0 break-words text-xl font-semibold text-slate-950">{overlay.title}</h2>
            <button type="button" aria-label={`Close ${overlay.title}`} onClick={() => closeOverlay()} className={buttonStyles({ variant: "secondary", className: "shrink-0 px-3 text-lg" })}>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round"><path d="M4 4l12 12M16 4 4 16" /></svg>
            </button>
          </div>
          <div className="pt-4">{overlay.content}</div>
        </div>
      </div>, document.body) : null}
  </WorkerOverlayContext.Provider>;
}

export function useWorkerOverlay() {
  const context = useContext(WorkerOverlayContext);
  if (!context) throw new Error("Worker overlays must be rendered inside WorkerOverlayProvider.");
  return context;
}
