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
    <input
      ref={inputRef}
      name="q"
      defaultValue={initialValue}
      autoFocus
      enterKeyHint="search"
      autoComplete="off"
      onFocus={(event) => event.currentTarget.select()}
      placeholder="Scan AWB, Tracking ID, SKU, FSN, listing ID or barcode"
      className="min-h-14 min-w-0 rounded-md border px-4 text-lg font-bold"
      data-universal-scan-input
    />
  );
}
