import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkCard, WorkCardIdentity } from "../components/work-card/WorkCard";
import { WorkCardActions, WorkCardContext, WorkCardDisclosure, WorkCardState } from "../components/work-card/WorkCardSections";
import { WorkCardQuantity } from "../components/work-card/WorkCardQuantity";

const read = (file: string) => readFileSync(file, "utf8");
const grouped = read("app/work/GroupedWorkCard.tsx");
const task = read("app/work/WorkTaskCardView.tsx");
const facade = read("app/work/WorkTaskCard.tsx");
const card = read("components/work-card/WorkCard.tsx");
const sections = read("components/work-card/WorkCardSections.tsx");
const quantity = read("components/work-card/WorkCardQuantity.tsx");
const dialog = read("components/work-card/WorkRouteDialogC1A.tsx");
const groupedQuick = read("components/work-card/GroupedQuickActions.tsx");
const taskQuick = read("components/work-card/WorkTaskQuickActions.tsx");
const image = read("components/ProductImage.tsx");

const markup = renderToStaticMarkup(
  <WorkCard
    source="ORDER"
    stage="PICK"
    status="READY"
    context={<WorkCardContext source="Customer order" marketplace="FLIPKART" stage="PICK" status="READY" />}
    media={<div>image</div>}
    identity={<WorkCardIdentity eyebrow="Order item 42" title="Long operational product title" sellerSku="SKU-42" />}
    quantity={<WorkCardQuantity stage="PICK" required={8} completed={3} assignment="Assigned to Picker" />}
    state={<WorkCardState title="Ready to process">Saved route</WorkCardState>}
    actions={<WorkCardActions mode="ready"><button>Complete</button><button>Details</button></WorkCardActions>}
    disclosure={<WorkCardDisclosure label="Identifiers">Order ID 42</WorkCardDisclosure>}
  />,
);

for (const marker of ["data-responsive-work-card", "Customer order", "FLIPKART", "PICK", "Ready", "Order item 42", "Seller SKU SKU-42", "Required", "Completed", "Pending", "Ready to process", "Identifiers"]) {
  assert.ok(markup.includes(marker), `Shared WorkCard markup is missing ${marker}.`);
}
assert.ok(markup.indexOf("Customer order") < markup.indexOf("Order item 42"), "Context precedes identity.");
assert.ok(markup.indexOf("Order item 42") < markup.indexOf("Required"), "Identity precedes work quantity.");
assert.ok(markup.indexOf("Ready to process") < markup.indexOf("<button>Complete</button>"), "Current state precedes mutation actions in the mobile/DOM scan order.");
assert.match(markup, /role="progressbar"[^>]*aria-valuemax="8"[^>]*aria-valuenow="3"/, "Valid quantity renders bounded progress semantics.");

const invalidQuantity = renderToStaticMarkup(<WorkCardQuantity stage="MARK" required={2} completed={4} assignment="Unassigned" />);
assert.match(invalidQuantity, /Quantity data needs review/, "Impossible quantity data becomes an explicit review state.");
assert.doesNotMatch(invalidQuantity, /role="progressbar"|>\s*-2\s*</, "Impossible quantity data never renders misleading progress or negative pending work.");
const packageQuantity = renderToStaticMarkup(<WorkCardQuantity stage="PACK" required={9} completed={0} itemCount={3} mode="package" assignment="Assigned" />);
assert.match(packageQuantity, /Package quantity[\s\S]*Item count[\s\S]*Total units/, "Pack cards use package language instead of Pick-style quantity language.");

for (const primitive of ["WorkCard", "WorkCardContext", "WorkCardIdentity", "WorkCardQuantity", "WorkCardState", "WorkCardActions", "WorkCardDisclosure"]) {
  assert.match(grouped + task + card + sections + quantity, new RegExp(`\\b${primitive}\\b`), `${primitive} is part of the C1 foundation.`);
}
assert.match(sections, /StatusBadge value=\{status\}/, "Only the workflow status uses the shared status badge.");
assert.doesNotMatch(sections, /rounded-full[^\n]*(source|marketplace|stage)/i, "Context fields are not rendered as competing pills.");
assert.match(card, /grid-cols-\[6rem_minmax\(0,1fr\)\][\s\S]*xl:grid-cols-\[7rem_minmax\(0,1fr\)_minmax\(13rem,0\.68fr\)_minmax\(12rem,0\.62fr\)\]/, "The foundation has intentional mobile and desktop geometries.");
assert.match(sections, /min-h-11/, "Disclosure summaries retain the 44px operational minimum.");
assert.doesNotMatch(card + sections + quantity, /gradient|backdrop-blur|font-black|animate-/, "The shared grammar adds no gradient, glass, decorative animation, or uniform ultra-heavy type.");

for (const invariant of [
  /completeGroupedStageAction/,
  /name="stage"/,
  /name="sourceType"/,
  /name="groupKey"/,
  /name="groupVersion"/,
  /name="clientRequestId"/,
  /`\/work\/groups\/\$\{card\.stage\.toLowerCase\(\)\}\/\$\{card\.groupKey\}\?source=\$\{card\.sourceType\}`/,
  /GroupedQuickActions/,
]) assert.match(grouped, invariant, `Grouped adapter lost ${invariant}.`);

for (const invariant of [
  /claimTaskAction/,
  /completeTaskAction/,
  /reportTaskProblemAction/,
  /setTaskProgressAction/,
  /getWorkTaskCapabilities\(user, task\)/,
  /name="taskId"/,
  /name="expectedQuantity"/,
  /name="clientRequestId"/,
  /name="returnPath"/,
  /name="targetQuantity"/,
  /name="reason"/,
  /name="note"/,
  /`\/work\/consignments\/items\/\$\{task\.id\}`/,
  /`\/work\/marking\/\$\{task\.id\}`/,
]) assert.match(task + taskQuick, invariant, `Task adapter lost ${invariant}.`);

assert.match(facade, /WorkTaskCardView/, "The long-lived WorkTaskCard API delegates through the compatibility adapter.");
assert.match(grouped, /fetch\(`\/api\/work\/groups\//, "Grouped cards retain their live refresh endpoint.");
assert.match(grouped, /window\.addEventListener\("work-change"/, "Grouped cards retain their live-update event listener.");
assert.match(groupedQuick, /Open full details[\s\S]*detailsHref|detailsHref[\s\S]*Open full details/, "Grouped quick details retain the full-details deep link.");
assert.match(dialog, /completeExactPickRouteAction[\s\S]*completeGroupedStageAction/, "Route choice preserves both authoritative server actions.");
for (const field of ["routeReason", "routeOtherReason", "confirmMissingInstructions", "workerNote", "route", "nextStage", "useRecommended"]) assert.match(dialog, new RegExp(`name="${field}"`), `Route dialog preserves ${field}.`);
assert.match(image, /loading=\{priority \? "eager" : "lazy"\}/, "Product imagery keeps the existing lazy-loading behavior.");
assert.match(image, /No image[\s\S]*Image unavailable|Image unavailable[\s\S]*No image/, "Product imagery keeps its existing missing and broken-image states.");
assert.match(task, /WorkImageGallery[^\n]+compact/, "Consignment task cards use the compact 96/112px image treatment without large-mode retry controls.");

assert.equal(createHash("sha256").update(read("app/work/actions.ts")).digest("hex"), "c0ae118554dd3841f7676b9a85aef88a0485c2670b68e7da5398a8ca1b0bf016", "Worker task server actions remain byte-identical to the C1 boundary.");
assert.match(read("app/work/stage-actions.ts"), /completeGroupedStageAction[\s\S]*completeGroupedStage\(/, "Grouped completion still delegates to its authoritative service.");

console.log("Phase 7.4C1 shared work-card grammar and protected interaction contracts passed.");
