export type ActionVariant = "primary" | "secondary" | "quiet" | "danger";
export type ActionSize = "standard" | "large";

type ButtonStyleOptions = {
  variant?: ActionVariant;
  size?: ActionSize;
  className?: string;
};

const variantClasses: Record<ActionVariant, string> = {
  primary: "ui-action--primary",
  secondary: "ui-action--secondary",
  quiet: "ui-action--quiet",
  danger: "ui-action--danger",
};

export function buttonStyles({ variant = "primary", size = "standard", className = "" }: ButtonStyleOptions = {}) {
  return ["ui-action", variantClasses[variant], size === "large" ? "ui-action--large" : "", className]
    .filter(Boolean)
    .join(" ");
}
