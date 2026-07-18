import assert from "node:assert/strict";
import type { Account, User } from "@prisma/client";
import { runCrossProcessResolutionRace } from "./helpers/cross-process-resolution-race";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture = createPhase736Database("missing-listing-resolution");
const { prisma } = await import("../lib/prisma");
const { importFlipkartOrderRows } = await import("../src/lib/marketplaces/flipkart/import");
const { normalizeListingIdentifier } = await import("../src/lib/marking/identifiers");
const { resolveMissingListing } = await import("../src/lib/catalog/missing-listing-resolution");

const FLIPKART_PROFILE_ID = "flipkart-form-profile";
const FLIPKART_PROFILE_FINGERPRINT = "phase736-flipkart-technical-v1";

type HeldOrderIssue = Awaited<ReturnType<typeof createHeldOrderIssue>>;
type ResolutionResult = Awaited<ReturnType<typeof resolveMissingListing>>;

async function createHeldOrderIssue(account: Account, user: User, suffix: string, sellerSku: string, fsn = `FSN-${suffix}`, quantity = 2) {
  await importFlipkartOrderRows({
    rows: [{
      "Shipment ID": `SHIP-${suffix}`,
      "ORDER ITEM ID": `ITEM-${suffix}`,
      "Order Id": `ORDER-${suffix}`,
      FSN: fsn,
      SKU: sellerSku,
      Product: `Held product ${suffix}`,
      Quantity: String(quantity),
      "Tracking ID": `TRACK-${suffix}`
    }],
    fileName: `held-${suffix}.csv`,
    account,
    user
  });
  const order = await prisma.order.findFirstOrThrow({ where: { accountId: account.id, orderItemId: `ITEM-${suffix}` } });
  const issue = await prisma.importRowIssue.findFirstOrThrow({
    where: { sourceId: order.id, issueType: "MISSING_FLIPKART_LISTING_MAPPING" }
  });
  assert.equal(await prisma.workTask.count({ where: { orderId: order.id } }), 0, "Held Orders must not leak into worker queues");
  return { order, issue, sellerSku, fsn };
}

function resolutionInput(
  held: HeldOrderIssue,
  actorUserId: string,
  accountId: string,
  clientRequestId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    actorUserId,
    accountId,
    issueId: held.issue.id,
    expectedIssueVersion: held.issue.version,
    clientRequestId,
    action: "CREATE_FULL" as const,
    profileId: FLIPKART_PROFILE_ID,
    expectedProfileTechnicalFingerprint: FLIPKART_PROFILE_FINGERPRINT,
    common: { productTitle: `Manual ${held.sellerSku}`, images: ["https://example.invalid/image.jpg"] },
    attributes: [{ technicalKey: "flipkart.material", displayLabel: "Material", value: "Synthetic", manualLocked: true }],
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

async function assertHeldResolutionRolledBack(held: HeldOrderIssue) {
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: held.order.accountId, sellerSkuId: held.sellerSku } }), 0);
  assert.equal((await prisma.importRowIssue.findUniqueOrThrow({ where: { id: held.issue.id } })).resolved, false);
  assert.equal(await prisma.workTask.count({ where: { orderId: held.order.id } }), 0);
  assert.equal(await prisma.workGroupMember.count({ where: { task: { orderId: held.order.id } } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { action: "MISSING_LISTING_RESOLVED", entityId: held.issue.id } }), 0);
}

try {
  const account = await prisma.account.create({ data: { id: "flipkart", name: "QA Flipkart", code: "QA-FK", marketplace: "FLIPKART" } });
  const otherAccount = await prisma.account.create({ data: { id: "flipkart-other", name: "QA Flipkart Other", code: "QA-FK-2", marketplace: "FLIPKART" } });
  const owner = await prisma.user.create({ data: { id: "owner", username: "phase736-resolution-owner", passwordHash: "x", name: "Owner", role: "OWNER" } });
  const otherOwner = await prisma.user.create({ data: { id: "other-owner", username: "phase736-resolution-other-owner", passwordHash: "x", name: "Other owner", role: "OWNER" } });
  const replayOwner = await prisma.user.create({
    data: {
      id: "replay-owner",
      username: "phase736-resolution-replay-owner",
      passwordHash: "x",
      name: "Replay owner",
      role: "OWNER",
      assignedAccounts: { connect: { id: account.id } }
    }
  });
  const manager = await prisma.user.create({
    data: {
      id: "import-manager",
      username: "phase736-resolution-manager",
      passwordHash: "x",
      name: "Import manager",
      role: "PICKER",
      canImportConsignments: true,
      assignedAccounts: { connect: { id: account.id } }
    }
  });

  const formSchema = {
    marketplace: "FLIPKART",
    templateKind: "FLIPKART_TEST_PROFILE",
    technicalHeaderFingerprint: FLIPKART_PROFILE_FINGERPRINT,
    humanHeaderFingerprint: "phase736-flipkart-human-v1",
    fields: [{
      canonicalKey: "flipkart.material",
      originalHeader: "Material",
      technicalKey: "flipkart.material",
      label: "Material",
      section: "Category Attributes",
      dataType: "text",
      maxLength: 200,
      marketplaceRequiredGuidance: false,
      locallyOptional: true,
      dynamicAttributeTarget: "flipkart.material"
    }],
    groups: ["Category Attributes"]
  };
  await prisma.marketplaceFileProfile.create({
    data: {
      id: FLIPKART_PROFILE_ID,
      accountId: account.id,
      marketplace: "FLIPKART",
      importPurpose: "PRODUCT_CATALOG",
      profileName: "Synthetic Flipkart form",
      headerFingerprint: "phase736-flipkart-profile-v1",
      fieldMappingJson: "{}",
      requiredFieldsJson: "[]",
      formSchemaJson: JSON.stringify(formSchema),
      technicalHeaderFingerprint: formSchema.technicalHeaderFingerprint,
      humanHeaderFingerprint: formSchema.humanHeaderFingerprint,
      templateKind: formSchema.templateKind,
      active: true
    }
  });

  // Identical concurrent submissions must converge on one durable mutation.
  const concurrent = await createHeldOrderIssue(account, owner, "CONCURRENT", "SKU-CONCURRENT", "FSN-CONCURRENT", 2);
  const concurrentInput = resolutionInput(concurrent, owner.id, account.id, "resolve-concurrent");
  const [first, second] = await Promise.all([
    resolveMissingListing(concurrentInput),
    resolveMissingListing(concurrentInput)
  ]);
  assert.equal(first.listingId, second.listingId);
  assert.equal(first.taskId, second.taskId);
  assert.ok(first.taskId, "Resolving a held Order must release exactly one Pick task");
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: account.id, sellerSkuId: concurrent.sellerSku } }), 1);
  assert.equal(await prisma.marketplaceListingIdentifier.count({
    where: { marketplaceListingId: first.listingId, identifierType: { in: ["SELLER_SKU", "FSN"] } }
  }), 2, "Seller SKU and FSN identifiers commit with the listing");
  assert.equal(await prisma.marketplaceListingAttribute.count({ where: { marketplaceListingId: first.listingId } }), 1);
  assert.equal(await prisma.workflowActionReceipt.count({
    where: { accountId: account.id, actorUserId: owner.id, requestKind: "MISSING_LISTING_RESOLUTION", clientRequestId: concurrentInput.clientRequestId, status: "COMPLETED" }
  }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "MISSING_LISTING_RESOLVED", entityId: concurrent.issue.id } }), 1);
  assert.equal(await prisma.workTask.count({ where: { orderId: concurrent.order.id, stage: "PICK" } }), 1);
  assert.equal(await prisma.workGroupMember.count({ where: { taskId: first.taskId! } }), 1, "Released task and projection membership must be visible together");
  const projection = await prisma.workGroupProjection.findFirstOrThrow({ where: { accountId: account.id, sourceType: "ORDER", stage: "PICK", members: { some: { taskId: first.taskId! } } } });
  assert.equal(projection.requiredQuantity, concurrent.order.qty);
  assert.equal(await prisma.workChangeEvent.count({ where: { accountId: account.id, eventType: "MISSING_LISTING_RESOLVED", entityId: concurrent.order.id } }), 1);

  // Separate runtimes bypass the in-memory request gate and race only through the durable receipt/database guards.
  const crossProcess = await createHeldOrderIssue(account, owner, "CROSS-PROCESS", "SKU-CROSS-PROCESS", "FSN-CROSS-PROCESS", 3);
  const crossProcessInput = resolutionInput(crossProcess, owner.id, account.id, "resolve-cross-process");
  const childResponses = await runCrossProcessResolutionRace<ResolutionResult>("ORDER", crossProcessInput);
  const childResults = childResponses.map((response) => {
    if (!response.ok) assert.fail(`Cross-process resolution returned a controlled failure instead of replaying success: ${response.error}`);
    return response.result;
  });
  assert.equal(childResults[0].listingId, childResults[1].listingId);
  assert.equal(childResults[0].taskId, childResults[1].taskId);
  assert.deepEqual(childResults.map((result) => result.idempotent).sort(), [false, true], "One process commits and the other replays the durable result");
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: account.id, sellerSkuId: crossProcess.sellerSku } }), 1);
  assert.equal(await prisma.workflowActionReceipt.count({
    where: { accountId: account.id, actorUserId: owner.id, requestKind: "MISSING_LISTING_RESOLUTION", clientRequestId: crossProcessInput.clientRequestId, status: "COMPLETED" }
  }), 1);
  assert.equal(await prisma.workTask.count({ where: { orderId: crossProcess.order.id, stage: "PICK" } }), 1);
  assert.equal(await prisma.workGroupMember.count({ where: { taskId: childResults[0].taskId! } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "MISSING_LISTING_RESOLVED", entityId: crossProcess.issue.id } }), 1);
  assert.equal(await prisma.workChangeEvent.count({ where: { accountId: account.id, eventType: "MISSING_LISTING_RESOLVED", entityId: crossProcess.order.id } }), 1);

  // LINK_EXISTING accepts only an exact listing in the selected account and marketplace.
  const linkExisting = await createHeldOrderIssue(account, owner, "LINK-EXISTING", "SKU-LINK-EXISTING", "FSN-LINK-EXISTING", 4);
  const sameAccountListing = await prisma.marketplaceListing.create({
    data: {
      accountId: account.id,
      marketplace: "FLIPKART",
      sellerSkuId: linkExisting.sellerSku,
      sku: linkExisting.sellerSku,
      productTitle: "Existing same-account listing"
    }
  });
  const linkResult = await resolveMissingListing(resolutionInput(linkExisting, owner.id, account.id, "resolve-link-existing", {
    action: "LINK_EXISTING" as const,
    listingId: sameAccountListing.id,
    common: undefined,
    attributes: []
  }));
  assert.equal(linkResult.listingId, sameAccountListing.id);
  assert.ok(linkResult.taskId);
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: account.id, sellerSkuId: linkExisting.sellerSku } }), 1);
  assert.equal(await prisma.marketplaceListingIdentifier.count({
    where: { marketplaceListingId: sameAccountListing.id, identifierType: { in: ["SELLER_SKU", "FSN"] } }
  }), 2);
  assert.equal((await prisma.importRowIssue.findUniqueOrThrow({ where: { id: linkExisting.issue.id } })).resolved, true);
  assert.equal(await prisma.workTask.count({ where: { orderId: linkExisting.order.id, stage: "PICK" } }), 1);
  assert.equal(await prisma.workGroupMember.count({ where: { taskId: linkResult.taskId! } }), 1);

  const foreignLink = await createHeldOrderIssue(account, owner, "FOREIGN-LINK", "SKU-FOREIGN-LINK", "FSN-FOREIGN-LINK");
  const foreignListing = await prisma.marketplaceListing.create({
    data: {
      accountId: otherAccount.id,
      marketplace: "FLIPKART",
      sellerSkuId: foreignLink.sellerSku,
      sku: foreignLink.sellerSku,
      productTitle: "Foreign account listing"
    }
  });
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(foreignLink, owner.id, account.id, "resolve-foreign-link", {
      action: "LINK_EXISTING" as const,
      listingId: foreignListing.id,
      common: undefined,
      attributes: []
    })),
    /not available|selected listing|account|marketplace/i
  );
  await assertHeldResolutionRolledBack(foreignLink);
  assert.equal(await prisma.marketplaceListing.count({ where: { id: foreignListing.id, accountId: otherAccount.id } }), 1);

  // CREATE_MINIMAL releases work with protected identity only and no dynamic enrichment.
  const minimal = await createHeldOrderIssue(account, owner, "CREATE-MINIMAL", "SKU-CREATE-MINIMAL", "FSN-CREATE-MINIMAL", 5);
  const minimalResult = await resolveMissingListing(resolutionInput(minimal, owner.id, account.id, "resolve-create-minimal", {
    action: "CREATE_MINIMAL" as const,
    common: undefined,
    attributes: []
  }));
  const minimalListing = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: minimalResult.listingId } });
  assert.equal(minimalListing.accountId, account.id);
  assert.equal(minimalListing.sellerSkuId, minimal.sellerSku);
  assert.equal(minimalListing.listingStatus, "NEEDS_ENRICHMENT");
  assert.equal(minimalListing.productTitle, null);
  assert.equal(await prisma.marketplaceListingAttribute.count({ where: { marketplaceListingId: minimalListing.id } }), 0);
  assert.equal(await prisma.workTask.count({ where: { orderId: minimal.order.id, stage: "PICK" } }), 1);
  assert.equal((await prisma.importRowIssue.findUniqueOrThrow({ where: { id: minimal.issue.id } })).resolved, true);

  await expectControlledRejection(
    () => resolveMissingListing({ ...concurrentInput, common: { productTitle: "Changed replay" } }),
    /different payload/i
  );

  // A receipt is actor-scoped: another actor cannot retrieve the owner's result.
  await expectControlledRejection(
    () => resolveMissingListing({ ...concurrentInput, actorUserId: otherOwner.id }),
    /already resolved|changed|unavailable|refresh/i
  );
  assert.equal(await prisma.workflowActionReceipt.count({ where: { actorUserId: otherOwner.id, clientRequestId: concurrentInput.clientRequestId } }), 0);

  // Import permission alone cannot create Product Inventory or release held Order work.
  const access = await createHeldOrderIssue(account, manager, "ACCESS", "SKU-ACCESS");
  const accessInput = resolutionInput(access, manager.id, account.id, "resolve-access");
  await expectControlledRejection(() => resolveMissingListing(accessInput), /owner access/i);
  await assertHeldResolutionRolledBack(access);
  assert.equal(await prisma.workflowActionReceipt.count({ where: { actorUserId: manager.id, clientRequestId: accessInput.clientRequestId } }), 0);

  // Current authorization is rechecked before replaying a completed owner result.
  const replayAccess = await createHeldOrderIssue(account, replayOwner, "REPLAY-ACCESS", "SKU-REPLAY-ACCESS");
  const replayAccessInput = resolutionInput(replayAccess, replayOwner.id, account.id, "resolve-replay-access");
  await resolveMissingListing(replayAccessInput);
  await prisma.user.update({
    where: { id: replayOwner.id },
    data: { role: "PICKER", assignedAccounts: { disconnect: { id: account.id } } }
  });
  await expectControlledRejection(() => resolveMissingListing(replayAccessInput), /not assigned|access|unavailable/i);

  // A second browser tab with a fresh request ID receives a controlled stale/resolved response.
  const stale = await createHeldOrderIssue(account, owner, "STALE", "SKU-STALE");
  const staleInput = resolutionInput(stale, owner.id, account.id, "resolve-stale-first");
  await resolveMissingListing(staleInput);
  await expectControlledRejection(
    () => resolveMissingListing({ ...staleInput, clientRequestId: "resolve-stale-second" }),
    /already resolved|changed|refresh/i
  );

  // The selected profile is version-bound; a form rendered from an older schema cannot save.
  const changedProfile = await createHeldOrderIssue(account, owner, "CHANGED-PROFILE", "SKU-CHANGED-PROFILE");
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(changedProfile, owner.id, account.id, "resolve-changed-profile", {
      expectedProfileTechnicalFingerprint: "stale-technical-fingerprint"
    })),
    /template changed|refresh/i
  );
  await assertHeldResolutionRolledBack(changedProfile);

  // A syntactically safe key is still rejected when it is absent from the selected profile.
  const arbitraryAttribute = await createHeldOrderIssue(account, owner, "ARBITRARY-ATTRIBUTE", "SKU-ARBITRARY-ATTRIBUTE");
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(arbitraryAttribute, owner.id, account.id, "resolve-arbitrary-attribute", {
      attributes: [{ technicalKey: "flipkart.unapproved_field", displayLabel: "Unapproved", value: "x", manualLocked: true }]
    })),
    /not part of the selected marketplace template/i
  );
  await assertHeldResolutionRolledBack(arbitraryAttribute);

  // Duplicate technical keys and object/formula payloads are not persisted as dynamic values.
  const duplicateAttribute = await createHeldOrderIssue(account, owner, "DUPLICATE-ATTRIBUTE", "SKU-DUPLICATE-ATTRIBUTE");
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(duplicateAttribute, owner.id, account.id, "resolve-duplicate-attribute", {
      attributes: [
        { technicalKey: "flipkart.material", displayLabel: "Material", value: "First", manualLocked: true },
        { technicalKey: "flipkart.material", displayLabel: "Material", value: "Second", manualLocked: true }
      ]
    })),
    /more than once|duplicate/i
  );
  await assertHeldResolutionRolledBack(duplicateAttribute);

  const objectAttribute = await createHeldOrderIssue(account, owner, "OBJECT-ATTRIBUTE", "SKU-OBJECT-ATTRIBUTE");
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(objectAttribute, owner.id, account.id, "resolve-object-attribute", {
      attributes: [{ technicalKey: "flipkart.material", displayLabel: "Material", value: { formula: "=1+1" }, manualLocked: true }]
    })),
    /plain scalar|value/i
  );
  await assertHeldResolutionRolledBack(objectAttribute);

  // Invalid dynamic attributes must not leave a listing, issue resolution, task, projection, or audit behind.
  const invalidAttribute = await createHeldOrderIssue(account, owner, "BAD-ATTRIBUTE", "SKU-BAD-ATTRIBUTE");
  const invalidAttributeInput = resolutionInput(invalidAttribute, owner.id, account.id, "resolve-bad-attribute", {
    attributes: [{ technicalKey: "flipkart.<script>", displayLabel: "Unsafe", value: "x", manualLocked: true }]
  });
  await expectControlledRejection(() => resolveMissingListing(invalidAttributeInput), /attribute|unsupported|profile|key/i);
  await assertHeldResolutionRolledBack(invalidAttribute);

  // A visually blank optional price remains absent instead of becoming a
  // manually locked zero through JavaScript's Number(" ") coercion.
  const blankPrice = await createHeldOrderIssue(account, owner, "BLANK-PRICE", "SKU-BLANK-PRICE");
  const blankPriceResult = await resolveMissingListing(resolutionInput(blankPrice, owner.id, account.id, "resolve-blank-price", {
    common: { productTitle: "Blank price product", sellingPrice: "   ", images: [] },
    attributes: []
  }));
  const blankPriceListing = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: blankPriceResult.listingId } });
  assert.equal(blankPriceListing.sellingPrice, null);
  assert.doesNotMatch(blankPriceListing.fieldProvenanceJson ?? "", /sellingPrice/, "Blank price must not create manual provenance or a lock");

  // HTTP credentials are private data and must not be retained in listing or
  // dynamic URL fields. A rejected save leaves the held workflow untouched.
  const credentialUrl = await createHeldOrderIssue(account, owner, "CREDENTIAL-URL", "SKU-CREDENTIAL-URL");
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(credentialUrl, owner.id, account.id, "resolve-credential-url", {
      common: { productTitle: "Credential URL product", images: ["https://user:secret@example.invalid/image.jpg"] },
      attributes: []
    })),
    /embedded credentials|credential/i
  );
  await assertHeldResolutionRolledBack(credentialUrl);

  // An account-scoped identifier conflict rolls back every domain write.
  const conflictOwner = await prisma.marketplaceListing.create({
    data: { accountId: account.id, marketplace: "FLIPKART", sellerSkuId: "SKU-CONFLICT-OWNER", sku: "SKU-CONFLICT-OWNER", fsn: "FSN-CONFLICT" }
  });
  await prisma.marketplaceListingIdentifier.create({
    data: {
      accountId: account.id,
      marketplaceListingId: conflictOwner.id,
      marketplace: "FLIPKART",
      identifierType: "FSN",
      rawValue: "FSN-CONFLICT",
      normalizedValue: normalizeListingIdentifier("FSN", "FSN-CONFLICT")!,
      source: "TEST"
    }
  });
  const identifierConflict = await createHeldOrderIssue(account, owner, "IDENTIFIER-CONFLICT", "SKU-IDENTIFIER-CONFLICT", "FSN-NEW-CONFLICT");
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(identifierConflict, owner.id, account.id, "resolve-identifier-conflict", {
      attributes: [],
      identifiers: [{ type: "FSN" as const, value: "FSN-CONFLICT" }]
    })),
    /FSN|identifier|another listing|conflict/i
  );
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId: account.id, sellerSkuId: identifierConflict.sellerSku } }), 0);
  assert.equal((await prisma.importRowIssue.findUniqueOrThrow({ where: { id: identifierConflict.issue.id } })).resolved, false);
  assert.equal(await prisma.workTask.count({ where: { orderId: identifierConflict.order.id } }), 0);

  // The same normalized identifier in another account remains isolated.
  const isolatedOtherListing = await prisma.marketplaceListing.create({
    data: { accountId: otherAccount.id, marketplace: "FLIPKART", sellerSkuId: "SKU-OTHER-ACCOUNT", sku: "SKU-OTHER-ACCOUNT", fsn: "FSN-ISOLATED" }
  });
  await prisma.marketplaceListingIdentifier.create({
    data: {
      accountId: otherAccount.id,
      marketplaceListingId: isolatedOtherListing.id,
      marketplace: "FLIPKART",
      identifierType: "FSN",
      rawValue: "FSN-ISOLATED",
      normalizedValue: normalizeListingIdentifier("FSN", "FSN-ISOLATED")!,
      source: "TEST"
    }
  });
  const isolated = await createHeldOrderIssue(account, owner, "ISOLATED", "SKU-ISOLATED", "FSN-ISOLATED");
  const isolatedResult = await resolveMissingListing(resolutionInput(isolated, owner.id, account.id, "resolve-isolated", { attributes: [] }));
  assert.notEqual(isolatedResult.listingId, isolatedOtherListing.id);
  assert.equal(await prisma.marketplaceListingIdentifier.count({ where: { identifierType: "FSN", normalizedValue: normalizeListingIdentifier("FSN", "FSN-ISOLATED")! } }), 2);

  // A real import with multiple exact registry matches remains held until the owner
  // selects one of the exact account-scoped candidates captured by the import.
  const ambiguousIdentity = "SKU--AMBIGUOUS";
  const ambiguousCandidateA = await prisma.marketplaceListing.create({
    data: { accountId: account.id, marketplace: "FLIPKART", sellerSkuId: "CATALOG-CANDIDATE-A", sku: "CATALOG-CANDIDATE-A", productTitle: "Candidate A" }
  });
  const ambiguousCandidateB = await prisma.marketplaceListing.create({
    data: { accountId: account.id, marketplace: "FLIPKART", sellerSkuId: "CATALOG-CANDIDATE-B", sku: "CATALOG-CANDIDATE-B", productTitle: "Candidate B" }
  });
  for (const listingId of [ambiguousCandidateA.id, ambiguousCandidateB.id]) {
    await prisma.marketplaceListingIdentifier.create({
      data: {
        accountId: account.id,
        marketplaceListingId: listingId,
        marketplace: "FLIPKART",
        identifierType: "SELLER_SKU",
        rawValue: ambiguousIdentity,
        normalizedValue: normalizeListingIdentifier("SELLER_SKU", ambiguousIdentity)!,
        source: "TEST"
      }
    });
  }
  await importFlipkartOrderRows({
    rows: [{
      "Shipment ID": "SHIP-AMBIGUOUS",
      "ORDER ITEM ID": "ITEM-AMBIGUOUS",
      "Order Id": "ORDER-AMBIGUOUS",
      FSN: "FSN-AMBIGUOUS",
      SKU: ambiguousIdentity,
      Product: "Ambiguous catalog product",
      Quantity: "3",
      "Tracking ID": "TRACK-AMBIGUOUS"
    }],
    fileName: "ambiguous.csv",
    account,
    user: owner
  });
  const ambiguousOrder = await prisma.order.findFirstOrThrow({ where: { accountId: account.id, orderItemId: "ITEM-AMBIGUOUS" } });
  const ambiguousIssue = await prisma.importRowIssue.findFirstOrThrow({ where: { sourceId: ambiguousOrder.id, issueType: "AMBIGUOUS_LISTING", resolved: false } });
  const ambiguousSafe = JSON.parse(ambiguousIssue.safeDataJson ?? "{}") as { sellerSku?: string; listingIds?: string[] };
  assert.equal(ambiguousSafe.sellerSku, ambiguousIdentity);
  assert.deepEqual(new Set(ambiguousSafe.listingIds), new Set([ambiguousCandidateA.id, ambiguousCandidateB.id]));
  assert.equal(await prisma.workTask.count({ where: { orderId: ambiguousOrder.id } }), 0);

  const unrelatedCandidate = await prisma.marketplaceListing.create({
    data: { accountId: account.id, marketplace: "FLIPKART", sellerSkuId: "UNRELATED-CANDIDATE", sku: "UNRELATED-CANDIDATE" }
  });
  const ambiguousHeld = { order: ambiguousOrder, issue: ambiguousIssue, sellerSku: ambiguousIdentity, fsn: "FSN-AMBIGUOUS" };
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(ambiguousHeld, owner.id, account.id, "resolve-ambiguous-unrelated", {
      action: "LINK_EXISTING" as const,
      listingId: unrelatedCandidate.id,
      common: undefined,
      attributes: []
    })),
    /exact saved candidates|exact saved candidate/i
  );
  await expectControlledRejection(
    () => resolveMissingListing(resolutionInput(ambiguousHeld, owner.id, account.id, "resolve-ambiguous-create", {
      action: "CREATE_MINIMAL" as const,
      common: undefined,
      attributes: []
    })),
    /exact saved candidate|ambiguous/i
  );
  await expectControlledRejection(
    () => resolveMissingListing({
      ...resolutionInput(ambiguousHeld, owner.id, account.id, "resolve-ambiguous-stale", {
        action: "LINK_EXISTING" as const,
        listingId: ambiguousCandidateA.id,
        common: undefined,
        attributes: []
      }),
      expectedIssueVersion: ambiguousIssue.version + 1
    }),
    /changed|refresh/i
  );
  const ambiguousResult = await resolveMissingListing(resolutionInput(ambiguousHeld, owner.id, account.id, "resolve-ambiguous-exact", {
    action: "LINK_EXISTING" as const,
    listingId: ambiguousCandidateB.id,
    common: undefined,
    attributes: []
  }));
  assert.equal(ambiguousResult.listingId, ambiguousCandidateB.id);
  assert.ok(ambiguousResult.taskId);
  assert.equal(await prisma.workTask.count({ where: { orderId: ambiguousOrder.id, stage: "PICK" } }), 1);
  assert.equal(await prisma.workGroupMember.count({ where: { taskId: ambiguousResult.taskId! } }), 1);
  assert.equal(await prisma.workChangeEvent.count({ where: { accountId: account.id, eventType: "MISSING_LISTING_RESOLVED", entityId: ambiguousOrder.id } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "MISSING_LISTING_RESOLVED", entityId: ambiguousIssue.id } }), 1);

  // Repeated punctuation is operational identity, not formatting noise.
  const punctuation = await createHeldOrderIssue(account, owner, "PUNCTUATION", "SKU--PUNCT__EXACT", "FSN-PUNCTUATION", 8);
  const punctuationSafe = JSON.parse(punctuation.issue.safeDataJson ?? "{}") as { sellerSku?: string };
  assert.equal(punctuation.order.sku, "SKU--PUNCT__EXACT");
  assert.equal(punctuationSafe.sellerSku, "SKU--PUNCT__EXACT");
  const punctuationResult = await resolveMissingListing(resolutionInput(punctuation, owner.id, account.id, "resolve-punctuation", {
    action: "CREATE_MINIMAL" as const,
    common: undefined,
    attributes: []
  }));
  const punctuationListing = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: punctuationResult.listingId } });
  const punctuationIdentifier = await prisma.marketplaceListingIdentifier.findFirstOrThrow({
    where: { marketplaceListingId: punctuationResult.listingId, identifierType: "SELLER_SKU" }
  });
  const punctuationTask = await prisma.workTask.findUniqueOrThrow({ where: { id: punctuationResult.taskId! } });
  assert.equal(punctuationListing.sellerSkuId, "SKU--PUNCT__EXACT");
  assert.equal(punctuationIdentifier.rawValue, "SKU--PUNCT__EXACT");
  assert.equal((JSON.parse(punctuationTask.workCardSnapshotJson ?? "{}") as { sellerSku?: string }).sellerSku, "SKU--PUNCT__EXACT");
} finally {
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Missing-listing resolution concurrency and rollback tests passed.");
