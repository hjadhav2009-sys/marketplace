"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import {
  resolveCurrentNavigationId,
  type AppNavLink,
  type NavigationIcon,
} from "./appNavigation";
import { useMobileOverlayCoordinator } from "./MobileOverlayCoordinator";

export type { AppNavLink } from "./appNavigation";

type AppNavProps = {
  links: AppNavLink[];
  companyName?: string;
  accountName?: string;
  accountCode?: string;
  marketplace?: string;
};

const iconPaths: Record<NavigationIcon, string> = {
  overview: "M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z",
  scan: "M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8",
  problem: "M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  insights: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  system: "M12 3c5 0 9 1.34 9 3s-4 3-9 3-9-1.34-9-3 4-3 9-3Zm-9 3v6c0 1.66 4 3 9 3s9-1.34 9-3V6m-18 6v6c0 1.66 4 3 9 3s9-1.34 9-3v-6",
  password: "M6 10V8a6 6 0 0 1 12 0v2m-13 0h14v11H5V10Zm7 4v3",
  import: "M12 3v12m-5-5 5 5 5-5M4 19h16",
  pack: "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10",
  catalog: "M4 5h16v14H4V5Zm3 3h10M7 12h6m-6 4h8",
  mark: "m3 12 9-9h7v7l-9 9-7-7Zm12-5h.01",
  assemble: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6ZM10 7h4m-7 3v4m10-4v4m-7 3h4",
  pick: "M9 11V5a2 2 0 0 1 4 0v5-3m3 1V7a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-3 0-5-1-7-4l-3-5a2 2 0 0 1 3-2l4 3",
  work: "M4 5h16M4 12h16M4 19h10",
};

function NavIcon({ icon }: { icon: NavigationIcon }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[icon]} />
    </svg>
  );
}

function NavItems({
  links,
  collapsed = false,
  idPrefix,
  onNavigate
}: {
  links: AppNavLink[];
  collapsed?: boolean;
  idPrefix: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const currentId = resolveCurrentNavigationId(pathname, links);
  const sections = [...new Set(links.map((link) => link.section))];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section} aria-labelledby={`${idPrefix}-navigation-section-${section.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}>
          <h2
            id={`${idPrefix}-navigation-section-${section.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}
            className={collapsed ? "sr-only" : "mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"}
          >
            {section}
          </h2>
          <div className="space-y-1">
            {links
              .filter((link) => link.section === section)
              .map((link) => {
                const active = currentId === link.id;
                return (
                  <Link
                    key={link.id}
                    href={link.href}
                    prefetch
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? link.label : undefined}
                    title={collapsed ? link.label : undefined}
                    data-navigation-id={link.id}
                    className={`flex min-h-11 min-w-11 items-center rounded-md border px-3 text-sm font-semibold ${
                      active
                        ? "border-rose-200 bg-rose-50 text-berry"
                        : "border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <NavIcon icon={link.icon} />
                    </span>
                    {!collapsed ? <span className="ml-3 truncate">{link.label}</span> : null}
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AppNav({ links, companyName, accountName, accountCode, marketplace }: AppNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  const identityTitle = [companyName, accountName, marketplace, accountCode].filter(Boolean).join(" / ");

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white xl:flex xl:flex-col ${
        collapsed ? "w-[72px]" : "w-[264px]"
      }`}
      data-desktop-sidebar
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="border-b border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/dashboard" title="Marketplace Pick & Pack" className="flex min-h-11 min-w-0 flex-col justify-center">
            {collapsed ? (
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-berry font-bold text-white">
                MP
              </span>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-berry">Marketplace</p>
                <p className="truncate text-base font-bold">Pick & Pack</p>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={`h-5 w-5 fill-none stroke-current ${collapsed ? "rotate-180" : ""}`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
        {!collapsed ? (
          <div className="mt-3 min-w-0 border-t border-slate-200 pt-3" title={identityTitle}>
            {companyName ? <p className="truncate text-xs font-semibold text-slate-600">{companyName}</p> : null}
            <p className="truncate text-sm font-semibold text-slate-950">{accountName}</p>
            <p className="truncate text-xs font-medium text-slate-600">
              {[marketplace, accountCode].filter(Boolean).join(" / ")}
            </p>
          </div>
        ) : null}
      </div>
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
        <NavItems links={links} collapsed={collapsed} idPrefix="desktop" />
      </nav>
    </aside>
  );
}

export function MobileDrawer({ links, companyName, accountName, accountCode, marketplace }: AppNavProps) {
  const { activeOverlay, closeOverlay, openOverlay } = useMobileOverlayCoordinator();
  const open = activeOverlay === "navigation";
  const [portalReady, setPortalReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const restoreFocusRef = useRef(true);
  const identityTitle = [companyName, accountName, marketplace, accountCode].filter(Boolean).join(" / ");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const frame = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (restoreFocusRef.current) {
        const frame = requestAnimationFrame(() => triggerRef.current?.focus());
        restoreFocusRef.current = true;
        return () => cancelAnimationFrame(frame);
      }
      restoreFocusRef.current = true;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        restoreFocusRef.current = true;
        closeOverlay();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeOverlay, open]);

  const closeDrawer = (returnFocus = true) => {
    restoreFocusRef.current = returnFocus;
    closeOverlay();
  };

  const drawer = portalReady && open ? createPortal(
    <div className="fixed inset-0 z-50 xl:hidden" data-mobile-drawer>
      <button
        type="button"
        aria-label="Close navigation"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => closeDrawer()}
        className="absolute inset-0 bg-slate-950/45"
        data-mobile-drawer-backdrop
      />
      <aside
        ref={drawerRef}
        id="mobile-navigation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="relative flex h-dvh max-h-dvh w-[min(88vw,352px)] flex-col overflow-hidden bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b p-4">
          <div className="min-w-0" title={identityTitle}>
            {companyName ? <p className="truncate text-xs font-semibold text-slate-600">{companyName}</p> : null}
            <p className="truncate font-semibold text-slate-950">{accountName}</p>
            <p className="truncate text-xs font-medium text-slate-600">
              {[marketplace, accountCode].filter(Boolean).join(" / ")}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close navigation"
            onClick={() => closeDrawer()}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" aria-label="Mobile navigation">
          <NavItems links={links} idPrefix="mobile" onNavigate={() => closeDrawer(false)} />
        </nav>
      </aside>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation"
        aria-controls="mobile-navigation-dialog"
        aria-expanded={open}
        onClick={() => {
          restoreFocusRef.current = true;
          openOverlay("navigation");
        }}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 xl:hidden"
        data-mobile-drawer-trigger
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {drawer}
    </>
  );
}
