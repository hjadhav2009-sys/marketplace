import React, { type ReactNode } from "react";

export type MetricTone = "neutral" | "action" | "info" | "success" | "warning" | "danger";

type MetricProps = {
  className?: string;
  detail?: ReactNode;
  label: ReactNode;
  scope?: ReactNode;
  tone?: MetricTone;
  value: ReactNode;
};

const toneClass: Record<MetricTone, string> = {
  neutral: "ui-metric--neutral",
  action: "ui-metric--action",
  info: "ui-metric--info",
  success: "ui-metric--success",
  warning: "ui-metric--warning",
  danger: "ui-metric--danger",
};

export function Metric({ className = "", detail, label, scope, tone = "neutral", value }: MetricProps) {
  return (
    <div className={`ui-metric ${toneClass[tone]} ${className}`.trim()}>
      <p className="ui-metric__label">{label}</p>
      <p className="ui-metric__value">{value}</p>
      {detail ? <p className="ui-metric__detail">{detail}</p> : null}
      {scope ? <p className="ui-metric__scope">{scope}</p> : null}
    </div>
  );
}
