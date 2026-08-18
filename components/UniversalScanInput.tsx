"use client";

import { useEffect, useRef } from "react";

export function UniversalScanInput({ initialValue, selectOnMount }: { initialValue?: string; selectOnMount?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (selectOnMount && input.value) input.select();
  }, [initialValue, selectOnMount]);

  return (
    <label className="min-w-0 text-sm font-semibold text-slate-900">
      Scan code
      <span className="mt-1 block text-xs font-normal text-slate-500">Product, package, Order, Consignment, or work identifier</span>
      <input
        ref={inputRef}
        name="q"
        defaultValue={initialValue}
        autoFocus
        enterKeyHint="search"
        autoComplete="off"
        onFocus={(event) => event.currentTarget.select()}
        placeholder="Scan or enter a code"
        className="mt-2 min-h-14 w-full min-w-0 rounded-md border border-slate-300 px-4 text-lg font-semibold text-slate-950"
        data-universal-scan-input
      />
    </label>
  );
}
