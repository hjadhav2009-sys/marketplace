import React, { type ReactNode } from "react";

export type FeedbackTone = "info" | "success" | "warning" | "error" | "neutral";
export type FeedbackAnnouncement = "alert" | "status";

type FeedbackBannerProps = {
  action?: ReactNode;
  announcement?: FeedbackAnnouncement;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  id?: string;
  title: ReactNode;
  tone?: FeedbackTone;
};

const toneClass: Record<FeedbackTone, string> = {
  info: "ui-state--info",
  success: "ui-state--success",
  warning: "ui-state--warning",
  error: "ui-state--error",
  neutral: "ui-state--neutral",
};

function FeedbackMarker({ tone }: { tone: FeedbackTone }) {
  if (tone === "success") return <path d="m4.5 9 3 3 6-7" />;
  if (tone === "warning" || tone === "error") return <path d="M9 5.5v4M9 12.75h.01M9 2.75 16 15H2L9 2.75Z" />;
  if (tone === "info") return <path d="M9 8v5M9 5.25h.01M16 9A7 7 0 1 1 2 9a7 7 0 0 1 14 0Z" />;
  return <path d="M3 9h12" />;
}

export function FeedbackBanner({
  action,
  announcement,
  children,
  className = "",
  description,
  id,
  title,
  tone = "neutral",
}: FeedbackBannerProps) {
  const liveProps = announcement === "status"
    ? { role: "status", "aria-live": "polite" as const }
    : announcement === "alert"
      ? { role: "alert" }
      : {};

  return (
    <div id={id} className={`ui-feedback ${toneClass[tone]} ${className}`.trim()} aria-atomic={announcement ? "true" : undefined} {...liveProps}>
      <div className="ui-feedback__layout">
        <svg aria-hidden="true" className="ui-feedback__marker" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75">
          <FeedbackMarker tone={tone} />
        </svg>
        <div className="ui-feedback__content">
          <p className="ui-feedback__title">{title}</p>
          {description ? <div className="ui-feedback__description">{description}</div> : null}
          {children ? <div className="ui-feedback__detail">{children}</div> : null}
        </div>
        {action ? <div className="ui-feedback__action">{action}</div> : null}
      </div>
    </div>
  );
}
