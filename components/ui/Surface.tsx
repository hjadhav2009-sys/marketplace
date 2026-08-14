import React, { type HTMLAttributes, type ReactNode } from "react";

export type SurfaceVariant = "normal" | "subtle";
export type SurfacePadding = "normal" | "compact";

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: SurfacePadding;
  variant?: SurfaceVariant;
};

const variantClass: Record<SurfaceVariant, string> = {
  normal: "ui-surface--normal",
  subtle: "ui-surface--subtle",
};

const paddingClass: Record<SurfacePadding, string> = {
  normal: "ui-surface--normal-padding",
  compact: "ui-surface--compact-padding",
};

export function Surface({ children, className = "", padding = "normal", variant = "normal", ...props }: SurfaceProps) {
  return (
    <div
      className={`ui-surface ${variantClass[variant]} ${paddingClass[padding]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
