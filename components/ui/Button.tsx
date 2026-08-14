import React, { type ButtonHTMLAttributes } from "react";
import { buttonStyles, type ActionSize, type ActionVariant } from "./buttonStyles";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionVariant;
  size?: ActionSize;
};

export function Button({ className = "", type = "button", variant = "primary", size = "standard", ...props }: ButtonProps) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}
