import type { Account, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { isValidImportImageUrl } from "@/lib/import/sku-mappings";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";
import {
  flipkartInternalOrderKey,
  parseFlipkartListingRows,
  parseFlipkartOrderRows,
  type FlipkartListingLine,
  type FlipkartOrderLine,
  type FlipkartParseIssue,
  type FlipkartRawRow
} from "./parser";
import { dedupeFlipkartOrderRows, flipkartOrderMappingIssue, flipkartRawText } from "./review";

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

function listingNotes(listing: FlipkartListingLine) {
  return JSON.stringify({
    marketplace: "FLIPKART",
    sellerSkuId: listing.sellerSkuId,
    fsn: listing.fsn,
    listingId: listing.listingId,
    listingStatus: listing.listingStatus,
    subCategory: listing.subCategory,
    mrp: listing.mrp,
    sellingPrice: listing.sellingPrice,
    liveTitle: listing.liveTitle,
    liveBrand: listing.liveBrand,
    liveCategory: listing.liveCategory,
    livePrice: listing.livePrice,
    rating: listing.rating,
    reviewCount: listing.reviewCount,
    productUrl: listing.productUrl,
    canonicalProductUrl: listing.canonicalProductUrl,
    scrapeStatus: listing.scrapeStatus
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

function parseIssueRawData(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function findFlipkartListingMissingImageSkus(accountId: string) {
  const issues = await prisma.importRowIssue.findMany({
    where: {
      issueType: "MISSING_IMAGE_URL",
      batch: {
        accountId,
        importType: "SKU_IMAGE"
      }
    },
    select: {
      rawData: true
    }
  });

  return new Set(
    issues
      .map((issue) => {
        const rawData = parseIssueRawData(issue.rawData);
        return normalizeSkuForMatching(flipkartRawText(rawData, "Seller SKU Id") ?? flipkartRawText(rawData, "SKU"));
      })
      .filter((sku): sku is string => Boolean(sku))
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
  const [existingOrders, mappings, listingMissingImageSkus] = await Promise.all([
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
    prisma.skuImageMapping.findMany({
      where: {
        accountId: input.account.id,
        sku: { in: orderSkus },
        active: true
      },
      select: {
        sku: true,
        imageUrl: true
      }
    }),
    findFlipkartListingMissingImageSkus(input.account.id)
  ]);
  const existingByKey = new Map(existingOrders.map((order) => [order.awb, order]));
  const imageBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping.imageUrl]));
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
    const imageUrl = imageBySku.get(sku) ?? null;

    const mappingIssue = flipkartOrderMappingIssue(order, {
      hasActiveImageMapping: Boolean(imageUrl),
      listingFoundWithMissingImage: listingMissingImageSkus.has(sku)
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
  const issues = [...parsed.issues];

  await writeIssues(batch.id, issues);

  for (const listing of parsed.listings) {
    const sku = normalizeSkuForMatching(listing.sku);

    if (!listing.imageUrl || !isValidImportImageUrl(listing.imageUrl)) {
      missingImageRows += 1;
      issues.push({
        rowNumber: listing.rowNumber,
        issueType: "MISSING_IMAGE_URL",
        message: `No valid image URL found for Flipkart SKU ${sku}.`,
        rawData: listing.rawData
      });
      await prisma.importRowIssue.create({
        data: {
          batchId: batch.id,
          rowNumber: listing.rowNumber,
          issueType: "MISSING_IMAGE_URL",
          message: `No valid image URL found for Flipkart SKU ${sku}.`,
          rawData: JSON.stringify(listing.rawData)
        }
      });
      continue;
    }

    const existing = await prisma.skuImageMapping.findUnique({
      where: {
        accountId_sku: {
          accountId: input.account.id,
          sku
        }
      }
    });
    const data = {
      imageUrl: listing.imageUrl,
      productName: listing.productTitle ?? listing.liveTitle ?? null,
      source: input.fileName,
      notes: listingNotes(listing),
      active: true,
      lastImportedAt: new Date(),
      imageHealth: "UNKNOWN" as const,
      cacheStatus: existing?.imageUrl === listing.imageUrl ? existing.cacheStatus : ("RECHECK_NEEDED" as const),
      cacheOriginalImageUrl: existing?.imageUrl === listing.imageUrl ? undefined : null,
      cacheError: existing?.imageUrl === listing.imageUrl ? undefined : null
    };

    if (!existing) {
      await prisma.skuImageMapping.create({
        data: {
          accountId: input.account.id,
          sku,
          ...data,
          cacheStatus: "NOT_CACHED"
        }
      });
      createdRows += 1;
    } else if (existing.imageUrl === listing.imageUrl && existing.productName === data.productName && existing.notes === data.notes) {
      skippedRows += 1;
    } else {
      await prisma.skuImageMapping.update({
        where: {
          accountId_sku: {
            accountId: input.account.id,
            sku
          }
        },
        data
      });
      updatedRows += 1;
    }
  }

  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: issues.length > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      skippedRows,
      missingImageRows,
      errorRows: issues.length
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
      errorRows: issues.length
    },
    request: input.request
  });

  return updatedBatch;
}
