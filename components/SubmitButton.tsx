"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: string;
  className?: string;
  pendingText?: string;
  variant?: "primary" | "secondary";
};

export function SubmitButton({ children, className: extraClassName = "", pendingText = "Working...", variant = "primary" }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const className =
    variant === "primary"
      ? "bg-berry text-white hover:bg-pink-800"
      : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex min-h-12 items-center justify-center rounded-md px-5 py-3 text-base font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm ${className} ${extraClassName}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
