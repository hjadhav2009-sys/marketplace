import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoundedMarketplaceListingForm } from "../components/BoundedMarketplaceListingForm";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const formMarkup = renderToStaticMarkup(<BoundedMarketplaceListingForm
  action={async () => {}}
  issueId="synthetic-line"
  issueVersion={0}
  clientRequestId="synthetic-request"
  marketplace="AMAZON"
  sellerSku="D2A1-SKU"
  knownIdentifiers={[]}
  profiles={[]}
/>);

assert.doesNotMatch(formMarkup, /<input[^>]+name="resolutionAction"/i, "The shared form does not submit a hidden CREATE_FULL intent.");
assert.equal((formMarkup.match(/name="resolutionAction"/g) ?? []).length, 1, "Only the clicked secondary submitter can supply resolutionAction.");
assert.match(formMarkup, /<button(?=[^>]*name="resolutionAction")(?=[^>]*value="CREATE_MINIMAL")[^>]*>Create minimal listing<\/button>/i);
assert.match(formMarkup, /<button[^>]+type="submit"[^>]*>Create full listing<\/button>/i, "The primary submit relies on the server's CREATE_FULL default.");

const actionSource = readFileSync("app/owner/consignments/actions.ts", "utf8");
assert.match(actionSource, /formData\.get\("resolutionAction"\)\?\?"CREATE_FULL"/, "Consignment full action retains the server-side CREATE_FULL default.");
assert.match(actionSource, /==="CREATE_MINIMAL"\?"CREATE_MINIMAL":"CREATE_FULL"/, "Only an explicit clicked minimal submitter selects CREATE_MINIMAL.");

const serviceSource = readFileSync("src/lib/catalog/missing-listing-resolution.ts", "utf8");
assert.match(serviceSource, /submitted\.length > 250/, "The 250 nonblank dynamic-attribute server boundary remains enforced.");
assert.match(serviceSource, /actualFingerprint !== expectedFingerprint/, "Marketplace profile fingerprint validation remains enforced.");
assert.match(serviceSource, /input\.action === "CREATE_FULL"\) await writeDynamicAttributes/, "Minimal resolution cannot write Full dynamic attributes.");

const architecture = readFileSync("docs/architecture/AMAZON_COMPACT_CATALOG_CONTRACT_V1.md", "utf8");
for (const contract of [
  "SELLER_SKU", "TITLE", "PRODUCT_TYPE", "DESCRIPTION", "COLOR", "ASIN", "MAIN_IMAGE_URL",
  "OTHER_IMAGE_URL_1", "OTHER_IMAGE_URL_8", "SWATCH_IMAGE_URL", "MarketplaceFileProfile", "NEEDS_MAPPING"
]) assert.ok(architecture.includes(contract), `Amazon compact contract includes ${contract}.`);
assert.match(architecture, /Only `sellerSku` is required/i);
assert.match(architecture, /two different Seller SKUs sharing an ASIN remain distinct/i);
assert.match(architecture, /sheet or detected table identity[\s\S]+column index[\s\S]+raw human header[\s\S]+technical header/i);
assert.match(architecture, /stable marketplace technical key[\s\S]+exact saved `MarketplaceFileProfile` mapping[\s\S]+exact normalized human header[\s\S]+approved alias[\s\S]+owner mapping/i);

const fixture = createPhase736Database("phase-7-4d2a1-final-catalog-intent-contract");
const { prisma } = await import("../lib/prisma");
const { resolveConsignmentMissingListing } = await import("../src/lib/catalog/missing-listing-resolution");
const { mergeMarketplaceCatalogRows } = await import("../src/lib/product-inventory/merge");

async function heldLine(suffix: string, quantity: number) {
  const batch = await prisma.consignmentBatch.create({ data: {
    id: `d2a1-batch-${suffix}`,
    accountId: "d2a1-amazon",
    marketplace: "AMAZON",
    externalConsignmentNumber: `D2A1-${suffix}`,
    displayName: `D2A.1 ${suffix}`,
    sourceFileName: `${suffix}.csv`,
    sourceFileSha256: suffix.padEnd(64, "a").slice(0, 64),
    status: "REVIEW_REQUIRED",
    totalSourceRows: 1,
    totalValidLines: 1,
    totalRequiredQuantity: quantity,
    unmatchedLines: 1,
    createdByUserId: "d2a1-owner"
  } });
  const line = await prisma.consignmentLine.create({ data: {
    id: `d2a1-line-${suffix}`,
    consignmentBatchId: batch.id,
    accountId: "d2a1-amazon",
    rowNumber: 2,
    productNameSource: `Source title ${suffix}`,
    sellerSkuSource: `D2A1-SKU-${suffix}`,
    asinSource: `D2A1-ASIN-${suffix}`,
    requiredQuantity: quantity,
    matchStatus: "NOT_FOUND"
  } });
  await prisma.consignmentImportIssue.create({ data: {
    consignmentBatchId: batch.id,
    consignmentLineId: line.id,
    rowNumber: 2,
    issueType: "NOT_FOUND",
    severity: "ERROR",
    message: "Synthetic listing is missing."
  } });
  return { batch, line };
}

try {
  await prisma.account.create({ data: { id: "d2a1-amazon", name: "D2A.1 Amazon", code: "D2A1-AMZ", marketplace: "AMAZON" } });
  await prisma.user.create({ data: { id: "d2a1-owner", username: "d2a1-owner", passwordHash: "synthetic", name: "D2A.1 Owner", role: "OWNER" } });

  const full = await heldLine("full", 7);
  const fullResult = await resolveConsignmentMissingListing({
    actorUserId: "d2a1-owner",
    accountId: "d2a1-amazon",
    batchId: full.batch.id,
    lineId: full.line.id,
    expectedLineUpdatedAt: full.line.updatedAt.toISOString(),
    clientRequestId: "d2a1-full",
    action: "CREATE_FULL",
    common: { productTitle: "Owner protected D2A.1 title" },
    attributes: [],
    manualLocked: true
  });
  const fullListing = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: fullResult.listingId } });
  const fullLocks = JSON.parse(fullListing.manualLocksJson ?? "{}") as Record<string, boolean>;
  const fullProvenance = JSON.parse(fullListing.fieldProvenanceJson ?? "{}") as Record<string, unknown>;
  assert.equal(fullListing.listingStatus, "NEEDS_ENRICHMENT");
  assert.equal(fullLocks.listingStatus, undefined, "A generated NEEDS_ENRICHMENT default is not owner locked.");
  assert.equal(fullProvenance.listingStatus, undefined, "A generated default is not falsely attributed to MANUAL_OWNER.");
  assert.equal(fullLocks.productTitle, true, "An explicitly entered protected title remains locked.");

  const merge = await mergeMarketplaceCatalogRows({ accountId: "d2a1-amazon", marketplace: "AMAZON", rows: [{
    version: 1,
    marketplace: "AMAZON",
    accountId: "d2a1-amazon",
    sourceFileId: "d2a1-refresh",
    sourceTable: "Synthetic compact catalog",
    sourceRow: 2,
    sourceProfile: "AMAZON_ALL_LISTINGS",
    sourceAuthority: 400,
    sellerSku: full.line.sellerSkuSource,
    title: "Authoritative replacement title",
    listingStatus: "ACTIVE"
  }] }, prisma);
  const refreshed = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: fullListing.id } });
  assert.equal(refreshed.listingStatus, "ACTIVE", "Authoritative catalog refresh may replace the unlocked system default.");
  assert.equal(refreshed.productTitle, "Owner protected D2A.1 title", "Authoritative refresh preserves an explicitly protected owner title.");
  assert.ok(merge.conflicts.some((item) => item.reason.includes("productTitle")), "The protected title disagreement remains visible as a conflict.");

  const minimal = await heldLine("minimal", 11);
  const minimalInput = {
    actorUserId: "d2a1-owner",
    accountId: "d2a1-amazon",
    batchId: minimal.batch.id,
    lineId: minimal.line.id,
    expectedLineUpdatedAt: minimal.line.updatedAt.toISOString(),
    clientRequestId: "d2a1-minimal",
    action: "CREATE_MINIMAL" as const,
    common: { productTitle: "Full form value that minimal intent must ignore" },
    attributes: [{ technicalKey: "should.never.write", displayLabel: "Never write", value: "blocked" }],
    manualLocked: true
  };
  const minimalResult = await resolveConsignmentMissingListing(minimalInput);
  const minimalReplay = await resolveConsignmentMissingListing(minimalInput);
  const minimalListing = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: minimalResult.listingId } });
  const minimalLine = await prisma.consignmentLine.findUniqueOrThrow({ where: { id: minimal.line.id } });
  const minimalBatch = await prisma.consignmentBatch.findUniqueOrThrow({ where: { id: minimal.batch.id } });
  const minimalAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "CONSIGNMENT_MISSING_LISTING_RESOLVED", entityId: minimal.line.id } });
  assert.equal(minimalReplay.idempotent, true);
  assert.equal(minimalListing.productTitle, minimal.line.productNameSource, "Minimal intent uses the bounded Consignment fallback, not Full form values.");
  assert.equal(await prisma.marketplaceListingAttribute.count({ where: { marketplaceListingId: minimalListing.id } }), 0);
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: "d2a1-amazon", sellerSkuId: minimal.line.sellerSkuSource! } }), 1);
  assert.equal(minimalLine.requiredQuantity, 11);
  assert.equal(minimalLine.marketplaceListingId, minimalListing.id);
  assert.equal(minimalLine.activated, false);
  assert.equal(minimalBatch.status, "REVIEW_REQUIRED");
  assert.equal(minimalBatch.activatedAt, null);
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: minimal.line.id } }), 0);
  assert.equal((JSON.parse(minimalAudit.metadata ?? "{}") as { action?: string }).action, "CREATE_MINIMAL");
  assert.equal(await prisma.workflowActionReceipt.count({ where: { accountId: "d2a1-amazon", clientRequestId: minimalInput.clientRequestId, status: "COMPLETED" } }), 1);
} finally {
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Phase 7.4D2A.1 final catalog intent contract tests passed.");
