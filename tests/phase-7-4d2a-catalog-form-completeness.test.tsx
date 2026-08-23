import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DynamicListingFormSchema } from "../src/lib/catalog/dynamic-form-profiles";
import {
  ADVANCED_PAGE_SIZE,
  BoundedMarketplaceListingForm,
  MAX_NONBLANK_DYNAMIC_ATTRIBUTES,
  MAX_PROFILE_FIELDS
} from "../components/BoundedMarketplaceListingForm";
import { loadMissingListings } from "../lib/missing-listing-read";
import { safeExternalHttpUrl } from "../lib/product-inventory-details";
import { createTempWorkflowDb } from "./temp-workflow-db";

const read = (path: string) => readFileSync(path, "utf8");
const boundedFormSource = read("components/BoundedMarketplaceListingForm.tsx");
const missingWorkspaceSource = read("components/MissingListingsWorkspace.tsx");
const detailsSource = read("components/ProductInventoryDetails.tsx");

assert.equal(ADVANCED_PAGE_SIZE, 40);
assert.equal(MAX_NONBLANK_DYNAMIC_ATTRIBUTES, 250);
assert.equal(MAX_PROFILE_FIELDS, 1000);
assert.doesNotMatch(boundedFormSource, /dynamic[\s\S]{0,200}slice\(0, 250\)/, "Profile fields must not be silently truncated at 250.");
assert.match(boundedFormSource, /Search covers all/);
assert.match(boundedFormSource, /attributeLimitExceeded/);
assert.match(boundedFormSource, /Keep at most/);
assert.match(boundedFormSource, /setAttributeValues\(\{\}\)/, "Changing profile clears incompatible entered values.");

const fields = Array.from({ length: 883 }, (_, index) => {
  const position = index + 1;
  return {
    canonicalKey: `amazon.synthetic_field_${position}`,
    originalHeader: `Synthetic field ${position}`,
    technicalKey: `amazon.synthetic_field_${position}`,
    label: `Synthetic field ${position}`,
    section: "Category Attributes" as const,
    dataType: "text" as const,
    maxLength: 4000,
    marketplaceRequiredGuidance: false,
    locallyOptional: true,
    dynamicAttributeTarget: `amazon.synthetic_field_${position}`
  };
});
const schema: DynamicListingFormSchema = {
  marketplace: "AMAZON",
  templateKind: "SYNTHETIC_D2A_883_FIELD_PROFILE",
  technicalHeaderFingerprint: "d2a-technical-fingerprint",
  humanHeaderFingerprint: "d2a-human-fingerprint",
  fields,
  groups: ["Category Attributes"]
};
const markup = renderToStaticMarkup(<BoundedMarketplaceListingForm
  action={async () => {}}
  issueId="d2a-issue"
  issueVersion={1}
  clientRequestId="d2a-request"
  marketplace="AMAZON"
  sellerSku="D2A-SKU"
  knownIdentifiers={[]}
  profiles={[{ id: "d2a-profile", name: "Synthetic Amazon 883", schema }]}
  showMinimalAction={false}
/>);
assert.match(markup, /Advanced marketplace attributes \(883\)/);
assert.match(markup, /Search covers all 883 advanced fields/);
assert.match(markup, /Showing 1-40 of 883/);
assert.equal((markup.match(/name="attribute:/g) ?? []).length, 40, "Only one 40-control advanced page renders.");
assert.match(markup, /Synthetic field 1/);
assert.match(markup, /Synthetic field 40/);
assert.doesNotMatch(markup, /Synthetic field 41</);
assert.doesNotMatch(markup, /Synthetic field 883</);

assert.equal(safeExternalHttpUrl("https://example.test/product/1"), "https://example.test/product/1");
assert.equal(safeExternalHttpUrl("http://example.test/product/1"), "http://example.test/product/1");
for (const unsafe of [
  "javascript:alert(1)",
  "data:text/html,unsafe",
  "file:///C:/private.txt",
  "https://user:secret@example.test/product/1",
  "not a URL"
]) assert.equal(safeExternalHttpUrl(unsafe), null, `${unsafe} must not become clickable.`);
assert.match(detailsSource, /Marketplace links/);
assert.match(detailsSource, /Generated Direct Product URL/);
assert.match(detailsSource, /Canonical Product URL/);
assert.match(detailsSource, /safeExternalHttpUrl/);
assert.match(missingWorkspaceSource, /First seen/);
assert.match(missingWorkspaceSource, /formatDateTime\(item\.createdAt\)/);

const { db, cleanup } = createTempWorkflowDb("phase-7-4d2a-completeness");
try {
  await db.account.create({ data: { id: "d2a-account", name: "D2A", code: "D2A", marketplace: "FLIPKART" } });
  await db.uploadBatch.create({ data: { id: "d2a-upload", accountId: "d2a-account", fileName: "synthetic.csv" } });
  await db.order.create({ data: { id: "d2a-order", accountId: "d2a-account", batchId: "d2a-upload", marketplace: "FLIPKART", awb: "D2A-AWB", sku: "D2A-ORDER", orderNo: "D2A-ORDER", qty: 1 } });
  await db.importRowIssue.create({ data: {
    id: "d2a-order-ambiguous",
    batchId: "d2a-upload",
    rowNumber: 1,
    issueType: "AMBIGUOUS_LISTING",
    message: "Multiple exact Order candidates",
    safeDataJson: JSON.stringify({ sellerSku: "D2A-ORDER" }),
    sourceType: "ORDER",
    sourceId: "d2a-order"
  } });
  await db.consignmentBatch.create({ data: { id: "d2a-consignment", accountId: "d2a-account", marketplace: "FLIPKART", externalConsignmentNumber: "D2A-CN", displayName: "D2A Consignment", sourceFileName: "synthetic.csv", sourceFileSha256: "d2a-sha" } });
  await db.consignmentLine.createMany({ data: [
    { id: "d2a-line-ambiguous", consignmentBatchId: "d2a-consignment", accountId: "d2a-account", rowNumber: 1, sellerSkuSource: "D2A-CONSIGNMENT-AMBIGUOUS", requiredQuantity: 1, matchStatus: "EXACT_MULTIPLE" },
    { id: "d2a-line-conflict", consignmentBatchId: "d2a-consignment", accountId: "d2a-account", rowNumber: 2, sellerSkuSource: "D2A-CONSIGNMENT-CONFLICT", requiredQuantity: 1, matchStatus: "IDENTIFIER_CONFLICT" }
  ] });
  await db.consignmentImportIssue.createMany({ data: [
    { id: "d2a-consignment-ambiguous", consignmentBatchId: "d2a-consignment", consignmentLineId: "d2a-line-ambiguous", rowNumber: 1, issueType: "EXACT_MULTIPLE", severity: "ERROR", message: "Multiple exact Consignment candidates" },
    { id: "d2a-consignment-conflict", consignmentBatchId: "d2a-consignment", consignmentLineId: "d2a-line-conflict", rowNumber: 2, issueType: "IDENTIFIER_CONFLICT", severity: "ERROR", message: "Consignment identifiers conflict" }
  ] });

  const ambiguous = await loadMissingListings(db, "d2a-account", "FLIPKART", { reason: "ambiguous" });
  assert.equal(ambiguous.total, 2);
  assert.deepEqual(new Set(ambiguous.items.map((item) => item.reason)), new Set(["AMBIGUOUS_LISTING", "EXACT_MULTIPLE"]));

  const conflict = await loadMissingListings(db, "d2a-account", "FLIPKART", { reason: "conflict" });
  assert.equal(conflict.orderTotal, 0, "Identifier conflict must not relabel ambiguous Orders.");
  assert.equal(conflict.consignmentTotal, 1);
  assert.equal(conflict.items.length, 1);
  assert.equal(conflict.items[0]?.reason, "IDENTIFIER_CONFLICT");
  assert.equal(conflict.items[0]?.source, "CONSIGNMENT");
} finally {
  await cleanup();
}

console.log("Phase 7.4D2A catalog form completeness tests passed.");
