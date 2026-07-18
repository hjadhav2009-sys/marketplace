import assert from "node:assert/strict";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture = createPhase736Database("rolling-order-import");
const { prisma } = await import("../lib/prisma");
const { importFlipkartListingRows, importFlipkartOrderRows } = await import("../src/lib/marketplaces/flipkart/import");
const { headerFingerprint } = await import("../src/lib/imports/header-profiles");
const { resolveMissingListing } = await import("../src/lib/catalog/missing-listing-resolution");

const row = (index: number, extra: Record<string, string> = {}) => ({
  "Shipment ID": `SHIP-${index}`,
  "ORDER ITEM ID": `ITEM-${index}`,
  "Order Id": `ORDER-${index}`,
  FSN: "FSN-ROLL",
  SKU: "SKU-ROLL",
  Product: "Synthetic title",
  Quantity: "1",
  "Tracking ID": `TRACK-${index}`,
  "Buyer name": "PRIVATE BUYER",
  "Ship to name": "PRIVATE RECIPIENT",
  "Address Line 1": "PRIVATE ADDRESS",
  "PIN Code": "999999",
  "Invoice Amount": "9999",
  ...extra,
});

try {
  const account = await prisma.account.create({ data: { id: "a", name: "A", code: "A", marketplace: "FLIPKART" } });
  const user = await prisma.user.create({
    data: { id: "u", username: "phase736-rolling", passwordHash: "x", name: "Owner", role: "OWNER" },
  });
  await prisma.marketplaceListing.create({
    data: {
      accountId: "a",
      marketplace: "FLIPKART",
      sellerSkuId: "SKU-ROLL",
      sku: "SKU-ROLL",
      fsn: "FSN-ROLL",
      mainImageUrl: "https://example.invalid/product.jpg",
    },
  });

  const first = await importFlipkartOrderRows({
    rows: Array.from({ length: 100 }, (_, index) => row(index)),
    fileName: "first.csv",
    account,
    user,
  });
  assert.equal(first.createdRows, 100);

  const second = await importFlipkartOrderRows({
    rows: Array.from({ length: 150 }, (_, index) => row(index)),
    fileName: "rolling.csv",
    account,
    user,
  });
  assert.equal(second.createdRows, 50);
  assert.equal(second.alreadyImportedRows, 100);
  assert.equal(second.errorRows, 0);
  assert.equal(await prisma.order.count(), 150);
  assert.equal(await prisma.workTask.count({ where: { stage: "PICK" } }), 150);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: second.id } }), 0, "Already imported rows create no warning records");

  const repeated = await importFlipkartOrderRows({ rows: [row(200), row(200)], fileName: "repeated.csv", account, user });
  assert.equal(repeated.createdRows, 1);
  assert.equal(repeated.repeatedSourceRows, 1);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: repeated.id } }), 0);

  const conflict = await importFlipkartOrderRows({
    rows: [row(300), row(300, { Quantity: "2" })],
    fileName: "conflict.csv",
    account,
    user,
  });
  assert.equal(conflict.createdRows, 0);
  assert.equal(conflict.blockingErrorRows, 1);
  assert.equal(await prisma.order.count({ where: { orderItemId: "ITEM-300" } }), 0);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: conflict.id, issueType: "DUPLICATE_IDENTITY_CONFLICT" } }), 1);

  // Duplicate-conflict issues retain only bounded, masked operational context.
  // Supplied safeData must never override these masks with raw identifiers.
  const privateOrderItemId = "ITEM-PRIVATE-1234567890";
  const privateShipmentId = "SHIP-PRIVATE-1234567890";
  const privateTrackingId = "TRACK-PRIVATE-1234567890";
  const privacyConflict = await importFlipkartOrderRows({
    rows: [
      row(301, {
        "ORDER ITEM ID": privateOrderItemId,
        "Shipment ID": privateShipmentId,
        "Tracking ID": privateTrackingId,
      }),
      row(302, {
        "ORDER ITEM ID": privateOrderItemId,
        "Shipment ID": privateShipmentId,
        "Tracking ID": "TRACK-PRIVATE-DIFFERENT",
        Quantity: "2",
      }),
    ],
    fileName: "private-conflict.csv",
    account,
    user,
  });
  const privateIssue = await prisma.importRowIssue.findFirstOrThrow({
    where: { batchId: privacyConflict.id, issueType: "DUPLICATE_IDENTITY_CONFLICT" },
  });
  assert.equal(privateIssue.rawData, null);
  const privateSafe = JSON.parse(privateIssue.safeDataJson ?? "{}") as Record<string, unknown>;
  assert.equal(privateSafe.orderItemId, "ITEM...7890");
  assert.equal(privateSafe.shipmentId, "SHIP...7890");
  assert.equal(privateSafe.trackingId, null, "Conflicting duplicate rows do not need to retain either Tracking ID");
  for (const rawIdentity of [privateOrderItemId, privateShipmentId, privateTrackingId, "TRACK-PRIVATE-DIFFERENT"]) {
    assert.doesNotMatch(privateIssue.safeDataJson ?? "", new RegExp(rawIdentity));
    assert.doesNotMatch(privateIssue.message, new RegExp(rawIdentity));
  }
  for (const secret of ["PRIVATE BUYER", "PRIVATE RECIPIENT", "PRIVATE ADDRESS", "999999", "9999"]) {
    assert.doesNotMatch(privateIssue.safeDataJson ?? "", new RegExp(secret));
    assert.doesNotMatch(privateIssue.message, new RegExp(secret));
  }

  // Invalid quantity rows are blocked by the real import service and never
  // become an Order or WorkTask. Zero is not an informational Order skip.
  await prisma.marketplaceListing.create({
    data: {
      accountId: account.id,
      marketplace: "FLIPKART",
      sellerSkuId: "SKU-QUANTITY",
      sku: "SKU-QUANTITY",
      fsn: "FSN-QUANTITY",
      mainImageUrl: "https://example.invalid/quantity.jpg",
    },
  });
  const quantityRows = [
    row(410, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "" }),
    row(411, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "text" }),
    row(412, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "0" }),
    row(413, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "-2" }),
    row(414, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "1.5" }),
    row(415, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "1.0" }),
    row(416, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "1e3" }),
    row(417, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "1,00" }),
    row(418, { SKU: "SKU-QUANTITY", FSN: "FSN-QUANTITY", Quantity: "2" }),
  ];
  const quantityImport = await importFlipkartOrderRows({
    rows: quantityRows,
    fileName: "quantity-validation.csv",
    account,
    user,
  });
  assert.equal(quantityImport.createdRows, 1);
  assert.equal(quantityImport.blockingErrorRows, 8);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: quantityImport.id, issueType: "INVALID_QUANTITY" } }), 8);
  assert.equal(await prisma.order.count({ where: { orderItemId: { in: ["ITEM-410", "ITEM-411", "ITEM-412", "ITEM-413", "ITEM-414", "ITEM-415", "ITEM-416", "ITEM-417"] } } }), 0);
  const positiveQuantityOrder = await prisma.order.findFirstOrThrow({ where: { accountId: account.id, orderItemId: "ITEM-418" } });
  assert.equal(positiveQuantityOrder.qty, 2);
  assert.equal(await prisma.workTask.count({ where: { orderId: positiveQuantityOrder.id, stage: "PICK", requiredQuantity: 2 } }), 1);

  // Fallback identity is accepted only when Shipment ID + Seller SKU and its
  // package signals remain exact and unambiguous across cumulative imports.
  await prisma.marketplaceListing.createMany({
    data: [
      { accountId: account.id, marketplace: "FLIPKART", sellerSkuId: "SKU-FALLBACK-A", sku: "SKU-FALLBACK-A", mainImageUrl: "https://example.invalid/fallback-a.jpg" },
      { accountId: account.id, marketplace: "FLIPKART", sellerSkuId: "SKU-FALLBACK-B", sku: "SKU-FALLBACK-B", mainImageUrl: "https://example.invalid/fallback-b.jpg" },
    ],
  });
  const fallbackSiblingRows = [
    row(419, {
      "ORDER ITEM ID": "",
      "Shipment ID": "SHIP-FALLBACK-SIBLINGS",
      "Order Id": "ORDER-FALLBACK-SIBLINGS",
      "Tracking ID": "TRACK-FALLBACK-SIBLINGS",
      SKU: "SKU-FALLBACK-A",
      FSN: "",
    }),
    row(420, {
      "ORDER ITEM ID": "",
      "Shipment ID": "SHIP-FALLBACK-SIBLINGS",
      "Order Id": "ORDER-FALLBACK-SIBLINGS",
      "Tracking ID": "TRACK-FALLBACK-SIBLINGS",
      SKU: "SKU-FALLBACK-B",
      FSN: "",
    }),
  ];
  const fallbackSiblingFirst = await importFlipkartOrderRows({ rows: fallbackSiblingRows, fileName: "fallback-siblings-first.csv", account, user });
  const fallbackSiblingRepeat = await importFlipkartOrderRows({ rows: fallbackSiblingRows, fileName: "fallback-siblings-repeat.csv", account, user });
  assert.equal(fallbackSiblingFirst.createdRows, 2);
  assert.equal(fallbackSiblingFirst.blockingErrorRows, 0);
  assert.equal(fallbackSiblingRepeat.createdRows, 0);
  assert.equal(fallbackSiblingRepeat.alreadyImportedRows, 2);
  assert.equal(fallbackSiblingRepeat.blockingErrorRows, 0);
  const fallbackSiblingOrders = await prisma.order.findMany({ where: { accountId: account.id, shipmentId: "SHIP-FALLBACK-SIBLINGS" }, select: { id: true } });
  assert.equal(fallbackSiblingOrders.length, 2);
  assert.equal(await prisma.workTask.count({ where: { orderId: { in: fallbackSiblingOrders.map((item) => item.id) }, stage: "PICK" } }), 2);

  const fallbackExactRow = row(420, {
    "ORDER ITEM ID": "",
    "Shipment ID": "SHIP-FALLBACK-EXACT",
    "Order Id": "ORDER-FALLBACK-EXACT",
    "Tracking ID": "TRACK-FALLBACK-EXACT",
    SKU: "SKU-FALLBACK-A",
    FSN: "",
    Quantity: "3",
  });
  const fallbackFirst = await importFlipkartOrderRows({ rows: [fallbackExactRow], fileName: "fallback-first.csv", account, user });
  const fallbackRepeat = await importFlipkartOrderRows({ rows: [fallbackExactRow], fileName: "fallback-repeat.csv", account, user });
  assert.equal(fallbackFirst.createdRows, 1);
  assert.equal(fallbackRepeat.createdRows, 0);
  assert.equal(fallbackRepeat.alreadyImportedRows, 1);
  const fallbackOrder = await prisma.order.findFirstOrThrow({ where: { accountId: account.id, shipmentId: "SHIP-FALLBACK-EXACT", sku: "SKU-FALLBACK-A" } });
  assert.equal(await prisma.workTask.count({ where: { orderId: fallbackOrder.id, stage: "PICK" } }), 1);

  for (const [name, changed] of [
    ["sku", { SKU: "SKU-FALLBACK-B" }],
    ["shipment", { "Shipment ID": "SHIP-FALLBACK-CHANGED" }],
  ] as const) {
    const conflictImport = await importFlipkartOrderRows({
      rows: [{ ...fallbackExactRow, ...changed }],
      fileName: `fallback-${name}-conflict.csv`,
      account,
      user,
    });
    assert.equal(conflictImport.createdRows, 0);
    assert.equal(conflictImport.blockingErrorRows, 1);
    assert.equal(await prisma.importRowIssue.count({ where: { batchId: conflictImport.id, issueType: "FALLBACK_IDENTITY_CONFLICT" } }), 1);
  }
  assert.equal(await prisma.order.count({ where: { accountId: account.id, OR: [{ shipmentId: "SHIP-FALLBACK-EXACT" }, { trackingId: "TRACK-FALLBACK-EXACT" }, { orderNo: "ORDER-FALLBACK-EXACT" }] } }), 1);
  assert.equal(await prisma.workTask.count({ where: { orderId: fallbackOrder.id, stage: "PICK" } }), 1);

  const fallbackBeforeStart = await importFlipkartOrderRows({
    rows: [{ ...fallbackExactRow, Quantity: "4", "Tracking ID": "TRACK-FALLBACK-BEFORE-START" }],
    fileName: "fallback-safe-before-start.csv",
    account,
    user,
  });
  assert.equal(fallbackBeforeStart.updatedRows, 1);
  assert.equal(fallbackBeforeStart.blockingErrorRows, 0);
  const fallbackAfterSafeUpdate = await prisma.order.findUniqueOrThrow({ where: { id: fallbackOrder.id } });
  const fallbackPickAfterSafeUpdate = await prisma.workTask.findFirstOrThrow({ where: { orderId: fallbackOrder.id, stage: "PICK" } });
  assert.equal(fallbackAfterSafeUpdate.qty, 4);
  assert.equal(fallbackAfterSafeUpdate.trackingId, "TRACK-FALLBACK-BEFORE-START");
  assert.equal(fallbackPickAfterSafeUpdate.requiredQuantity, 4);
  await prisma.workTask.update({ where: { id: fallbackPickAfterSafeUpdate.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  const fallbackAfterStart = await importFlipkartOrderRows({
    rows: [{ ...fallbackExactRow, Quantity: "5", "Tracking ID": "TRACK-FALLBACK-AFTER-START" }],
    fileName: "fallback-block-after-start.csv",
    account,
    user,
  });
  assert.equal(fallbackAfterStart.updatedRows, 0);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: fallbackAfterStart.id, issueType: "ACTIVE_WORK_IDENTITY_CONFLICT" } }), 1);
  const fallbackFrozenOrder = await prisma.order.findUniqueOrThrow({ where: { id: fallbackOrder.id } });
  assert.equal(fallbackFrozenOrder.qty, 4);
  assert.equal(fallbackFrozenOrder.trackingId, "TRACK-FALLBACK-BEFORE-START");
  assert.equal((await prisma.workTask.findUniqueOrThrow({ where: { id: fallbackPickAfterSafeUpdate.id } })).requiredQuantity, 4);

  const distinctFallback = await importFlipkartOrderRows({
    rows: [{
      ...fallbackExactRow,
      "Shipment ID": "SHIP-FALLBACK-DISTINCT",
      "Order Id": "ORDER-FALLBACK-DISTINCT",
      "Tracking ID": "TRACK-FALLBACK-DISTINCT",
    }],
    fileName: "fallback-distinct.csv",
    account,
    user,
  });
  assert.equal(distinctFallback.createdRows, 1, "A fully distinct fallback package remains a legitimate new Order");

  await prisma.order.createMany({
    data: [
      { accountId: account.id, marketplace: "FLIPKART", shipmentId: "LEGACY-SHIP-A", orderItemId: null, trackingId: "LEGACY-AMBIGUOUS-TRACK", awb: "LEGACY-FALLBACK-A", sku: "SKU-FALLBACK-A", qty: 1, orderNo: "LEGACY-ORDER-A" },
      { accountId: account.id, marketplace: "FLIPKART", shipmentId: "LEGACY-SHIP-B", orderItemId: null, trackingId: "LEGACY-AMBIGUOUS-TRACK", awb: "LEGACY-FALLBACK-B", sku: "SKU-FALLBACK-B", qty: 1, orderNo: "LEGACY-ORDER-B" },
    ],
  });
  const ambiguousFallback = await importFlipkartOrderRows({
    rows: [row(421, {
      "ORDER ITEM ID": "",
      "Shipment ID": "LEGACY-SHIP-C",
      "Order Id": "LEGACY-ORDER-C",
      "Tracking ID": "LEGACY-AMBIGUOUS-TRACK",
      SKU: "SKU-FALLBACK-A",
      FSN: "",
    })],
    fileName: "fallback-ambiguous.csv",
    account,
    user,
  });
  assert.equal(ambiguousFallback.createdRows, 0);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: ambiguousFallback.id, issueType: "FALLBACK_IDENTITY_CONFLICT" } }), 1);
  assert.equal(await prisma.order.count({ where: { accountId: account.id, shipmentId: "LEGACY-SHIP-C" } }), 0);

  const primarySiblingRows = [
    row(422, {
      "ORDER ITEM ID": "PRIMARY-SIBLING-A",
      "Shipment ID": "PRIMARY-SIBLING-SHIPMENT",
      "Order Id": "PRIMARY-SIBLING-ORDER",
      "Tracking ID": "PRIMARY-SIBLING-TRACK",
      SKU: "SKU-FALLBACK-A",
      FSN: "",
    }),
    row(423, {
      "ORDER ITEM ID": "PRIMARY-SIBLING-B",
      "Shipment ID": "PRIMARY-SIBLING-SHIPMENT",
      "Order Id": "PRIMARY-SIBLING-ORDER",
      "Tracking ID": "PRIMARY-SIBLING-TRACK",
      SKU: "SKU-FALLBACK-B",
      FSN: "",
    }),
  ];
  const primarySiblingFirst = await importFlipkartOrderRows({ rows: primarySiblingRows, fileName: "primary-siblings-first.csv", account, user });
  const primarySiblingRepeat = await importFlipkartOrderRows({ rows: primarySiblingRows, fileName: "primary-siblings-repeat.csv", account, user });
  assert.equal(primarySiblingFirst.createdRows, 2);
  assert.equal(primarySiblingFirst.blockingErrorRows, 0);
  assert.equal(primarySiblingRepeat.alreadyImportedRows, 2);
  assert.equal(primarySiblingRepeat.blockingErrorRows, 0);
  const sameSkuPrimarySibling = await importFlipkartOrderRows({
    rows: [row(424, {
      "ORDER ITEM ID": "PRIMARY-SIBLING-CHANGED-ID",
      "Shipment ID": "PRIMARY-SIBLING-SHIPMENT",
      "Order Id": "PRIMARY-SIBLING-ORDER",
      "Tracking ID": "PRIMARY-SIBLING-TRACK",
      SKU: "SKU-FALLBACK-A",
      FSN: "",
    })],
    fileName: "primary-changed-item-id.csv",
    account,
    user,
  });
  assert.equal(sameSkuPrimarySibling.createdRows, 1, "A different primary Order Item ID remains a distinct same-SKU package member");
  assert.equal(sameSkuPrimarySibling.blockingErrorRows, 0);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: sameSkuPrimarySibling.id, issueType: "FALLBACK_IDENTITY_CONFLICT" } }), 0);
  assert.equal(await prisma.order.count({ where: { accountId: account.id, orderItemId: "PRIMARY-SIBLING-CHANGED-ID" } }), 1);

  const sameFileSameSkuPrimaryRows = [
    row(4241, {
      "ORDER ITEM ID": "PRIMARY-SAME-SKU-A",
      "Shipment ID": "PRIMARY-SAME-SKU-SHIPMENT",
      "Order Id": "PRIMARY-SAME-SKU-ORDER",
      "Tracking ID": "PRIMARY-SAME-SKU-TRACK",
      SKU: "SKU-FALLBACK-A",
      FSN: "",
    }),
    row(4242, {
      "ORDER ITEM ID": "PRIMARY-SAME-SKU-B",
      "Shipment ID": "PRIMARY-SAME-SKU-SHIPMENT",
      "Order Id": "PRIMARY-SAME-SKU-ORDER",
      "Tracking ID": "PRIMARY-SAME-SKU-TRACK",
      SKU: "SKU-FALLBACK-A",
      FSN: "",
    }),
  ];
  const sameFileSameSkuPrimary = await importFlipkartOrderRows({ rows: sameFileSameSkuPrimaryRows, fileName: "primary-same-sku.csv", account, user });
  assert.equal(sameFileSameSkuPrimary.createdRows, 2);
  assert.equal(sameFileSameSkuPrimary.blockingErrorRows, 0);
  assert.equal(await prisma.order.count({ where: { accountId: account.id, orderItemId: { in: ["PRIMARY-SAME-SKU-A", "PRIMARY-SAME-SKU-B"] } } }), 2);

  const cumulativeSiblingA = row(426, {
    "ORDER ITEM ID": "CUMULATIVE-SIBLING-A",
    "Shipment ID": "CUMULATIVE-SIBLING-SHIPMENT",
    "Order Id": "CUMULATIVE-SIBLING-ORDER",
    "Tracking ID": "CUMULATIVE-SIBLING-TRACK",
    SKU: "SKU-FALLBACK-A",
    FSN: "",
  });
  const cumulativeSiblingB = row(427, {
    "ORDER ITEM ID": "CUMULATIVE-SIBLING-B",
    "Shipment ID": "CUMULATIVE-SIBLING-SHIPMENT",
    "Order Id": "CUMULATIVE-SIBLING-ORDER",
    "Tracking ID": "CUMULATIVE-SIBLING-TRACK",
    SKU: "SKU-FALLBACK-B",
    FSN: "",
  });
  const cumulativeSiblingFirst = await importFlipkartOrderRows({ rows: [cumulativeSiblingA], fileName: "cumulative-sibling-first.csv", account, user });
  const cumulativeSiblingSecond = await importFlipkartOrderRows({ rows: [cumulativeSiblingA, cumulativeSiblingB], fileName: "cumulative-sibling-second.csv", account, user });
  assert.equal(cumulativeSiblingFirst.createdRows, 1);
  assert.equal(cumulativeSiblingSecond.createdRows, 1, "A later cumulative file may add a distinct-SKU member to an existing package");
  assert.equal(cumulativeSiblingSecond.alreadyImportedRows, 1);
  assert.equal(cumulativeSiblingSecond.blockingErrorRows, 0);
  assert.equal(await prisma.order.count({ where: { accountId: account.id, orderItemId: { in: ["CUMULATIVE-SIBLING-A", "CUMULATIVE-SIBLING-B"] } } }), 2);
  const cumulativeSameSkuPrimarySibling = await importFlipkartOrderRows({
    rows: [{ ...cumulativeSiblingA, "ORDER ITEM ID": "CUMULATIVE-SIBLING-CHANGED-A" }],
    fileName: "cumulative-sibling-changed-item.csv",
    account,
    user,
  });
  assert.equal(cumulativeSameSkuPrimarySibling.createdRows, 1, "A cumulative file may add a same-SKU member when its primary Order Item ID is new");
  assert.equal(cumulativeSameSkuPrimarySibling.blockingErrorRows, 0);
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: cumulativeSameSkuPrimarySibling.id, issueType: "FALLBACK_IDENTITY_CONFLICT" } }), 0);
  assert.equal(await prisma.order.count({ where: { accountId: account.id, orderItemId: "CUMULATIVE-SIBLING-CHANGED-A" } }), 1);

  const downstreamFrozenRow = row(425, {
    "ORDER ITEM ID": "DOWNSTREAM-FROZEN-ITEM",
    "Shipment ID": "DOWNSTREAM-FROZEN-SHIP",
    "Order Id": "DOWNSTREAM-FROZEN-ORDER",
    "Tracking ID": "DOWNSTREAM-FROZEN-TRACK",
    SKU: "SKU-FALLBACK-A",
    FSN: "",
  });
  await importFlipkartOrderRows({ rows: [downstreamFrozenRow], fileName: "downstream-frozen-first.csv", account, user });
  const downstreamFrozenOrder = await prisma.order.findFirstOrThrow({ where: { accountId: account.id, orderItemId: "DOWNSTREAM-FROZEN-ITEM" } });
  const downstreamFrozenPick = await prisma.workTask.findFirstOrThrow({ where: { orderId: downstreamFrozenOrder.id, stage: "PICK" } });
  await prisma.workTask.create({
    data: {
      accountId: account.id,
      sourceType: "ORDER",
      orderId: downstreamFrozenOrder.id,
      stage: "PACK",
      sequenceNumber: 2,
      requiredQuantity: 1,
      status: "LOCKED",
      workCardSnapshotJson: "{\"sentinel\":\"pack-work-card\"}",
      routeSnapshotJson: "{\"sentinel\":\"pack-route\"}",
    },
  });
  const frozenPickSnapshot = downstreamFrozenPick.workCardSnapshotJson;
  const downstreamConflict = await importFlipkartOrderRows({
    rows: [{ ...downstreamFrozenRow, Quantity: "2" }],
    fileName: "downstream-frozen-reimport.csv",
    account,
    user,
  });
  assert.equal(await prisma.importRowIssue.count({ where: { batchId: downstreamConflict.id, issueType: "ACTIVE_WORK_IDENTITY_CONFLICT" } }), 1);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: downstreamFrozenOrder.id } })).qty, 1);
  assert.equal((await prisma.workTask.findUniqueOrThrow({ where: { id: downstreamFrozenPick.id } })).workCardSnapshotJson, frozenPickSnapshot);
  const frozenPack = await prisma.workTask.findFirstOrThrow({ where: { orderId: downstreamFrozenOrder.id, stage: "PACK" } });
  assert.equal(frozenPack.requiredQuantity, 1);
  assert.equal(frozenPack.workCardSnapshotJson, "{\"sentinel\":\"pack-work-card\"}");
  assert.equal(frozenPack.routeSnapshotJson, "{\"sentinel\":\"pack-route\"}");

  // Reimport cannot bypass an unresolved owner catalog decision merely because
  // a matching listing appeared after the held Order was created.
  const heldLifecycleRow = row(430, {
    "ORDER ITEM ID": "ITEM-HELD-LIFECYCLE",
    "Shipment ID": "SHIP-HELD-LIFECYCLE",
    "Order Id": "ORDER-HELD-LIFECYCLE",
    "Tracking ID": "TRACK-HELD-LIFECYCLE",
    SKU: "SKU-HELD-LIFECYCLE",
    FSN: "FSN-HELD-LIFECYCLE",
  });
  const heldLifecycleFirst = await importFlipkartOrderRows({ rows: [heldLifecycleRow], fileName: "held-lifecycle-first.csv", account, user });
  const heldLifecycleOrder = await prisma.order.findFirstOrThrow({ where: { accountId: account.id, orderItemId: "ITEM-HELD-LIFECYCLE" } });
  const heldLifecycleIssue = await prisma.importRowIssue.findFirstOrThrow({
    where: { batchId: heldLifecycleFirst.id, sourceId: heldLifecycleOrder.id, issueType: "MISSING_FLIPKART_LISTING_MAPPING", resolved: false },
  });
  assert.equal(await prisma.workTask.count({ where: { orderId: heldLifecycleOrder.id } }), 0);
  const heldLifecycleUpdatedRow = {
    ...heldLifecycleRow,
    SKU: "SKU-HELD-LIFECYCLE-UPDATED",
    FSN: "FSN-HELD-LIFECYCLE-UPDATED",
    Quantity: "3",
    "Tracking ID": "TRACK-HELD-LIFECYCLE-UPDATED",
  };
  const heldLifecycleUpdate = await importFlipkartOrderRows({ rows: [heldLifecycleUpdatedRow], fileName: "held-lifecycle-update.csv", account, user });
  assert.equal(heldLifecycleUpdate.updatedRows, 1);
  const updatedHeldOrder = await prisma.order.findUniqueOrThrow({ where: { id: heldLifecycleOrder.id } });
  const updatedHeldIssue = await prisma.importRowIssue.findUniqueOrThrow({ where: { id: heldLifecycleIssue.id } });
  const updatedHeldSafe = JSON.parse(updatedHeldIssue.safeDataJson ?? "{}") as { sellerSku?: string; trackingId?: string };
  assert.equal(updatedHeldOrder.sku, "SKU-HELD-LIFECYCLE-UPDATED");
  assert.equal(updatedHeldOrder.qty, 3);
  assert.equal(updatedHeldOrder.trackingId, "TRACK-HELD-LIFECYCLE-UPDATED");
  assert.equal(updatedHeldIssue.version, heldLifecycleIssue.version + 1);
  assert.equal(updatedHeldSafe.sellerSku, "SKU-HELD-LIFECYCLE-UPDATED");
  assert.equal(await prisma.workTask.count({ where: { orderId: heldLifecycleOrder.id } }), 0);
  await prisma.marketplaceListing.create({
    data: {
      accountId: account.id,
      marketplace: "FLIPKART",
      sellerSkuId: "SKU-HELD-LIFECYCLE-UPDATED",
      sku: "SKU-HELD-LIFECYCLE-UPDATED",
      fsn: "FSN-HELD-LIFECYCLE-UPDATED",
      mainImageUrl: "https://example.invalid/held-lifecycle.jpg",
    },
  });
  const heldLifecycleRepeat = await importFlipkartOrderRows({ rows: [heldLifecycleUpdatedRow], fileName: "held-lifecycle-repeat.csv", account, user });
  assert.equal(heldLifecycleRepeat.createdRows, 0);
  assert.equal(heldLifecycleRepeat.alreadyImportedRows, 1);
  assert.equal(await prisma.workTask.count({ where: { orderId: heldLifecycleOrder.id } }), 0);
  assert.equal(await prisma.workGroupMember.count({ where: { task: { orderId: heldLifecycleOrder.id } } }), 0);
  assert.equal(await prisma.importRowIssue.count({ where: { sourceId: heldLifecycleOrder.id, issueType: "MISSING_FLIPKART_LISTING_MAPPING", resolved: false } }), 1);
  const heldLifecycleListing = await prisma.marketplaceListing.findFirstOrThrow({ where: { accountId: account.id, sellerSkuId: "SKU-HELD-LIFECYCLE-UPDATED" } });
  const heldResolution = await resolveMissingListing({
    actorUserId: user.id,
    accountId: account.id,
    issueId: heldLifecycleIssue.id,
    expectedIssueVersion: updatedHeldIssue.version,
    clientRequestId: "rolling-held-lifecycle-resolution",
    action: "LINK_EXISTING",
    listingId: heldLifecycleListing.id,
  });
  assert.ok(heldResolution.taskId);
  const heldReleasedTask = await prisma.workTask.findFirstOrThrow({ where: { orderId: heldLifecycleOrder.id, stage: "PICK" } });
  assert.equal(heldReleasedTask.requiredQuantity, 3);
  assert.equal(await prisma.workGroupMember.count({ where: { taskId: heldResolution.taskId! } }), 1);

  // Synthetic write failure proves the held Order and its blocking owner issue
  // share one transaction. Retrying after the failure repairs neither partially
  // nor twice.
  const atomicHeldRow = row(431, {
    "ORDER ITEM ID": "ITEM-HELD-ATOMIC",
    "Shipment ID": "SHIP-HELD-ATOMIC",
    "Order Id": "ORDER-HELD-ATOMIC",
    "Tracking ID": "TRACK-HELD-ATOMIC",
    SKU: "SKU-HELD-ATOMIC",
    FSN: "FSN-HELD-ATOMIC",
  });
  await prisma.$executeRawUnsafe(`CREATE TRIGGER phase736_fail_held_issue BEFORE INSERT ON ImportRowIssue WHEN NEW.issueType = 'MISSING_FLIPKART_LISTING_MAPPING' AND NEW.sourceId IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic held issue failure'); END`);
  try {
    await assert.rejects(
      () => importFlipkartOrderRows({ rows: [atomicHeldRow], fileName: "held-atomic-failure.csv", account, user }),
      /synthetic held issue failure|foreign key|P2003|invocation failed/i,
    );
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS phase736_fail_held_issue");
  }
  assert.equal(await prisma.order.count({ where: { accountId: account.id, orderItemId: "ITEM-HELD-ATOMIC" } }), 0);
  assert.equal(await prisma.workTask.count({ where: { order: { accountId: account.id, orderItemId: "ITEM-HELD-ATOMIC" } } }), 0);
  const atomicHeldRetry = await importFlipkartOrderRows({ rows: [atomicHeldRow], fileName: "held-atomic-retry.csv", account, user });
  const atomicHeldOrder = await prisma.order.findFirstOrThrow({ where: { accountId: account.id, orderItemId: "ITEM-HELD-ATOMIC" } });
  assert.equal(atomicHeldRetry.createdRows, 1);
  assert.equal(await prisma.importRowIssue.count({ where: { sourceId: atomicHeldOrder.id, issueType: "MISSING_FLIPKART_LISTING_MAPPING", resolved: false } }), 1);
  assert.equal(await prisma.workTask.count({ where: { orderId: atomicHeldOrder.id } }), 0);

  // Distinct import invocations racing on identical and partially overlapping
  // files converge on one Order, Pick task, and projection member per identity.
  await prisma.marketplaceListing.create({
    data: {
      accountId: account.id,
      marketplace: "FLIPKART",
      sellerSkuId: "SKU-CONCURRENT-IMPORT",
      sku: "SKU-CONCURRENT-IMPORT",
      fsn: "FSN-CONCURRENT-IMPORT",
      mainImageUrl: "https://example.invalid/concurrent.jpg",
    },
  });
  const concurrentRow = (index: number) => row(index, { SKU: "SKU-CONCURRENT-IMPORT", FSN: "FSN-CONCURRENT-IMPORT" });
  const identicalRows = Array.from({ length: 25 }, (_, index) => concurrentRow(500 + index));
  const identicalResults = await Promise.all([
    importFlipkartOrderRows({ rows: identicalRows, fileName: "concurrent-identical-a.csv", account, user }),
    importFlipkartOrderRows({ rows: identicalRows, fileName: "concurrent-identical-b.csv", account, user }),
  ]);
  assert.equal(identicalResults.reduce((sum, result) => sum + result.createdRows, 0), 25);
  assert.equal(identicalResults.reduce((sum, result) => sum + result.alreadyImportedRows, 0), 25);
  const identicalOrders = await prisma.order.findMany({ where: { accountId: account.id, orderItemId: { in: identicalRows.map((item) => item["ORDER ITEM ID"]!) } }, select: { id: true } });
  assert.equal(identicalOrders.length, 25);
  assert.equal(await prisma.workTask.count({ where: { orderId: { in: identicalOrders.map((item) => item.id) }, stage: "PICK" } }), 25);
  assert.equal(await prisma.workGroupMember.count({ where: { task: { orderId: { in: identicalOrders.map((item) => item.id) }, stage: "PICK" } } }), 25);

  const partialA = Array.from({ length: 20 }, (_, index) => concurrentRow(550 + index));
  const partialB = Array.from({ length: 20 }, (_, index) => concurrentRow(560 + index));
  const partialResults = await Promise.all([
    importFlipkartOrderRows({ rows: partialA, fileName: "concurrent-partial-a.csv", account, user }),
    importFlipkartOrderRows({ rows: partialB, fileName: "concurrent-partial-b.csv", account, user }),
  ]);
  assert.equal(partialResults.reduce((sum, result) => sum + result.createdRows, 0), 30);
  assert.equal(partialResults.reduce((sum, result) => sum + result.alreadyImportedRows, 0), 10);
  const partialIds = [...new Set([...partialA, ...partialB].map((item) => String(item["ORDER ITEM ID"])))];
  const partialOrders = await prisma.order.findMany({ where: { accountId: account.id, orderItemId: { in: partialIds } }, select: { id: true } });
  assert.equal(partialOrders.length, 30);
  assert.equal(await prisma.workTask.count({ where: { orderId: { in: partialOrders.map((item) => item.id) }, stage: "PICK" } }), 30);
  assert.equal(await prisma.workGroupMember.count({ where: { task: { orderId: { in: partialOrders.map((item) => item.id) }, stage: "PICK" } } }), 30);

  // A legacy exact profile without a dynamic form schema is never silently
  // reused: the real listing import persists and attaches a newer version.
  const legacyListingRow = {
    "Product Title": "Legacy profile upgrade",
    "Seller SKU Id": "SKU-LEGACY-PROFILE",
    "Sub-category": "Synthetic",
    "Flipkart Serial Number": "FSN-LEGACY-PROFILE",
    "Listing ID": "LISTING-LEGACY-PROFILE",
    "Listing Status": "ACTIVE",
    MRP: "100",
    "Your Selling Price": "90",
    "Image URL 1": "https://example.invalid/legacy.jpg",
  };
  const legacyHeaders = Object.keys(legacyListingRow);
  const legacyProfile = await prisma.marketplaceFileProfile.create({
    data: {
      accountId: account.id,
      marketplace: "FLIPKART",
      importPurpose: "PRODUCT_CATALOG",
      profileName: "Legacy null-form profile",
      headerFingerprint: headerFingerprint(legacyHeaders),
      fieldMappingJson: JSON.stringify({ sellerSku: "Seller SKU Id" }),
      requiredFieldsJson: JSON.stringify(["sellerSku"]),
      formSchemaJson: null,
      version: 1,
      active: true,
      createdByUserId: user.id,
    },
  });
  const upgradedBatch = await importFlipkartListingRows({
    rows: [legacyListingRow],
    fileName: "legacy-profile-upgrade.csv",
    account,
    user,
  });
  assert.notEqual(upgradedBatch.fileProfileId, legacyProfile.id);
  const upgradedProfile = await prisma.marketplaceFileProfile.findUniqueOrThrow({ where: { id: upgradedBatch.fileProfileId! } });
  assert.equal(upgradedProfile.headerFingerprint, legacyProfile.headerFingerprint);
  assert.ok(upgradedProfile.version > legacyProfile.version);
  assert.ok(upgradedProfile.formSchemaJson);
  assert.ok(upgradedProfile.technicalHeaderFingerprint);

  const missing = await importFlipkartOrderRows({
    rows: [row(400, { SKU: "MISSING-SKU", FSN: "MISSING-FSN" })],
    fileName: "privacy.csv",
    account,
    user,
  });
  const issue = await prisma.importRowIssue.findFirstOrThrow({
    where: { batchId: missing.id, issueType: "MISSING_FLIPKART_LISTING_MAPPING" },
  });
  assert.equal(issue.rawData, null);
  const safe = issue.safeDataJson ?? "";
  for (const secret of ["PRIVATE BUYER", "PRIVATE RECIPIENT", "PRIVATE ADDRESS", "999999", "9999"]) {
    assert.doesNotMatch(safe, new RegExp(secret));
  }
} finally {
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Rolling Order import and privacy tests passed.");
