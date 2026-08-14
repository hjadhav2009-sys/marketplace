import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmitButton } from "../components/SubmitButton";
import { Button } from "../components/ui/Button";
import { Field, fieldControlStyles } from "../components/ui/Field";
import { buttonStyles } from "../components/ui/buttonStyles";

const read = (file: string) => readFileSync(file, "utf8");
const globals = read("app/globals.css");
const tailwind = read("tailwind.config.ts");
const buttonStyleSource = read("components/ui/buttonStyles.ts");
const submitSource = read("components/SubmitButton.tsx");
const fieldSource = read("components/ui/Field.tsx");
const loginSource = read("app/login/page.tsx");
const passwordSource = read("app/login/PasswordField.tsx");
const loginActionSource = read("app/login/actions.ts");

for (const token of [
  "--color-canvas: #fafaf9",
  "--color-text: #0f172a",
  "--color-action: #be185d",
  "--color-success: #0f766e",
  "--focus-color: var(--color-success)",
  "--focus-width: 3px",
  "--focus-offset: 2px",
  "--control-min-height: 44px",
  "--control-large-height: 48px",
]) {
  assert.ok(globals.includes(token), `Missing B1a token: ${token}`);
}
assert.match(tailwind, /berry:\s*"#be185d"/, "The approved primary berry remains active in Tailwind.");
assert.doesNotMatch(`${globals}${tailwind}${buttonStyleSource}`, /#9f1239/i, "B1a must not activate the unapproved darker berry.");
assert.match(globals, /:focus-visible[\s\S]*outline: var\(--focus-width\) solid var\(--focus-color\)/, "Keyboard focus uses the semantic focus token.");
assert.match(globals, /box-shadow: 0 0 0 var\(--focus-offset\) var\(--focus-contrast\)/, "Focus keeps a contrasting separation ring on colored surfaces.");
assert.doesNotMatch(globals, /transition-property:[^;]*box-shadow/, "Visible focus feedback is immediate rather than animated.");
assert.match(globals, /@media \(hover: hover\) and \(pointer: fine\)/, "Pointer hover styles are gated to hover-capable devices.");
for (const variantClass of ["ui-action--primary", "ui-action--secondary", "ui-action--quiet", "ui-action--danger"]) {
  assert.match(buttonStyleSource, new RegExp(`\\b${variantClass}\\b`), `${variantClass} must be statically discoverable by Tailwind.`);
}

for (const variant of ["primary", "secondary", "quiet", "danger"] as const) {
  const markup = renderToStaticMarkup(<Button variant={variant}>{variant}</Button>);
  assert.match(markup, new RegExp(`ui-action--${variant}`), `${variant} Button renders the shared action contract.`);
}
const disabledButton = renderToStaticMarkup(<Button disabled>Disabled</Button>);
assert.match(disabledButton, /type="button"/, "Normal Button defaults to the non-submitting button type.");
assert.match(disabledButton, /disabled=""/, "Disabled Button preserves the native disabled attribute.");
assert.match(buttonStyles({ variant: "quiet", className: "w-full" }), /ui-action--quiet[\s\S]*w-full/, "Link actions can extend the same shared styles.");
assert.match(globals, /min-height: var\(--control-min-height\)/, "Enabled actions keep the 44px minimum target token.");
assert.match(globals, /min-width: var\(--control-min-height\)/, "Compact actions keep a 44px minimum width.");

const primarySubmit = renderToStaticMarkup(<form><SubmitButton>Save</SubmitButton></form>);
const secondarySubmit = renderToStaticMarkup(<form><SubmitButton variant="secondary">Cancel</SubmitButton></form>);
assert.match(primarySubmit, /type="submit"/, "SubmitButton remains a native submit control.");
assert.match(primarySubmit, /ui-action--primary/, "Existing primary callers retain the primary variant.");
assert.match(secondarySubmit, /ui-action--secondary/, "Existing secondary callers retain the secondary variant.");
assert.match(submitSource, /useFormStatus\(\)/, "SubmitButton remains bound to real form pending state.");
assert.match(submitSource, /disabled=\{disabled \|\| pending\}/, "SubmitButton is disabled while pending and honors an explicit disabled state.");
assert.match(submitSource, /pending \? pendingText : children/, "Pending text replacement remains intact.");
assert.match(submitSource, /className=\{buttonStyles\(\{ variant, size, className \}\)\}/, "SubmitButton preserves className extension through the shared helper.");

const fieldMarkup = renderToStaticMarkup(
  <Field id="shipment-code" label="Shipment code" help="Use the account shipment identifier." error="Shipment code is required." required>
    {(attributes) => <input {...attributes} className={fieldControlStyles()} disabled readOnly />}
  </Field>,
);
assert.match(fieldMarkup, /<label for="shipment-code"/, "Field renders a programmatic label/control relationship.");
assert.match(fieldMarkup, /aria-describedby="shipment-code-help shipment-code-error"/, "Field combines help and error descriptions.");
assert.match(fieldMarkup, /aria-invalid="true"/, "Field exposes invalid semantics when an error is present.");
assert.match(fieldMarkup, /id="shipment-code-help"/, "Field renders help text with a stable description id.");
assert.match(fieldMarkup, /id="shipment-code-error"/, "Field renders error text with a stable description id.");
assert.match(fieldMarkup, /disabled=""/, "Field controls preserve native disabled state.");
assert.match(fieldMarkup, /readOnly=""/, "Field controls preserve native read-only state.");
assert.match(fieldSource, /joinIds\(describedBy, helpId, errorId\)/, "External, help, and error descriptions compose safely.");
assert.match(fieldSource, /Boolean\(error\) \|\| invalid === true/, "Rendered error copy always marks its control invalid.");
assert.match(globals, /\.ui-field-control:disabled/, "Disabled controls have an explicit visual state.");
assert.match(globals, /\.ui-field-control:read-only/, "Read-only controls have an explicit visual state.");

for (const invariant of [
  /action=\{loginAction\}/,
  /name="username"/,
  /autoComplete="username"/,
  /autoFocus=\{hasLoginError\}/,
  /href="\/forgot-password"/,
  /pendingText="Signing in\.\.\."/,
  /size="large"/,
]) {
  assert.match(loginSource, invariant, `Login contract missing ${invariant}.`);
}
for (const invariant of [
  /name="password"/,
  /autoComplete="current-password"/,
  /type=\{visible \? "text" : "password"\}/,
  /aria-label=\{visible \? "Hide password" : "Show password"\}/,
  /aria-pressed=\{visible\}/,
  /onClick=\{\(\) => setVisible/,
]) {
  assert.match(passwordSource, invariant, `Password field contract missing ${invariant}.`);
}
assert.doesNotMatch(`${loginSource}${passwordSource}`, /focus:ring-|focus-visible:outline-berry|outline-none/, "The Login proof uses one intentional global focus treatment.");
assert.equal(
  createHash("sha256").update(loginActionSource).digest("hex"),
  "a6c99c4e710f09460b7dfe46fbf928cec244c179d732a87b2c7967e404113fd2",
  "The authoritative login server action must remain byte-identical to the audited baseline.",
);

console.log("Phase 7.4B1a token, action, field, focus, and Login contracts passed.");
