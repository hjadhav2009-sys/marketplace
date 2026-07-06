"use client";

import { useFormStatus } from "react-dom";

type FormPendingStatusProps = {
  description: string;
  title: string;
};

export function FormPendingStatus({ description, title }: FormPendingStatusProps) {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return (
    <div role="status" aria-live="polite" className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{title}</p>
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-blue-700">Live</p>
      </div>
      <p className="mt-1 text-blue-800">{description}</p>
      <progress className="mt-3 h-2 w-full overflow-hidden rounded-full accent-blue-700" />
    </div>
  );
}
