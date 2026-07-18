import assert from "node:assert/strict";
import type { Account, User } from "@prisma/client";
import { runCrossProcessResolutionRace } from "./helpers/cross-process-resolution-race";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture = createPhase736Database("consignment-missing-listing-resolution");
const { prisma } = await import("../lib/prisma");
const { normalizeListingIdentifier } = await import("../src/lib/marking/identifiers");
const { resolveConsignmentMissingListing } = await import("../src/lib/catalog/missing-listing-resolution");

const AMAZON_PROFILE_ID = "amazon-form-profile";
const AMAZON_PROFILE_FINGERPRINT = "phase736-amazon-technical-v1";

type HeldConsignmentLine = Awaited<ReturnType<typeof createHeldLine>>;
type ConsignmentResolutionResult = Awaited<ReturnType<typeof resolveConsignmentMissingListing>>;

async function createHeldLine(
  account: Account,
  user: User,
  suffix: string,
  quantity: number,
  identifiers: { sellerSku?: string; asin?: string; fnsku?: string; fsn?: string } = {}
) {
  const batch = await prisma.consignmentBatch.create({
    data: {
      id: `batch-${suffix}`,
      accountId: account.id,
      marketplace: account.marketplace,
      externalConsignmentNumber: `CONSIGNMENT-${suffix}`,
      displayName: `Synthetic ${suffix}`,
      sourceFileName: `synthetic-${suffix}.csv`,
      sourceFileSha256: suffix.padEnd(64, "a").slice(0, 64),
      status: "REVIEW_REQUIRED",
      totalSourceRows: 1,
      totalValidLines: 1,
      totalRequiredQuantity: quantity,
      unmatchedLines: 1,
      createdByUserId: user.id
    }
  });
  const line = await prisma.consignmentLine.create({
    data: {
      id: `line-${suffix}`,
      consignmentBatchId: batch.id,
      accountId: account.id,
      rowNumber: 2,
      productNameSource: `Held Amazon product ${suffix}`,
      sellerSkuSource: identifiers.sellerSku ?? `AMZ-SKU-${suffix}`,
      asinSource: identifiers.asin ?? `ASIN-${suffix}`,
      fnskuSource: identifiers.fnsku ?? `FNSKU-${suffix}`,
      fsnSource: identifiers.fsn,
      requiredQuantity: quantity,
      matchStatus: "NOT_FOUND"
    }
  });
  const issue = await prisma.consignmentImportIssue.create({
    data: {
      consignmentBatchId: batch.id,
      consignmentLineId: line.id,
      rowNumber: line.rowNumber,
      issueType: "NOT_FOUND",
      severity: "ERROR",
      message: "Listing is missing."
    }
  });
  return { batch, line, issue };
}

function resolutionInput(
  held: HeldConsignmentLine,
  actorUserId: string,
  accountId: string,
  clientRequestId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    actorUserId,
    accountId,
    batchId: held.batch.id,
    lineId: held.line.id,
    expectedLineUpdatedAt: held.line.updatedAt.toISOString(),
    clientRequestId,
    action: "CREATE_FULL" as const,
    profileId: AMAZON_PROFILE_ID,
    expectedProfileTechnicalFingerprint: AMAZON_PROFILE_FINGERPRINT,
    common: { productTitle: `Owner catalog title ${held.line.sellerSkuSource}`, images: ["https://example.invalid/amazon.jpg"] },
    attributes: [{
      technicalKey: "bullet_point[language_tag=en_IN]#1.value",
      displayLabel: "Bullet point",
      value: "Synthetic bullet",
      manualLocked: true
    }],
    ...overrides
  };
}

async function expectControlledRejection(run: () => Promise<unknown>, expected: RegExp) {
  let message = "";
  await assert.rejects(async () => {
    try {
      await run();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }, expected);
  assert.doesNotMatch(message, /P2002|P2034|PrismaClientKnownRequestError|SQLITE_BUSY/i, "Raw database errors must not reach callers");
  return message;
}

try {
  const amazon = await prisma.account.create({ data: { id: "amazon", name: "QA Amazon", code: "QA-AMZ", marketplace: "AMAZON" } });
  const otherAmazon = await prisma.account.create({ data: { id: "amazon-other", name: "QA Amazon Other", code: "QA-AMZ-2", marketplace: "AMAZON" } });
  const owner = await prisma.user.create({ data: { id: "owner", username: "phase736-consignment-owner", passwordHash: "x", name: "Owner", role: "OWNER" } });

  const formSchema = {
    marketplace: "AMAZON",
    templateKind: "AMAZON_TEST_PROFILE",
    technicalHeaderFingerprint: AMAZON_PROFILE_FINGERPRINT,
    humanHeaderFingerprint: "phase736-amazon-human-v1",
    fields: [{
      canonicalKey: "bullet_point[language_tag=en_IN]#1.value",
      originalHeader: "Bullet point",
      technicalKey: "bullet_point[language_tag=en_IN]#1.value",
      label: "Bullet point",
      section: "Bullets and Keywords",
      dataType: "text",
      maxLength: 4000,
      repeatIndex: 1,
      marketplaceRequiredGuidance: false,
      locallyOptional: true,
      dynamicAttributeTarget: "bullet_point[language_tag=en_IN]#1.value"
    }],
    groups: ["Bullets and Keywords"]
  };
  await prisma.marketplaceFileProfile.create({
    data: {
      id: AMAZON_PROFILE_ID,
      accountId: amazon.id,
      marketplace: "AMAZON",
      importPurpose: "PRODUCT_CATALOG",
      profileName: "Synthetic Amazon form",
      headerFingerprint: "phase736-amazon-profile-v1",
      fieldMappingJson: "{}",
      requiredFieldsJson: "[]",
      formSchemaJson: JSON.stringify(formSchema),
      technicalHeaderFingerprint: formSchema.technicalHeaderFingerprint,
      humanHeaderFingerprint: formSchema.humanHeaderFingerprint,
      templateKind: formSchema.templateKind,
      active: true
    }
  });

  // Identical concurrent saves must create exactly one catalog result and one line resolution.
  const concurrent = await createHeldLine(amazon, owner, "CONCURRENT", 7);
  const concurrentInput = resolutionInput(concurrent, owner.id, amazon.id, "consignment-resolve-concurrent");
  const [first, second] = await Promise.all([
    resolveConsignmentMissingListing(concurrentInput),
    resolveConsignmentMissingListing(concurrentInput)
  ]);
  assert.equal(first.listingId, second.listingId);
  assert.equal(first.lineId, second.lineId);
  assert.equal(first.requiredQuantity, 7);
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: amazon.id, sellerSkuId: concurrent.line.sellerSkuSource! } }), 1);
  assert.equal(await prisma.marketplaceListingIdentifier.count({
    where: { marketplaceListingId: first.listingId, identifierType: { in: ["SELLER_SKU", "ASIN", "FNSKU"] } }
  }), 3);
  assert.equal(await prisma.marketplaceListingAttribute.count({ where: { marketplaceListingId: first.listingId } }), 1);
  assert.equal(await prisma.workflowActionReceipt.count({
    where: { accountId: amazon.id, actorUserId: owner.id, requestKind: "CONSIGNMENT_MISSING_LISTING_RESOLUTION", clientRequestId: concurrentInput.clientRequestId, status: "COMPLETED" }
  }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "CONSIGNMENT_MISSING_LISTING_RESOLVED", entityId: concurrent.line.id } }), 1);

  const resolvedLine = await prisma.consignmentLine.findUniqueOrThrow({ where: { id: concurrent.line.id } });
  const unresolvedBatch = await prisma.consignmentBatch.findUniqueOrThrow({ where: { id: concurrent.batch.id } });
  assert.equal(resolvedLine.requiredQuantity, 7, "Catalog resolution preserves Shipped/Quantity Sent");
  assert.equal(resolvedLine.marketplaceListingId, first.listingId);
  assert.equal(resolvedLine.activated, false, "Catalog resolution must not activate a Consignment line");
  assert.equal(unresolvedBatch.status, "REVIEW_REQUIRED");
  assert.equal(unresolvedBatch.activatedAt, null, "Catalog resolution must not activate a Consignment batch");
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: concurrent.line.id } }), 0, "No WorkTask is created before explicit activation");
  assert.equal(await prisma.consignmentImportIssue.count({ where: { consignmentLineId: concurrent.line.id, resolved: false } }), 0);

  // Independent runtimes race through the durable Consignment receipt rather than the process-local request gate.
  const processRace = await createHeldLine(amazon, owner, "PROCESS-RACE", 13);
  const processRaceInput = resolutionInput(processRace, owner.id, amazon.id, "consignment-process-race");
  const processResponses = await runCrossProcessResolutionRace<ConsignmentResolutionResult>("CONSIGNMENT", processRaceInput);
  const processResults = processResponses.map((response) => {
    if (!response.ok) assert.fail(`Cross-process Consignment resolution returned a controlled failure instead of replaying success: ${response.error}`);
    return response.result;
  });
  assert.equal(processResults[0].listingId, processResults[1].listingId);
  assert.equal(processResults[0].lineId, processResults[1].lineId);
  assert.deepEqual(processResults.map((result) => result.idempotent).sort(), [false, true], "One process commits and the other replays the Consignment result");
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: amazon.id, sellerSkuId: processRace.line.sellerSkuSource! } }), 1);
  assert.equal(await prisma.marketplaceListingIdentifier.count({
    where: { marketplaceListingId: processResults[0].listingId, identifierType: { in: ["SELLER_SKU", "ASIN", "FNSKU"] } }
  }), 3);
  assert.equal(await prisma.workflowActionReceipt.count({
    where: { accountId: amazon.id, actorUserId: owner.id, requestKind: "CONSIGNMENT_MISSING_LISTING_RESOLUTION", clientRequestId: processRaceInput.clientRequestId, status: "COMPLETED" }
  }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "CONSIGNMENT_MISSING_LISTING_RESOLVED", entityId: processRace.line.id } }), 1);
  const processRaceLine = await prisma.consignmentLine.findUniqueOrThrow({ where: { id: processRace.line.id } });
  const processRaceBatch = await prisma.consignmentBatch.findUniqueOrThrow({ where: { id: processRace.batch.id } });
  assert.equal(processRaceLine.requiredQuantity, 13);
  assert.equal(processRaceLine.marketplaceListingId, processResults[0].listingId);
  assert.equal(processRaceLine.activated, false);
  assert.equal(processRaceBatch.status, "REVIEW_REQUIRED");
  assert.equal(processRaceBatch.activatedAt, null);
  assert.equal(await prisma.consignmentImportIssue.count({ where: { consignmentLineId: processRace.line.id, resolved: true } }), 1);
  assert.equal(await prisma.consignmentImportIssue.count({ where: { consignmentLineId: processRace.line.id, resolved: false } }), 0);
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: processRace.line.id } }), 0);

  // CREATE_MINIMAL resolves catalog identity without profile attributes or workflow activation.
  const minimal = await createHeldLine(amazon, owner, "CREATE-MINIMAL", 6);
  const minimalResult = await resolveConsignmentMissingListing(resolutionInput(minimal, owner.id, amazon.id, "consignment-create-minimal", {
    action: "CREATE_MINIMAL" as const,
    common: undefined,
    attributes: []
  }));
  const minimalListing = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: minimalResult.listingId } });
  const minimalLine = await prisma.consignmentLine.findUniqueOrThrow({ where: { id: minimal.line.id } });
  const minimalBatch = await prisma.consignmentBatch.findUniqueOrThrow({ where: { id: minimal.batch.id } });
  assert.equal(minimalListing.sellerSkuId, minimal.line.sellerSkuSource);
  assert.equal(minimalListing.productTitle, minimal.line.productNameSource);
  assert.equal(minimalListing.listingStatus, "NEEDS_ENRICHMENT");
  assert.equal(await prisma.marketplaceListingAttribute.count({ where: { marketplaceListingId: minimalListing.id } }), 0);
  assert.equal(minimalLine.requiredQuantity, 6);
  assert.equal(minimalLine.marketplaceListingId, minimalListing.id);
  assert.equal(minimalLine.activated, false);
  assert.equal(minimalBatch.status, "REVIEW_REQUIRED");
  assert.equal(minimalBatch.activatedAt, null);
  assert.equal(await prisma.consignmentImportIssue.count({ where: { consignmentLineId: minimal.line.id, resolved: false } }), 0);
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: minimal.line.id } }), 0);

  await expectControlledRejection(
    () => resolveConsignmentMissingListing({ ...concurrentInput, common: { productTitle: "Changed replay" } }),
    /different payload/i
  );

  // Optimistic line-version checking prevents an older form from resolving changed source data.
  const staleLine = await createHeldLine(amazon, owner, "STALE-LINE", 4);
  const staleLineInput = resolutionInput(staleLine, owner.id, amazon.id, "consignment-stale-line");
  await prisma.consignmentLine.update({
    where: { id: staleLine.line.id },
    data: { productNameSource: "Changed in another tab", updatedAt: new Date(staleLine.line.updatedAt.getTime() + 5_000) }
  });
  await expectControlledRejection(
    () => resolveConsignmentMissingListing(staleLineInput),
    /line changed|refresh/i
  );
  const staleLineAfter = await prisma.consignmentLine.findUniqueOrThrow({ where: { id: staleLine.line.id } });
  assert.equal(staleLineAfter.marketplaceListingId, null);
  assert.equal(staleLineAfter.requiredQuantity, 4);
  assert.equal(await prisma.consignmentImportIssue.count({ where: { consignmentLineId: staleLine.line.id, resolved: false } }), 1);
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: staleLine.line.id } }), 0);

  // Supplying another account cannot attach or reveal a primary-account line.
  const crossAccount = await createHeldLine(amazon, owner, "CROSS-ACCOUNT", 5);
  await expectControlledRejection(
    () => resolveConsignmentMissingListing(resolutionInput(crossAccount, owner.id, otherAmazon.id, "consignment-cross-account")),
    /unavailable|account|access|assigned/i
  );
  assert.equal((await prisma.consignmentLine.findUniqueOrThrow({ where: { id: crossAccount.line.id } })).marketplaceListingId, null);

  // The same identifier in another account remains a separate catalog identity.
  const isolatedOtherListing = await prisma.marketplaceListing.create({
    data: { accountId: otherAmazon.id, marketplace: "AMAZON", sellerSkuId: "AMZ-OTHER-ISOLATED", sku: "AMZ-OTHER-ISOLATED" }
  });
  await prisma.marketplaceListingIdentifier.create({
    data: {
      accountId: otherAmazon.id,
      marketplaceListingId: isolatedOtherListing.id,
      marketplace: "AMAZON",
      identifierType: "ASIN",
      rawValue: "ASIN-ISOLATED",
      normalizedValue: normalizeListingIdentifier("ASIN", "ASIN-ISOLATED")!,
      source: "TEST"
    }
  });
  const isolated = await createHeldLine(amazon, owner, "ISOLATED", 9, { asin: "ASIN-ISOLATED" });
  const isolatedResult = await resolveConsignmentMissingListing(resolutionInput(isolated, owner.id, amazon.id, "consignment-isolated", { attributes: [] }));
  assert.notEqual(isolatedResult.listingId, isolatedOtherListing.id);
  assert.equal(await prisma.marketplaceListingIdentifier.count({ where: { identifierType: "ASIN", normalizedValue: normalizeListingIdentifier("ASIN", "ASIN-ISOLATED")! } }), 2);
  assert.equal((await prisma.consignmentLine.findUniqueOrThrow({ where: { id: isolated.line.id } })).requiredQuantity, 9);
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: isolated.line.id } }), 0);

  // A same-account identifier conflict must roll back the listing and line resolution atomically.
  const conflictOwner = await prisma.marketplaceListing.create({
    data: { accountId: amazon.id, marketplace: "AMAZON", sellerSkuId: "AMZ-CONFLICT-OWNER", sku: "AMZ-CONFLICT-OWNER" }
  });
  await prisma.marketplaceListingIdentifier.create({
    data: {
      accountId: amazon.id,
      marketplaceListingId: conflictOwner.id,
      marketplace: "AMAZON",
      identifierType: "ASIN",
      rawValue: "ASIN-CONFLICT",
      normalizedValue: normalizeListingIdentifier("ASIN", "ASIN-CONFLICT")!,
      source: "TEST"
    }
  });
  const conflict = await createHeldLine(amazon, owner, "IDENTIFIER-CONFLICT", 11, { sellerSku: "AMZ-NEW-CONFLICT", asin: "ASIN-CONFLICT" });
  await expectControlledRejection(
    () => resolveConsignmentMissingListing(resolutionInput(conflict, owner.id, amazon.id, "consignment-identifier-conflict", { attributes: [] })),
    /ASIN|identifier|another listing|conflict/i
  );
  const conflictLine = await prisma.consignmentLine.findUniqueOrThrow({ where: { id: conflict.line.id } });
  assert.equal(conflictLine.requiredQuantity, 11);
  assert.equal(conflictLine.marketplaceListingId, null);
  assert.equal(conflictLine.activated, false);
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: amazon.id, sellerSkuId: "AMZ-NEW-CONFLICT" } }), 0);
  assert.equal(await prisma.consignmentImportIssue.count({ where: { consignmentLineId: conflict.line.id, resolved: false } }), 1);
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: conflict.line.id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { action: "CONSIGNMENT_MISSING_LISTING_RESOLVED", entityId: conflict.line.id } }), 0);
} finally {
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Consignment missing-listing concurrency and rollback tests passed.");
