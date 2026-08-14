import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { StatusBadge, statusTone } from "../components/StatusBadge";
import { FeedbackBanner } from "../components/ui/FeedbackBanner";
import { Metric } from "../components/ui/Metric";
import { Surface } from "../components/ui/Surface";

const read = (file: string) => readFileSync(file, "utf8");
const globals = read("app/globals.css");
const loginSource = read("app/login/page.tsx");
const pendingSource = read("components/FormPendingStatus.tsx");
const emptySource = read("components/EmptyState.tsx");
const statSource = read("components/StatCard.tsx");

for (const token of [
  "--color-action: #be185d",
  "--color-info: #1d4ed8",
  "--color-success: #0f766e",
  "--color-warning: #92400e",
  "--color-danger: #be123c",
  "--radius-surface: 0.5rem",
]) assert.ok(globals.includes(token), `Missing B1b semantic token: ${token}`);
assert.doesNotMatch(globals, /#9f1239/i, "B1b must not activate the unapproved darker berry.");

for (const tone of ["info", "success", "warning", "error", "neutral"] as const) {
  const markup = renderToStaticMarkup(<FeedbackBanner tone={tone} title={`${tone} title`} description="A bounded description." />);
  assert.match(markup, new RegExp(`ui-state--${tone}`));
  assert.match(markup, new RegExp(`${tone} title`));
  assert.doesNotMatch(markup, /role="alert"|role="status"/, "Static feedback does not become a live region automatically.");
}
const alert = renderToStaticMarkup(<FeedbackBanner tone="error" announcement="alert" title="Could not save" action={<button>Retry</button>}>Long recovery details that must wrap.</FeedbackBanner>);
assert.match(alert, /role="alert"/);
assert.match(alert, /aria-atomic="true"/);
assert.match(alert, />Retry</);
const status = renderToStaticMarkup(<FeedbackBanner tone="success" announcement="status" title="Saved" />);
assert.match(status, /role="status"/);
assert.match(status, /aria-live="polite"/);

const knownStatusTones = {
  READY: "info",
  RUNNING: "info",
  COMPLETED: "success",
  PACKED: "success",
  PICKED: "success",
  RESOLVED: "success",
  ACTIVE: "success",
  COMPLETED_WITH_WARNINGS: "warning",
  PASSWORD_REQUIRED: "warning",
  NEEDS_MAPPING: "warning",
  PROBLEM: "error",
  FAILED: "error",
  NOT_FOUND: "error",
  NEEDS_ACTION: "error",
  QUEUED: "neutral",
  UPLOADED: "neutral",
  INACTIVE: "neutral",
} as const;
for (const [value, tone] of Object.entries(knownStatusTones)) {
  assert.equal(statusTone[value], tone, `${value} retains its reviewed semantic meaning.`);
  const markup = renderToStaticMarkup(<StatusBadge value={value} />);
  assert.match(markup, new RegExp(`data-status="${value}"`));
  assert.match(markup, new RegExp(`data-tone="${tone}"`));
  const label = value.toLowerCase().split("_").map(part => part[0].toUpperCase() + part.slice(1)).join(" ");
  assert.match(markup, new RegExp(label));
  assert.match(markup, /<svg aria-hidden="true"/, "Status markers reinforce explicit text without duplicate speech.");
}
const unknownStatus = renderToStaticMarkup(<StatusBadge value="WAREHOUSE_REVIEW_PENDING_WITH_LONG_LABEL" />);
assert.match(unknownStatus, /data-tone="neutral"/);
assert.match(unknownStatus, /Warehouse Review Pending With Long Label/);
assert.match(globals, /\.ui-status-badge[\s\S]*max-width: 100%[\s\S]*overflow-wrap: anywhere/, "Long status labels remain intrinsic-width safe.");

const normalSurface = renderToStaticMarkup(<Surface>Content</Surface>);
const compactSurface = renderToStaticMarkup(<Surface variant="subtle" padding="compact">Content</Surface>);
assert.match(normalSurface, /ui-surface--normal ui-surface--normal-padding/);
assert.match(compactSurface, /ui-surface--subtle ui-surface--compact-padding/);
assert.match(globals, /\.ui-surface \{[\s\S]*min-width: 0[\s\S]*border-radius: var\(--radius-surface\)/);

const emptyWithAction = renderToStaticMarkup(<EmptyState title="No work" description="Select another account or return later." action={{ href: "/work", label: "Open Work Hub" }} />);
const emptyWithoutAction = renderToStaticMarkup(<EmptyState title="Nothing to review" description="No records match this filter." />);
assert.match(emptyWithAction, /ui-surface/);
assert.match(emptyWithAction, /href="\/work"/);
assert.match(emptyWithAction, /ui-action--primary/);
assert.match(emptyWithoutAction, /Nothing to review/);
assert.doesNotMatch(emptyWithoutAction, /<a /);
assert.match(emptySource, /buttonStyles\(\{ className: "mt-5" \}\)/);

for (const value of ["24", "0", "A very long operational value that wraps safely"]) {
  const markup = renderToStaticMarkup(<Metric label="Open work" value={value} detail="Supporting detail" scope="Today · selected account" />);
  assert.match(markup, /ui-metric--neutral/);
  assert.ok(markup.includes(value));
  assert.match(markup, /Supporting detail/);
  assert.match(markup, /Today · selected account/);
}
assert.match(renderToStaticMarkup(<Metric label="Blocked" value={3} tone="danger" />), /ui-metric--danger/);
for (const tone of ["berry", "mint", "clay", "slate"] as const) {
  const markup = renderToStaticMarkup(<StatCard label="Existing caller" value={0} tone={tone} />);
  assert.match(markup, /ui-surface/);
  assert.match(markup, /ui-metric--/);
}
assert.match(statSource, /<Metric label=\{label\} value=\{value\} tone=\{metricTone\[tone\]\}/);

for (const invariant of [
  /params\?\.setup === "1"/,
  /params\?\.passwordChanged === "1"/,
  /params\?\.expired === "1"/,
  /params\?\.error === "invalid"/,
  /params\?\.error === "session"/,
  /id="login-error"/,
  /announcement="alert"/,
  /aria-describedby=\{hasLoginError \? "login-error" : undefined\}/,
  /action=\{loginAction\}/,
]) assert.match(loginSource, invariant, `Login state contract missing ${invariant}.`);
assert.match(loginSource, /tone="warning" title="Your session expired\. Sign in again to continue\."/);
assert.match(pendingSource, /useFormStatus\(\)/);
assert.match(pendingSource, /if \(!pending\)/);
assert.match(pendingSource, /announcement="status"/);
assert.match(pendingSource, /<progress/);
assert.doesNotMatch(`${globals}${pendingSource}`, /@keyframes|animate-/, "B1b adds no motion to state feedback or progress.");

assert.match(globals, /\.ui-action \{[\s\S]*min-height: var\(--control-min-height\)/);
assert.match(read("package.json"), /"phase7\.4b1b:test"/);

console.log("Phase 7.4B1b feedback, status, surface, empty-state, and metric contracts passed.");
