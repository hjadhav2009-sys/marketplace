"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: string;
  pendingText?: string;
  variant?: "primary" | "secondary";
};

export function SubmitButton({ children, pendingText = "Working...", variant = "primary" }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const className =
    variant === "primary"
      ? "bg-berry text-white hover:bg-pink-800"
      : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
