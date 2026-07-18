import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture = createPhase736Database("manual-listing");
const { prisma } = await import("../lib/prisma");
const {
  createManualMarketplaceListing,
  updateManualMarketplaceListing,
  updateManualMarketplaceListingLocks
} = await import("../src/lib/catalog/manual-listing");

const ownerId = "manual-owner";
const accountId = "manual-account";
const otherAccountId = "manual-other-account";

function common(overrides: Record<string, unknown> = {}) {
  return {
    productTitle: "Synthetic manual product",
    brand: "Synthetic Brand",
    category: "Synthetic Category",
    subCategory: "Synthetic Subcategory",
    listingStatus: "ACTIVE",
    mrp: "125.50",
    sellingPrice: "99.25",
    mainImageUrl: "https://example.invalid/manual-product.jpg",
    description: "Synthetic catalog data only.",
    ...overrides
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: ownerId,
    accountId,
    clientRequestId: `manual-create-${crypto.randomUUID()}`,
    sellerSku: "SKU.MANUAL-01/A",
    common: common(),
    manualLocked: true,
    ...overrides
  };
}

function assertControlledError(reason: unknown, message: string) {
  const rendered = reason instanceof Error ? reason.message : String(reason);
  assert.doesNotMatch(rendered, /PrismaClient|P2002|P2034|Unique constraint failed|database is locked/i, message);
}

function assertManualMetadata(listing: { fieldProvenanceJson: string | null; manualLocksJson: string | null }) {
  const provenance = JSON.parse(listing.fieldProvenanceJson ?? "{}") as Record<string, unknown>;
  assert.ok(provenance.productTitle, "Manual Product Title provenance is retained.");
  const locks = JSON.parse(listing.manualLocksJson ?? "[]") as string[] | Record<string, boolean>;
  assert.ok(
    Array.isArray(locks) ? locks.includes("productTitle") : locks.productTitle === true,
    "Manual Product Title remains locked against automated refreshes."
  );
}

type ManualListingChildResponse =
  | { ok: true; result: { listingId: string; updatedAt: string; idempotent: boolean } }
  | { ok: false; error: string };

function spawnManualListingChild() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", resolve("tests/helpers/manual-listing-child.ts")],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  let readySettled = false;
  let resolveReady!: () => void;
  let rejectReady!: (reason: Error) => void;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const timeout = setTimeout(() => child.kill(), 20_000);

  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (!readySettled && /(?:^|\r?\n)READY\r?\n/.test(stdout)) {
      readySettled = true;
      resolveReady();
    }
  });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.on("error", (error) => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
  });

  const result = new Promise<ManualListingChildResponse>((resolvePromise, rejectPromise) => {
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (!readySettled) {
        readySettled = true;
        rejectReady(new Error(`Manual-listing child exited before ready (${code ?? signal ?? "unknown"}): ${stderr || stdout}`));
      }
      const line = stdout.match(/(?:^|\r?\n)RESULT (.+)(?:\r?\n|$)/)?.[1];
      if (code !== 0 || !line) {
        rejectPromise(new Error(`Manual-listing child failed (${code ?? signal ?? "unknown"}): ${stderr || stdout}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(line) as ManualListingChildResponse);
      } catch (error) {
        rejectPromise(new Error(`Manual-listing child returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });

  return {
    ready,
    result,
    submit(input: ReturnType<typeof createInput>) {
      child.stdin.end(JSON.stringify(input));
    }
  };
}

try {
  await prisma.account.createMany({
    data: [
      { id: accountId, name: "Manual Catalog A", code: "MAN-A", marketplace: "FLIPKART", active: true },
      { id: otherAccountId, name: "Manual Catalog B", code: "MAN-B", marketplace: "FLIPKART", active: true }
    ]
  });
  await prisma.user.createMany({
    data: [
      { id: ownerId, username: "phase736-manual-owner", passwordHash: "x", name: "Owner", role: "OWNER", active: true },
      { id: "manual-worker", username: "phase736-manual-worker", passwordHash: "x", name: "Worker", role: "PICKER", active: true, accountId, canPick: true }
    ]
  });

  const firstInput = createInput({
    clientRequestId: "manual-create-first",
    sellerSku: "  SKU.MANUAL-01/A  ",
    common: common({ fsn: "FSN-MANUAL-01", listingId: "LID-MANUAL-01" })
  });
  await createManualMarketplaceListing(firstInput);
  const first = await prisma.marketplaceListing.findFirstOrThrow({
    where: { accountId, sellerSkuId: "SKU.MANUAL-01/A" },
    include: { identifiers: { where: { active: true } } }
  });
  assert.equal(first.marketplace, "FLIPKART", "Marketplace is derived from the Account.");
  assert.equal(first.productTitle, "Synthetic manual product");
  assert.equal(first.mrp, 125.5);
  assert.equal(first.sellingPrice, 99.25);
  assertManualMetadata(first);
  const firstTypes = new Set(first.identifiers.map((row) => row.identifierType));
  assert.ok(firstTypes.has("SELLER_SKU"), "Seller SKU identifier is committed with the listing.");
  assert.ok(firstTypes.has("FSN"), "Optional FSN identifier is committed with the listing.");
  assert.ok(firstTypes.has("LISTING_ID"), "Optional Listing ID identifier is committed with the listing.");
  const sellerIdentifier = first.identifiers.find((row) => row.identifierType === "SELLER_SKU");
  assert.equal(sellerIdentifier?.rawValue, "SKU.MANUAL-01/A");
  assert.equal(sellerIdentifier?.normalizedValue, "SKU.MANUAL-01/A");
  assert.equal(await prisma.auditLog.count({ where: { accountId, userId: ownerId, entityType: "MarketplaceListing", entityId: first.id } }), 1);

  await createManualMarketplaceListing(createInput({
    actorUserId: ownerId,
    accountId: otherAccountId,
    clientRequestId: "manual-other-account",
    sellerSku: "SKU.MANUAL-01/A",
    common: common({ fsn: "FSN-MANUAL-01", listingId: "LID-MANUAL-01" })
  }));
  assert.equal(
    await prisma.marketplaceListing.count({ where: { sellerSkuId: "SKU.MANUAL-01/A" } }),
    2,
    "The same identifiers remain isolated between Accounts."
  );

  const auditBeforeIdentifierConflict = await prisma.auditLog.count({ where: { accountId } });
  await assert.rejects(
    () => createManualMarketplaceListing(createInput({
      clientRequestId: "manual-fsn-conflict",
      sellerSku: "SKU-FSN-CONFLICT",
      common: common({ fsn: "FSN-MANUAL-01" })
    })),
    (error) => {
      assertControlledError(error, "Identifier conflicts must not expose database errors.");
      return /identifier|FSN|already|conflict/i.test(error instanceof Error ? error.message : String(error));
    }
  );
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId, sellerSkuId: "SKU-FSN-CONFLICT" } }), 0, "Identifier failure rolls back listing creation.");
  assert.equal(await prisma.auditLog.count({ where: { accountId } }), auditBeforeIdentifierConflict, "A rolled-back create writes no audit success.");

  const doubleInput = createInput({ clientRequestId: "manual-double-submit", sellerSku: "SKU-DOUBLE", common: common({ fsn: "FSN-DOUBLE" }) });
  const doubleFirst = await createManualMarketplaceListing(doubleInput);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const doubleReplay = await createManualMarketplaceListing(doubleInput);
  assert.equal(doubleReplay.listingId, doubleFirst.listingId, "A delayed repeated request returns the original listing result.");
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId, sellerSkuId: "SKU-DOUBLE" } }), 1, "A sequential double-submit creates one listing.");
  const doubleListing = await prisma.marketplaceListing.findFirstOrThrow({ where: { accountId, sellerSkuId: "SKU-DOUBLE" } });
  assert.equal(await prisma.auditLog.count({ where: { accountId, entityId: doubleListing.id } }), 1, "A replay does not duplicate audit history.");
  await assert.rejects(
    () => createManualMarketplaceListing({ ...doubleInput, common: common({ fsn: "FSN-DOUBLE", productTitle: "Changed duplicate payload" }) }),
    /different|conflict|already exists/i,
    "A duplicate Seller SKU with changed values is not treated as an idempotent success."
  );
  await assert.rejects(
    () => createManualMarketplaceListing({ ...doubleInput, manualLocked: false }),
    /different|conflict|already exists/i,
    "Changing manual-lock intent is not treated as an identical replay."
  );

  await createManualMarketplaceListing(createInput({ clientRequestId: "manual-punctuation-double", sellerSku: "SKU--P" }));
  await createManualMarketplaceListing(createInput({ clientRequestId: "manual-punctuation-single", sellerSku: "SKU-P" }));
  const punctuationListings = await prisma.marketplaceListing.findMany({
    where: { accountId, sellerSkuId: { in: ["SKU--P", "SKU-P"] } },
    include: { identifiers: { where: { identifierType: "SELLER_SKU", active: true } } },
    orderBy: { sellerSkuId: "asc" }
  });
  assert.equal(punctuationListings.length, 2, "Meaningfully different Seller SKU punctuation remains distinct.");
  assert.deepEqual(
    new Set(punctuationListings.flatMap((listing) => listing.identifiers.map((row) => row.normalizedValue))),
    new Set(["SKU--P", "SKU-P"]),
    "Identifier normalization does not collapse distinct punctuation."
  );

  const concurrentInput = createInput({ clientRequestId: "manual-concurrent-identical", sellerSku: "SKU-CONCURRENT", common: common({ listingId: "LID-CONCURRENT" }) });
  const identicalResults = await Promise.allSettled([
    createManualMarketplaceListing(concurrentInput),
    createManualMarketplaceListing(concurrentInput)
  ]);
  for (const result of identicalResults) {
    if (result.status === "rejected") assertControlledError(result.reason, "Identical concurrent creates must not expose database errors.");
  }
  assert.ok(identicalResults.every((result) => result.status === "fulfilled"), "Identical concurrent submissions return success/replay results.");
  const concurrentResultIds = identicalResults.flatMap((result) => result.status === "fulfilled" ? [result.value.listingId] : []);
  assert.equal(new Set(concurrentResultIds).size, 1, "Concurrent replays return the same listing result.");
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId, sellerSkuId: "SKU-CONCURRENT" } }), 1, "Concurrent identical creates commit one listing.");
  const concurrentListing = await prisma.marketplaceListing.findFirstOrThrow({ where: { accountId, sellerSkuId: "SKU-CONCURRENT" } });
  const concurrentIdentifiers = await prisma.marketplaceListingIdentifier.findMany({ where: { marketplaceListingId: concurrentListing.id, active: true } });
  assert.ok(concurrentIdentifiers.some((row) => row.identifierType === "SELLER_SKU"), "Concurrent create commits its Seller SKU identifier.");
  assert.ok(concurrentIdentifiers.some((row) => row.identifierType === "LISTING_ID"), "Concurrent create commits its optional Listing ID identifier.");
  assert.equal(
    new Set(concurrentIdentifiers.map((row) => `${row.identifierType}:${row.normalizedValue}`)).size,
    concurrentIdentifiers.length,
    "Concurrent create leaves one non-duplicated identifier set."
  );
  assert.equal(await prisma.auditLog.count({ where: { accountId, entityId: concurrentListing.id } }), 1, "Concurrent create writes one audit record.");

  const crossProcessInput = createInput({
    clientRequestId: "manual-cross-process-identical",
    sellerSku: "SKU-CROSS-PROCESS",
    common: common({ fsn: "FSN-CROSS-PROCESS", listingId: "LID-CROSS-PROCESS" })
  });
  const crossProcessChildren = [spawnManualListingChild(), spawnManualListingChild()];
  await Promise.all(crossProcessChildren.map((child) => child.ready));
  for (const child of crossProcessChildren) child.submit(crossProcessInput);
  const crossProcessResponses = await Promise.all(crossProcessChildren.map((child) => child.result));
  for (const response of crossProcessResponses) {
    if (!response.ok) assertControlledError(response.error, "Cross-process identical creates must not expose database errors.");
  }
  assert.ok(crossProcessResponses.every((response) => response.ok), "Both cross-process identical submissions return success/replay results.");
  const crossProcessResultIds = crossProcessResponses.flatMap((response) => response.ok ? [response.result.listingId] : []);
  assert.equal(new Set(crossProcessResultIds).size, 1, "Cross-process replays return the same listing result.");
  assert.equal(
    await prisma.marketplaceListing.count({ where: { accountId, sellerSkuId: "SKU-CROSS-PROCESS" } }),
    1,
    "Cross-process identical creates commit one listing."
  );
  const crossProcessListing = await prisma.marketplaceListing.findFirstOrThrow({
    where: { accountId, sellerSkuId: "SKU-CROSS-PROCESS" },
    include: { identifiers: { where: { active: true } } }
  });
  assert.deepEqual(
    new Set(crossProcessListing.identifiers.map((row) => `${row.identifierType}:${row.normalizedValue}`)),
    new Set([
      "SELLER_SKU:SKU-CROSS-PROCESS",
      "INTERNAL_SKU:SKU-CROSS-PROCESS",
      "FSN:FSN-CROSS-PROCESS",
      "LISTING_ID:LID-CROSS-PROCESS"
    ]),
    "Cross-process create commits one coherent identifier set."
  );
  assert.equal(
    await prisma.auditLog.count({ where: { accountId, entityId: crossProcessListing.id, action: "MANUAL_LISTING_CREATED" } }),
    1,
    "Cross-process create writes one coherent audit record."
  );

  const conflictingResults = await Promise.allSettled([
    createManualMarketplaceListing(createInput({ clientRequestId: "manual-conflicting-a", sellerSku: "SKU-RACE-CONFLICT", common: common({ productTitle: "Race value A" }) })),
    createManualMarketplaceListing(createInput({ clientRequestId: "manual-conflicting-b", sellerSku: "SKU-RACE-CONFLICT", common: common({ productTitle: "Race value B" }) }))
  ]);
  assert.equal(conflictingResults.filter((result) => result.status === "fulfilled").length, 1, "Only one conflicting concurrent create succeeds.");
  assert.equal(conflictingResults.filter((result) => result.status === "rejected").length, 1, "The conflicting concurrent create is rejected.");
  for (const result of conflictingResults) if (result.status === "rejected") assertControlledError(result.reason, "A uniqueness race must return a controlled conflict.");
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId, sellerSkuId: "SKU-RACE-CONFLICT" } }), 1);

  const editableInput = createInput({ clientRequestId: "manual-editable-create", sellerSku: "SKU-EDITABLE", common: common({ fsn: "FSN-EDITABLE-OLD" }) });
  await createManualMarketplaceListing(editableInput);
  const editable = await prisma.marketplaceListing.findFirstOrThrow({ where: { accountId, sellerSkuId: "SKU-EDITABLE" } });
  const originalVersion = editable.updatedAt.toISOString();
  await updateManualMarketplaceListing({
    actorUserId: ownerId,
    accountId,
    clientRequestId: "manual-edit-success",
    marketplaceListingId: editable.id,
    expectedUpdatedAt: originalVersion,
    sellerSku: editable.sellerSkuId,
    common: common({ productTitle: "Updated owner title", fsn: "FSN-EDITABLE-NEW", listingId: "LID-EDITABLE-NEW" }),
    manualLocked: true
  });
  const updated = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: editable.id }, include: { identifiers: { where: { active: true } } } });
  assert.equal(updated.productTitle, "Updated owner title");
  assert.ok(updated.identifiers.some((row) => row.identifierType === "FSN" && row.normalizedValue === "FSN-EDITABLE-NEW"));
  assert.ok(updated.identifiers.some((row) => row.identifierType === "LISTING_ID" && row.normalizedValue === "LID-EDITABLE-NEW"));

  await assert.rejects(
    () => updateManualMarketplaceListing({
      actorUserId: ownerId,
      accountId,
      clientRequestId: "manual-edit-stale",
      marketplaceListingId: editable.id,
      expectedUpdatedAt: originalVersion,
      sellerSku: editable.sellerSkuId,
      common: common({ productTitle: "Stale overwrite" })
    }),
    /stale|changed|refresh/i,
    "An older edit cannot overwrite the committed version."
  );
  assert.equal((await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: editable.id } })).productTitle, "Updated owner title");

  await assert.rejects(
    () => updateManualMarketplaceListing({
      actorUserId: ownerId,
      accountId,
      clientRequestId: "manual-edit-sku-tamper",
      marketplaceListingId: editable.id,
      expectedUpdatedAt: updated.updatedAt.toISOString(),
      sellerSku: "SKU-TAMPERED",
      common: common({ productTitle: "Tampered SKU edit" })
    }),
    /Seller SKU|cannot be changed|immutable/i
  );

  const auditBeforeRollback = await prisma.auditLog.count({ where: { accountId, entityId: editable.id } });
  await assert.rejects(
    () => updateManualMarketplaceListing({
      actorUserId: ownerId,
      accountId,
      clientRequestId: "manual-edit-identifier-rollback",
      marketplaceListingId: editable.id,
      expectedUpdatedAt: updated.updatedAt.toISOString(),
      sellerSku: editable.sellerSkuId,
      common: common({ productTitle: "Must roll back", fsn: "FSN-MANUAL-01" })
    }),
    (error) => {
      assertControlledError(error, "Identifier synchronization failure must be controlled.");
      return /identifier|FSN|already|conflict/i.test(error instanceof Error ? error.message : String(error));
    }
  );
  const rolledBack = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: editable.id }, include: { identifiers: { where: { active: true } } } });
  assert.equal(rolledBack.productTitle, "Updated owner title", "Failed identifier synchronization rolls back the listing update.");
  assert.ok(rolledBack.identifiers.some((row) => row.identifierType === "FSN" && row.normalizedValue === "FSN-EDITABLE-NEW"), "The prior identifier set remains intact after rollback.");
  assert.equal(await prisma.auditLog.count({ where: { accountId, entityId: editable.id } }), auditBeforeRollback, "Failed update writes no success audit.");

  const importedStamp = { sourceProfile: "FLIPKART_LISTING_REPORT", authority: 300, importedAt: new Date(0).toISOString() };
  const imported = await prisma.marketplaceListing.create({
    data: {
      id: "manual-imported-style",
      accountId,
      marketplace: "FLIPKART",
      sellerSkuId: "SELLER-IMPORTED",
      sku: "INTERNAL-IMPORTED",
      productTitle: "Imported title",
      fsn: "FSN-IMPORTED",
      listingId: "LID-IMPORTED",
      imageUrl2: "https://example.invalid/imported-gallery-2.jpg",
      fieldProvenanceJson: JSON.stringify({
        productTitle: importedStamp,
        fsn: importedStamp,
        listingId: importedStamp,
        imageUrl2: importedStamp
      }),
      manualLocksJson: JSON.stringify({ fsn: true, listingId: true, imageUrl2: true, sellingPrice: true })
    }
  });
  await updateManualMarketplaceListing({
    actorUserId: ownerId,
    accountId,
    clientRequestId: "manual-imported-style-edit",
    marketplaceListingId: imported.id,
    expectedUpdatedAt: imported.updatedAt.toISOString(),
    sellerSku: imported.sellerSkuId,
    common: common({ productTitle: "Owner-edited imported listing", fsn: imported.fsn, listingId: imported.listingId }),
    manualLocked: true
  });
  const editedImported = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: imported.id } });
  assert.equal(editedImported.sku, "INTERNAL-IMPORTED", "Editing uses Seller SKU identity without rewriting the imported internal SKU.");
  assert.equal(editedImported.sellerSkuId, "SELLER-IMPORTED");
  assert.equal(editedImported.productTitle, "Owner-edited imported listing");
  const editedImportedProvenance = JSON.parse(editedImported.fieldProvenanceJson ?? "{}") as Record<string, unknown>;
  const editedImportedLocks = JSON.parse(editedImported.manualLocksJson ?? "{}") as Record<string, boolean>;
  assert.deepEqual(editedImportedProvenance.imageUrl2, importedStamp, "Editing preserves provenance for catalog fields outside the form.");
  assert.equal(editedImportedLocks.imageUrl2, true, "Editing preserves locks for catalog fields outside the form.");

  const beforeLockUpdate = editedImported.updatedAt.toISOString();
  await updateManualMarketplaceListingLocks({
    actorUserId: ownerId,
    accountId,
    clientRequestId: "manual-imported-locks",
    marketplaceListingId: imported.id,
    expectedUpdatedAt: beforeLockUpdate,
    lockedFields: ["productTitle", "mainImageUrl"]
  });
  const lockUpdated = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: imported.id } });
  const locksAfterAction = JSON.parse(lockUpdated.manualLocksJson ?? "{}") as Record<string, boolean>;
  assert.equal(locksAfterAction.fsn, true, "The lock action preserves the hidden FSN lock.");
  assert.equal(locksAfterAction.listingId, true, "The lock action preserves the hidden Listing ID lock.");
  assert.equal(locksAfterAction.productTitle, true, "The lock action enables a selected displayed field.");
  assert.equal(locksAfterAction.mainImageUrl, true, "The lock action enables another selected displayed field.");
  assert.equal(locksAfterAction.sellingPrice, undefined, "The lock action disables an unselected displayed field.");
  assert.equal(locksAfterAction.imageUrl2, undefined, "The lock action disables an unselected gallery field.");
  assert.equal(lockUpdated.sku, "INTERNAL-IMPORTED", "Updating locks does not alter catalog identity.");
  await assert.rejects(
    () => updateManualMarketplaceListingLocks({
      actorUserId: ownerId,
      accountId,
      clientRequestId: "manual-imported-locks-stale",
      marketplaceListingId: imported.id,
      expectedUpdatedAt: beforeLockUpdate,
      lockedFields: ["sellingPrice"]
    }),
    /stale|changed|refresh/i,
    "A stale field-lock form cannot overwrite the newer lock selection."
  );
  assert.equal(
    await prisma.auditLog.count({ where: { accountId, entityId: imported.id, action: "CATALOG_FIELD_LOCKS_UPDATED" } }),
    1,
    "Only the committed optimistic lock action is audited."
  );

  await assert.rejects(
    () => createManualMarketplaceListing(createInput({ actorUserId: "manual-worker", clientRequestId: "manual-worker-denied", sellerSku: "SKU-WORKER-DENIED" })),
    /Owner|OWNER|permission/i,
    "Standalone manual listing management remains owner-only."
  );
  await assert.rejects(
    () => createManualMarketplaceListing(createInput({ clientRequestId: "manual-invalid-price", sellerSku: "SKU-INVALID-PRICE", common: common({ mrp: "-1" }) })),
    /price|MRP|non-negative|invalid/i
  );
  await assert.rejects(
    () => createManualMarketplaceListing(createInput({ clientRequestId: "manual-invalid-url", sellerSku: "SKU-INVALID-URL", common: common({ mainImageUrl: "file:///private/catalog.jpg" }) })),
    /URL|HTTP|HTTPS|invalid/i
  );
} finally {
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Authoritative manual-listing transaction and concurrency tests passed.");
