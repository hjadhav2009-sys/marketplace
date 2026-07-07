"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AppNavLink = {
  href: string;
  label: string;
};

type AppNavProps = {
  links: AppNavLink[];
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/owner";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ links }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav className="mx-auto hidden max-w-7xl flex-wrap gap-2 px-3 pb-2 sm:flex sm:px-6 sm:pb-3" data-desktop-nav>
      {links.map((link) => {
        const active = isActive(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold shadow-sm transition sm:rounded-md ${
              active
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-berry hover:text-berry"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileBottomNav({ links }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur sm:hidden"
      data-mobile-bottom-nav
    >
      {links.map((link) => {
        const active = isActive(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center rounded-md px-2 py-1 text-xs font-black ${
              active ? "bg-slate-950 text-white" : "text-slate-700"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
