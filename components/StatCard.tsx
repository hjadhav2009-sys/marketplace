import React from "react";
import { Metric, type MetricTone } from "@/components/ui/Metric";
import { Surface } from "@/components/ui/Surface";

type StatCardProps = {
  label: string;
  value: string | number;
  tone?: "berry" | "mint" | "clay" | "slate";
};

const metricTone: Record<NonNullable<StatCardProps["tone"]>, MetricTone> = {
  berry: "action",
  mint: "success",
  clay: "warning",
  slate: "neutral",
};

export function StatCard({ label, value, tone = "slate" }: StatCardProps) {
  return (
    <Surface padding="compact">
      <Metric label={label} value={value} tone={metricTone[tone]} />
    </Surface>
  );
}
