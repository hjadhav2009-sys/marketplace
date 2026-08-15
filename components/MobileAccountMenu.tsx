"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useMobileOverlayCoordinator } from "./MobileOverlayCoordinator";

const menuKeys = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

export function nextMenuIndex(currentIndex: number, itemCount: number, key: string) {
  if (!itemCount || !menuKeys.has(key)) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowUp") return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1;
  return currentIndex < 0 || currentIndex >= itemCount - 1 ? 0 : currentIndex + 1;
}

type MobileAccountMenuProps = {
  role: string;
  name: string;
  companyName?: string;
  accountName?: string;
  marketplace?: string;
  accountCode?: string;
  logoutAction: () => Promise<void>;
};

export function MobileAccountMenu({
  role,
  name,
  companyName,
  accountName,
  marketplace,
  accountCode,
  logoutAction
}: MobileAccountMenuProps) {
  const { activeOverlay, closeOverlay, toggleOverlay } = useMobileOverlayCoordinator();
  const open = activeOverlay === "account";
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const menuItems = () =>
    [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
      (item) => !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true"
    );

  const closeMenu = (returnFocus = false) => {
    closeOverlay();
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => menuItems()[0]?.focus());
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeOverlay();
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, [closeOverlay, open]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    toggleOverlay("account");
    const requestedKey = event.key === "ArrowUp" || event.key === "End" ? "End" : "Home";
    requestAnimationFrame(() => {
      const items = menuItems();
      const nextIndex = nextMenuIndex(-1, items.length, requestedKey);
      if (nextIndex !== null) items[nextIndex]?.focus();
    });
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!menuKeys.has(event.key)) return;
    const items = menuItems();
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = nextMenuIndex(currentIndex, items.length, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${open ? "Close" : "Open"} account menu for ${name}`}
        title={`${name} (${role})`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => toggleOverlay("account")}
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-slate-800 hover:bg-slate-50 sm:px-3"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-current">
          <path d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 2c-4.35 0-7.5 2.24-7.5 5.32 0 .65.53 1.18 1.18 1.18h12.64c.65 0 1.18-.53 1.18-1.18C19.5 16.24 16.35 14 12 14Z"/>
        </svg>
        <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">{name}</span>
        <svg aria-hidden viewBox="0 0 20 20" className="hidden h-4 w-4 fill-none stroke-current sm:block" strokeWidth="1.8">
          <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-2xl"
        >
          <div role="none" className="rounded-md bg-slate-100 px-3 py-3 text-slate-800">
            <p className="break-words text-sm font-semibold">{companyName ?? "Marketplace Pick & Pack"}</p>
            {accountName ? <p className="mt-1 break-words text-sm">{accountName}</p> : null}
            {marketplace || accountCode ? (
              <p className="mt-1 break-words text-xs font-medium text-slate-600">
                {[marketplace, accountCode].filter(Boolean).join(" / ")}
              </p>
            ) : null}
            <p title={`${role} / ${name}`} className="mt-2 break-words border-t border-slate-200 pt-2 text-xs font-medium text-slate-600">
              Signed in as {name} ({role})
            </p>
          </div>
          <Link role="menuitem" tabIndex={-1} href="/accounts" prefetch onClick={() => closeMenu()} className="mt-2 flex min-h-11 min-w-11 items-center rounded-md px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100">
            Switch account
          </Link>
          <Link role="menuitem" tabIndex={-1} href="/change-password" prefetch onClick={() => closeMenu()} className="flex min-h-11 min-w-11 items-center rounded-md px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100">
            Password
          </Link>
          <form action={logoutAction} role="none">
            <button role="menuitem" tabIndex={-1} className="flex min-h-11 min-w-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50">
              Logout
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
