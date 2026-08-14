"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldControlStyles } from "@/components/ui/Field";

export function PasswordField({ invalid = false, describedBy }: { invalid?: boolean; describedBy?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <Field id="login-password" label="Password" invalid={invalid} describedBy={describedBy} required>
      {(attributes) => (
        <span className="relative block">
          <input
            {...attributes}
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            className={fieldControlStyles({ size: "large", className: "pr-20" })}
            placeholder="Password"
            required
          />
          <Button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
            variant="quiet"
            className="absolute inset-y-0 right-1 my-auto px-3 text-slate-700"
          >
            {visible ? "Hide" : "Show"}
          </Button>
        </span>
      )}
    </Field>
  );
}
