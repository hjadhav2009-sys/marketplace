import type { Account, Prisma, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";
import {
  chunkFlipkartListingRows,
  dedupeFlipkartListingRows,
  flipkartListingIsInactive,
  flipkartListingMasterData,
  sameFlipkartListingMaster
} from "./listing-master";
import {
  flipkartInternalOrderKey,
  parseFlipkartListingRows,
  parseFlipkartOrderRows,
  type FlipkartOrderLine,
  type FlipkartParseIssue,
  type FlipkartRawRow
} from "./parser";
import { dedupeFlipkartOrderRows, flipkartOrderMappingIssue } from "./review";

const FLIPKART_LISTING_CREATE_BATCH_SIZE = 100;
const FLIPKART_LISTING_UPDATE_BATCH_SIZE = 50;

type ExistingFlipkartOrder = {
  id: string;
  awb: string;
  sku: string;
  qty: number;
  orderNo: string;
  productDescription: string | null;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  shipmentId: string | null;
  orderItemId: string | null;
  fsn: string | null;
  trackingId: string | null;
};

function orderNotes(result: {
  parser: "flipkart-orders-xlsx";
  parsedRows: number;
  importableRows: number;
  heldRows: number;
  missingImageRows: number;
}) {
  return JSON.stringify({
    marketplace: "FLIPKART",
    ...result
  });
}

function sameOrder(existing: ExistingFlipkartOrder, order: FlipkartOrderLine, imageUrl: string | null) {
  return (
    existing.sku === normalizeSkuForMatching(order.sku) &&
    existing.qty === (order.quantity ?? 1) &&
    existing.orderNo === (order.orderId ?? order.shipmentId ?? existing.awb) &&
    (existing.productDescription ?? "") === (order.productTitle ?? "") &&
    (existing.city ?? "") === (order.city ?? "") &&
    (existing.state ?? "") === (order.state ?? "") &&
    (existing.imageUrl ?? "") === (imageUrl ?? "") &&
    (existing.shipmentId ?? "") === (order.shipmentId ?? "") &&
    (existing.orderItemId ?? "") === (order.orderItemId ?? "") &&
    (existing.fsn ?? "") === (order.fsn ?? "") &&
    (existing.trackingId ?? "") === (order.trackingId ?? "")
  );
}

async function writeIssues(batchId: string, issues: FlipkartParseIssue[]) {
  if (issues.length === 0) {
    return;
  }

  await prisma.importRowIssue.createMany({
    data: issues.map((issue) => ({
      batchId,
      rowNumber: issue.rowNumber,
      issueType: issue.issueType,
      message: issue.message,
      rawData: JSON.stringify(issue.rawData)
    }))
  });
}

export async function importFlipkartOrderRows(input: {
  rows: FlipkartRawRow[];
  fileName: string;
  account: Account;
  user: User;
  request?: RequestMeta;
}) {
  const parsed = parseFlipkartOrderRows(input.rows, input.fileName);
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.account.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "ORDER_LABEL",
      status: "UPLOADED",
      totalRows: input.rows.length,
      notes: orderNotes({
        parser: "flipkart-orders-xlsx",
        parsedRows: input.rows.length,
        importableRows: parsed.orders.length,
        heldRows: parsed.issues.length,
        missingImageRows: 0
      })
    }
  });
  const duplicateIssues: FlipkartParseIssue[] = [];
  const deduped = dedupeFlipkartOrderRows(parsed.orders);
  duplicateIssues.push(...deduped.duplicateIssues);
  const importableOrders = deduped.importableOrders;
  const internalKeys = importableOrders.map((order) => flipkartInternalOrderKey(order)).filter((key): key is string => Boolean(key));
  const orderSkus = Array.from(
    new Set(importableOrders.flatMap((order) => [order.sku, normalizeSkuForMatching(order.sku)].filter((sku): sku is string => Boolean(sku))))
  );
  const [existingOrders, listings] = await Promise.all([
    prisma.order.findMany({
      where: {
        accountId: input.account.id,
        awb: { in: internalKeys }
      },
      select: {
        id: true,
        awb: true,
        sku: true,
        qty: true,
        orderNo: true,
        productDescription: true,
        city: true,
        state: true,
        imageUrl: true,
        shipmentId: true,
        orderItemId: true,
        fsn: true,
        trackingId: true
      }
    }),
    prisma.marketplaceListing.findMany({
      where: {
        accountId: input.account.id,
        marketplace: "FLIPKART",
        sku: { in: orderSkus }
      },
      select: {
        sellerSkuId: true,
        sku: true,
        mainImageUrl: true
      }
    })
  ]);
  const existingByKey = new Map(existingOrders.map((order) => [order.awb, order]));
  const listingBySku = new Map(listings.map((listing) => [normalizeSkuForMatching(listing.sku), listing]));
  let createdRows = 0;
  let updatedRows = 0;
  let duplicateRows = 0;
  let missingImageRows = 0;

  await writeIssues(batch.id, [...parsed.issues, ...duplicateIssues]);

  for (const order of importableOrders) {
    const internalKey = flipkartInternalOrderKey(order);

    if (!internalKey) {
      continue;
    }

    const sku = normalizeSkuForMatching(order.sku);
    const listing = listingBySku.get(sku) ?? null;
    const imageUrl = null;

    const mappingIssue = flipkartOrderMappingIssue(order, {
      listingFound: Boolean(listing),
      hasMainImage: Boolean(listing?.mainImageUrl)
    });

    if (mappingIssue) {
      missingImageRows += 1;
      await prisma.importRowIssue.create({
        data: {
          batchId: batch.id,
          rowNumber: mappingIssue.rowNumber,
          issueType: mappingIssue.issueType,
          message: mappingIssue.message,
          rawData: JSON.stringify(mappingIssue.rawData)
        }
      });
    }

    const existing = existingByKey.get(internalKey);
    const orderData = {
      accountId: input.account.id,
      batchId: batch.id,
      marketplace: "FLIPKART",
      shipmentId: order.shipmentId ?? null,
      orderItemId: order.orderItemId ?? null,
      fsn: order.fsn ?? null,
      trackingId: order.trackingId ?? null,
      awb: internalKey,
      courier: null,
      sku,
      qty: order.quantity ?? 1,
      color: null,
      size: null,
      orderNo: order.orderId ?? order.shipmentId ?? internalKey,
      productDescription: order.productTitle ?? null,
      paymentType: "UNKNOWN" as const,
      city: order.city ?? null,
      state: order.state ?? null,
      imageUrl
    };

    if (!existing) {
      await prisma.order.create({ data: orderData });
      createdRows += 1;
    } else if (sameOrder(existing, order, imageUrl)) {
      duplicateRows += 1;
      await prisma.importRowIssue.create({
        data: {
          batchId: batch.id,
          issueType: "DUPLICATE_SKIPPED",
          message: `Flipkart order ${internalKey} already exists with no safe changes.`,
          rawData: JSON.stringify(order.rawData ?? {})
        }
      });
    } else {
      await prisma.order.update({
        where: { id: existing.id },
        data: orderData
      });
      updatedRows += 1;
    }
  }

  const errorRows = parsed.issues.length;
  const reviewRows = parsed.issues.length + duplicateIssues.length + missingImageRows;
  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: reviewRows > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      duplicateRows: duplicateRows + duplicateIssues.length,
      missingImageRows,
      skippedRows: duplicateRows + duplicateIssues.length + parsed.issues.length,
      errorRows,
      notes: orderNotes({
        parser: "flipkart-orders-xlsx",
        parsedRows: input.rows.length,
        importableRows: importableOrders.length,
        heldRows: parsed.issues.length,
        missingImageRows
      })
    }
  });

  await recordAuditLog({
    userId: input.user.id,
    accountId: input.account.id,
    action: "FLIPKART_ORDER_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows,
      updatedRows,
      duplicateRows,
      missingImageRows,
      errorRows
    },
    request: input.request
  });

  return updatedBatch;
}

export async function importFlipkartListingRows(input: {
  rows: FlipkartRawRow[];
  fileName: string;
  account: Account;
  user: User;
  request?: RequestMeta;
}) {
  const parsed = parseFlipkartListingRows(input.rows, input.fileName);
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.account.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "SKU_IMAGE",
      status: "UPLOADED",
      totalRows: input.rows.length,
      notes: JSON.stringify({
        marketplace: "FLIPKART",
        parser: "flipkart-listings-xlsx"
      })
    }
  });
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let missingImageRows = 0;
  let inactiveListings = 0;
  const deduped = dedupeFlipkartListingRows(parsed.listings);
  const issues = [...parsed.issues, ...deduped.duplicateIssues];
  const importedAt = new Date();
  const listingDrafts = deduped.importableListings.map((listing) => ({
    listing,
    data: flipkartListingMasterData(listing)
  }));
  const missingImageIssues: FlipkartParseIssue[] = [];

  await writeIssues(batch.id, issues);

  for (const chunk of chunkFlipkartListingRows(listingDrafts)) {
    const listingSkus = Array.from(new Set(chunk.map((draft) => draft.data.sku).filter(Boolean)));
    const existingListings = await prisma.marketplaceListing.findMany({
      where: {
        accountId: input.account.id,
        marketplace: "FLIPKART",
        sku: { in: listingSkus }
      }
    });
    const existingBySku = new Map(existingListings.map((existingListing) => [normalizeSkuForMatching(existingListing.sku), existingListing]));
    const createRows: Prisma.MarketplaceListingCreateManyInput[] = [];
    const updateOperations: Prisma.PrismaPromise<unknown>[] = [];
    const unchangedListingIds: string[] = [];

    for (const { listing, data } of chunk) {
      const sku = data.sku;

      if (flipkartListingIsInactive(listing)) {
        inactiveListings += 1;
      }

      if (!data.mainImageUrl) {
        missingImageRows += 1;
        missingImageIssues.push({
          rowNumber: listing.rowNumber,
          issueType: "MISSING_IMAGE_URL",
          message: `No valid image URL found for Flipkart SKU ${sku}.`,
          rawData: listing.rawData
        });
      }

      const existing = existingBySku.get(sku);
      const listingData = {
        ...data,
        accountId: input.account.id,
        lastImportedAt: importedAt
      };

      if (!existing) {
        createRows.push(listingData);
      } else if (sameFlipkartListingMaster(existing, data)) {
        unchangedListingIds.push(existing.id);
      } else {
        updateOperations.push(prisma.marketplaceListing.update({
          where: { id: existing.id },
          data: listingData
        }));
      }
    }

    for (const createChunk of chunkFlipkartListingRows(createRows, FLIPKART_LISTING_CREATE_BATCH_SIZE)) {
      const result = await prisma.marketplaceListing.createMany({
        data: createChunk
      });
      createdRows += result.count;
    }

    for (const unchangedChunk of chunkFlipkartListingRows(unchangedListingIds, FLIPKART_LISTING_CREATE_BATCH_SIZE)) {
      const result = await prisma.marketplaceListing.updateMany({
        where: { id: { in: unchangedChunk } },
        data: { lastImportedAt: importedAt }
      });
      skippedRows += result.count;
    }

    for (const updateChunk of chunkFlipkartListingRows(updateOperations, FLIPKART_LISTING_UPDATE_BATCH_SIZE)) {
      const result = await prisma.$transaction(updateChunk);
      updatedRows += result.length;
    }
  }

  await writeIssues(batch.id, missingImageIssues);

  const allIssues = [...issues, ...missingImageIssues];
  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: allIssues.length > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      duplicateRows: deduped.duplicateIssues.length,
      skippedRows,
      missingImageRows,
      errorRows: allIssues.length,
      notes: JSON.stringify({
        marketplace: "FLIPKART",
        parser: "flipkart-listings-xlsx",
        listingMaster: true,
        inactiveListings
      })
    }
  });

  await recordAuditLog({
    userId: input.user.id,
    accountId: input.account.id,
    action: "FLIPKART_LISTING_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows,
      updatedRows,
      skippedRows,
      missingImageRows,
      inactiveListings,
      errorRows: allIssues.length
    },
    request: input.request
  });

  return updatedBatch;
}
