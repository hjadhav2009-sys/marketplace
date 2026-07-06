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
    <nav className="mx-auto flex max-w-7xl flex-wrap gap-2 px-3 pb-2 sm:px-6 sm:pb-3">
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
