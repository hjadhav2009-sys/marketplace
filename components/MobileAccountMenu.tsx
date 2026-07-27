"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type MobileAccountMenuProps = {
  role: string;
  name: string;
  logoutAction: () => Promise<void>;
};

export function MobileAccountMenu({ role, name, logoutAction }: MobileAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-800 shadow-sm"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-current">
          <path d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 2c-4.35 0-7.5 2.24-7.5 5.32 0 .65.53 1.18 1.18 1.18h12.64c.65 0 1.18-.53 1.18-1.18C19.5 16.24 16.35 14 12 14Z"/>
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(16rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
          <p title={`${role} / ${name}`} className="break-words rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-800">
            {role} / {name}
          </p>
          <Link role="menuitem" href="/accounts" prefetch className="mt-2 flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-slate-800 hover:bg-slate-100">
            Switch account
          </Link>
          <form action={logoutAction}>
            <button role="menuitem" className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-rose-700 hover:bg-rose-50">
              Logout
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
