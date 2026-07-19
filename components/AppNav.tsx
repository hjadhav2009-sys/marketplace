"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type AppNavLink = { href: string; label: string; section?: string };
type AppNavProps = { links: AppNavLink[]; accountName?: string; marketplace?: string };

function cleanHref(href: string) { return href.split("?")[0]; }
function isActive(pathname: string, href: string) {
  const route = cleanHref(href);
  if (route === "/dashboard") return pathname === "/dashboard" || pathname === "/owner";
  return pathname === route || pathname.startsWith(`${route}/`);
}

function NavItems({ links, collapsed = false, onNavigate }: { links: AppNavLink[]; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = [...new Set(links.map(link => link.section ?? "WORKSPACE"))];
  return <div className="space-y-5">{sections.map(section => <section key={section}>
    {!collapsed ? <p className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{section}</p> : null}
    <div className="space-y-1">{links.filter(link => (link.section ?? "WORKSPACE") === section).map(link => {
      const active = isActive(pathname, link.href);
      return <Link key={link.href} href={link.href} prefetch onClick={onNavigate} aria-current={active ? "page" : undefined} title={collapsed ? link.label : undefined} className={`flex min-h-11 items-center rounded-xl px-3 text-sm font-bold transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"}`}>
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-current/10 text-xs">{link.label.slice(0, 1)}</span>
        {!collapsed ? <span className="ml-3 truncate">{link.label}</span> : null}
      </Link>;
    })}</div>
  </section>)}</div>;
}

export function AppNav({ links, accountName, marketplace }: AppNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  return <aside className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col ${collapsed ? "w-[72px]" : "w-[264px]"}`} data-desktop-sidebar data-collapsed={collapsed ? "true" : "false"}>
    <div className="border-b border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><Link href="/dashboard" className="min-w-0">{collapsed ? <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-berry font-black text-white">MP</span> : <><p className="text-xs font-black uppercase tracking-wide text-berry">Marketplace</p><p className="truncate text-base font-black">Pick & Pack</p></>}</Link><button type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="min-h-11 min-w-11 rounded-xl border text-lg font-black">{collapsed ? "›" : "‹"}</button></div>{!collapsed ? <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="truncate text-sm font-black">{accountName}</p><p className="text-xs font-semibold text-slate-500">{marketplace}</p></div> : null}</div>
    <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation"><NavItems links={links} collapsed={collapsed}/></nav>
  </aside>;
}

export function MobileDrawer({ links, accountName, marketplace }: AppNavProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  return <><button type="button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border bg-white text-xl font-black lg:hidden" data-mobile-drawer-trigger>☰</button>
    {open ? <div className="fixed inset-0 z-50 lg:hidden" data-mobile-drawer><button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"/><aside role="dialog" aria-modal="true" aria-label="Navigation" className="relative flex h-full w-[min(88vw,340px)] flex-col bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><div className="min-w-0"><p className="truncate font-black">{accountName}</p><p className="text-xs font-semibold text-slate-500">{marketplace}</p></div><button type="button" autoFocus aria-label="Close navigation" onClick={() => setOpen(false)} className="min-h-11 min-w-11 rounded-xl border text-xl">×</button></div><nav className="flex-1 overflow-y-auto p-4"><NavItems links={links} onNavigate={() => setOpen(false)}/></nav></aside></div> : null}
  </>;
}

export function MobileBottomNav({ links }: AppNavProps) {
  const pathname = usePathname();
  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden" data-mobile-bottom-nav>{links.slice(0, 4).map(link => { const active = isActive(pathname, link.href); return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center justify-center rounded-xl px-2 text-xs font-black ${active ? "bg-slate-950 text-white" : "text-slate-700"}`}>{link.label}</Link>; })}</nav>;
}
