"use client";

import { useFormStatus } from "react-dom";
import React, { type ReactNode } from "react";
import { buttonStyles, type ActionSize, type ActionVariant } from "./ui/buttonStyles";

type SubmitButtonProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pendingText?: string;
  size?: ActionSize;
  variant?: ActionVariant;
};

export function SubmitButton({ children, className = "", disabled = false, pendingText = "Working...", size = "standard", variant = "primary" }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-pending={pending ? "true" : undefined}
      className={buttonStyles({ variant, size, className })}
    >
      {pending ? pendingText : children}
    </button>
  );
}
