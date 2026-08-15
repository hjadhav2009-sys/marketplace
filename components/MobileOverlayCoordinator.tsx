"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

type MobileOverlay = "navigation" | "account" | null;

type MobileOverlayContextValue = {
  activeOverlay: MobileOverlay;
  closeOverlay: () => void;
  openOverlay: (overlay: Exclude<MobileOverlay, null>) => void;
  toggleOverlay: (overlay: Exclude<MobileOverlay, null>) => void;
};

const MobileOverlayContext = createContext<MobileOverlayContextValue | null>(null);

export function MobileOverlayCoordinator({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeOverlay, setActiveOverlay] = useState<MobileOverlay>(null);
  const closeOverlay = useCallback(() => setActiveOverlay(null), []);
  const openOverlay = useCallback((overlay: Exclude<MobileOverlay, null>) => {
    window.dispatchEvent(new CustomEvent("mobile-overlay-open"));
    setActiveOverlay(overlay);
  }, []);
  const toggleOverlay = useCallback(
    (overlay: Exclude<MobileOverlay, null>) => {
      setActiveOverlay((current) => {
        if (current !== overlay) window.dispatchEvent(new CustomEvent("mobile-overlay-open"));
        return current === overlay ? null : overlay;
      });
    },
    []
  );

  useEffect(() => {
    const closeForWorkerOverlay = () => setActiveOverlay(null);
    window.addEventListener("worker-overlay-open", closeForWorkerOverlay);
    return () => window.removeEventListener("worker-overlay-open", closeForWorkerOverlay);
  }, []);

  useEffect(() => {
    setActiveOverlay(null);
  }, [pathname]);

  useEffect(() => {
    const closeOnHistoryNavigation = () => setActiveOverlay(null);
    window.addEventListener("popstate", closeOnHistoryNavigation);
    return () => window.removeEventListener("popstate", closeOnHistoryNavigation);
  }, []);

  useEffect(() => {
    if (activeOverlay !== "navigation") return;
    const shellBackground = document.querySelector<HTMLElement>("[data-app-shell-background]");
    const previousOverflow = document.body.style.overflow;
    const wasInert = shellBackground?.inert ?? false;
    document.body.style.overflow = "hidden";
    if (shellBackground) shellBackground.inert = true;
    return () => {
      document.body.style.overflow = previousOverflow;
      if (shellBackground) shellBackground.inert = wasInert;
    };
  }, [activeOverlay]);

  const value = useMemo(
    () => ({ activeOverlay, closeOverlay, openOverlay, toggleOverlay }),
    [activeOverlay, closeOverlay, openOverlay, toggleOverlay]
  );

  return <MobileOverlayContext.Provider value={value}>{children}</MobileOverlayContext.Provider>;
}

export function useMobileOverlayCoordinator() {
  const context = useContext(MobileOverlayContext);
  if (!context) {
    throw new Error("Mobile overlay controls must be rendered inside MobileOverlayCoordinator.");
  }
  return context;
}
