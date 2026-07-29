"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMobileOverlayCoordinator } from "./MobileOverlayCoordinator";

export type AppNavLink = { href: string; label: string; section?: string };
type AppNavProps = { links: AppNavLink[]; accountName?: string; marketplace?: string };

function cleanHref(href: string) {
  return href.split("?")[0];
}

function isActive(pathname: string, href: string) {
  const route = cleanHref(href);
  if (route === "/dashboard") return pathname === "/dashboard" || pathname === "/owner";
  return pathname === route || pathname.startsWith(`${route}/`);
}

function iconPath(label: string) {
  if (/dashboard/i.test(label)) return "M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z";
  if (/scan/i.test(label)) return "M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8";
  if (/problem/i.test(label)) return "M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01";
  if (/account|user/i.test(label)) return "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75";
  if (/report|summary/i.test(label)) return "M4 20V10m6 10V4m6 16v-7m4 7H2";
  if (/system|data management/i.test(label)) return "M12 3c5 0 9 1.34 9 3s-4 3-9 3-9-1.34-9-3 4-3 9-3Zm-9 3v6c0 1.66 4 3 9 3s9-1.34 9-3V6m-18 6v6c0 1.66 4 3 9 3s9-1.34 9-3v-6";
  if (/password/i.test(label)) return "M6 10V8a6 6 0 0 1 12 0v2m-13 0h14v11H5V10Zm7 4v3";
  if (/import/i.test(label)) return "M12 3v12m-5-5 5 5 5-5M4 19h16";
  if (/consignment|pack/i.test(label)) return "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10";
  if (/product|catalog/i.test(label)) return "M4 5h16v14H4V5Zm3 3h10M7 12h6m-6 4h8";
  if (/mark/i.test(label)) return "m3 12 9-9h7v7l-9 9-7-7Zm12-5h.01";
  if (/assembl/i.test(label)) return "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6ZM10 7h4m-7 3v4m10-4v4m-7 3h4";
  if (/pick|work/i.test(label)) return "M9 11V5a2 2 0 0 1 4 0v5-3m3 1V7a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-3 0-5-1-7-4l-3-5a2 2 0 0 1 3-2l4 3";
  return "M4 4h16v16H4V4Zm4 5h8m-8 6h8";
}

function NavIcon({ label }: { label: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPath(label)} />
    </svg>
  );
}

function NavItems({
  links,
  collapsed = false,
  onNavigate
}: {
  links: AppNavLink[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = [...new Set(links.map((link) => link.section ?? "WORKSPACE"))];

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section}>
          {!collapsed ? (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {section}
            </p>
          ) : null}
          <div className="space-y-1">
            {links
              .filter((link) => (link.section ?? "WORKSPACE") === section)
              .map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? link.label : undefined}
                    title={collapsed ? link.label : undefined}
                    className={`flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition ${
                      active
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <NavIcon label={link.label} />
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

export function AppNav({ links, accountName, marketplace }: AppNavProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col ${
        collapsed ? "w-[72px]" : "w-[264px]"
      }`}
      data-desktop-sidebar
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="border-b border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/dashboard" className="min-w-0">
            {collapsed ? (
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-berry font-bold text-white">
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
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={`h-5 w-5 fill-none stroke-current transition ${collapsed ? "rotate-180" : ""}`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
        {!collapsed ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="truncate text-sm font-semibold">{accountName}</p>
            <p className="text-xs font-medium text-slate-500">{marketplace}</p>
          </div>
        ) : null}
      </div>
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
        <NavItems links={links} collapsed={collapsed} />
      </nav>
    </aside>
  );
}

export function MobileDrawer({ links, accountName, marketplace }: AppNavProps) {
  const { activeOverlay, closeOverlay, openOverlay } = useMobileOverlayCoordinator();
  const open = activeOverlay === "navigation";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
        triggerRef.current?.focus();
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
    closeOverlay();
    if (returnFocus) triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation"
        aria-controls="mobile-navigation-dialog"
        aria-expanded={open}
        onClick={() => openOverlay("navigation")}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 lg:hidden"
        data-mobile-drawer-trigger
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" data-mobile-drawer>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => closeDrawer(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative flex h-dvh max-h-dvh w-[min(88vw,340px)] flex-col overflow-hidden bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{accountName}</p>
                <p className="text-xs font-medium text-slate-500">{marketplace}</p>
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Close navigation"
                onClick={() => closeDrawer()}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" aria-label="Mobile navigation">
              <NavItems links={links} onNavigate={() => closeDrawer(false)} />
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
