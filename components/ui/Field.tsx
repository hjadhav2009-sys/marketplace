import React, { type ReactNode } from "react";

export type FieldControlAttributes = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = {
  id: string;
  label: string;
  children: (attributes: FieldControlAttributes) => ReactNode;
  className?: string;
  describedBy?: string;
  error?: string;
  help?: string;
  invalid?: boolean;
  required?: boolean;
};

type FieldControlStyleOptions = {
  className?: string;
  size?: "standard" | "large";
};

function joinIds(...ids: Array<string | undefined>) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

export function fieldControlStyles({ className = "", size = "standard" }: FieldControlStyleOptions = {}) {
  return ["ui-field-control", size === "large" ? "ui-field-control--large" : "", className].filter(Boolean).join(" ");
}

export function Field({ id, label, children, className = "", describedBy, error, help, invalid, required = false }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const isInvalid = Boolean(error) || invalid === true;
  const controlAttributes: FieldControlAttributes = {
    id,
    "aria-describedby": joinIds(describedBy, helpId, errorId),
    "aria-invalid": isInvalid ? true : undefined
  };

  return (
    <div className={`ui-field ${className}`.trim()}>
      <label htmlFor={id} className="ui-field__label">
        {label}
        {required ? <span className="ui-field__required" aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children(controlAttributes)}
      {help ? <p id={helpId} className="ui-field__help">{help}</p> : null}
      {error ? <p id={errorId} className="ui-field__error">{error}</p> : null}
    </div>
  );
}
