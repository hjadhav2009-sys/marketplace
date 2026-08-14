"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";

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
    <FeedbackBanner tone="info" announcement="status" title={title} description={description}>
      <progress aria-label={`${title} progress`} className="mt-2 h-2 w-full overflow-hidden rounded-full accent-blue-700" />
    </FeedbackBanner>
  );
}
