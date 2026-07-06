import { normalizeSkuForMatching } from "@/lib/sku";
import {
  analyzeFlipkartHeaders,
  flipkartInternalOrderKey,
  parseFlipkartListingRows,
  parseFlipkartOrderRows,
  type FlipkartRawRow
} from "./parser";
import {
  dedupeFlipkartListingRows,
  flipkartListingMasterData,
  planFlipkartListingMasterImport,
  type FlipkartListingMasterComparable
} from "./listing-master";
import { dedupeFlipkartOrderRows } from "./review";

export type FlipkartDryRunSummary = {
  listingRowsTotal: number;
  listingRowsValid: number;
  listingImageDiagnostics: {
    image1366Url1NonEmpty: number;
    imageUrl1NonEmpty: number;
    image1366Url2NonEmpty: number;
    imageUrl2NonEmpty: number;
    anyImageUrlNonEmpty: number;
    anyImage1366UrlNonEmpty: number;
    selectedMainImageUrlNonEmpty: number;
    validSkuAllImageFieldsBlank: number;
  };
  listingMissingSkuCount: number;
  listingDuplicateSellerSkuCount: number;
  listingMissingImageCount: number;
  listingInactiveCount: number;
  listingPlan: {
    created: number;
    updated: number;
    unchanged: number;
    mode: "EMPTY_DATABASE_ASSUMPTION" | "EXISTING_LISTINGS";
  };
  orderRowsTotal: number;
  orderRowsValid: number;
  heldRows: number;
  duplicateRows: number;
  missingSkuCount: number;
  missingListingCount: number;
  missingImageCount: number;
  uniqueOrderSkus: string[];
  uniqueTrackingIds: string[];
  multiItemTrackingIds: Array<{
    trackingId: string;
    itemCount: number;
    skus: string[];
  }>;
  headers: {
    orders: {
      unknownHeaders: string[];
      missingExpectedHeaders: string[];
    };
    listings: {
      unknownHeaders: string[];
      missingExpectedHeaders: string[];
    };
  };
};

function countIssues(issues: Array<{ issueType: string }>, issueType: string) {
  return issues.filter((issue) => issue.issueType === issueType).length;
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeSkuForMatching(value)).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function buildFlipkartDryRunSummary(input: {
  orderRows: FlipkartRawRow[];
  listingRows: FlipkartRawRow[];
  existingListings?: FlipkartListingMasterComparable[];
}): FlipkartDryRunSummary {
  const listingHeaders = analyzeFlipkartHeaders(input.listingRows, "listings");
  const orderHeaders = analyzeFlipkartHeaders(input.orderRows, "orders");
  const parsedListings = parseFlipkartListingRows(input.listingRows, "dry-run-listings.xlsx");
  const dedupedListings = dedupeFlipkartListingRows(parsedListings.listings);
  const listingMasterRows = dedupedListings.importableListings.map((listing) => ({
    sellerSkuId: normalizeSkuForMatching(listing.sellerSkuId),
    sku: normalizeSkuForMatching(listing.sku),
    data: flipkartListingMasterData(listing)
  }));
  const listingImageDiagnostics = {
    image1366Url1NonEmpty: dedupedListings.importableListings.filter((listing) => hasText(listing.image1366Urls[0])).length,
    imageUrl1NonEmpty: dedupedListings.importableListings.filter((listing) => hasText(listing.imageUrls[0])).length,
    image1366Url2NonEmpty: dedupedListings.importableListings.filter((listing) => hasText(listing.image1366Urls[1])).length,
    imageUrl2NonEmpty: dedupedListings.importableListings.filter((listing) => hasText(listing.imageUrls[1])).length,
    anyImageUrlNonEmpty: dedupedListings.importableListings.filter((listing) => listing.imageUrls.some(hasText)).length,
    anyImage1366UrlNonEmpty: dedupedListings.importableListings.filter((listing) => listing.image1366Urls.some(hasText)).length,
    selectedMainImageUrlNonEmpty: dedupedListings.importableListings.filter((listing) => hasText(listing.mainImageUrl)).length,
    validSkuAllImageFieldsBlank: dedupedListings.importableListings.filter(
      (listing) => !listing.imageUrls.some(hasText) && !listing.image1366Urls.some(hasText)
    ).length
  };
  const listingPlan = planFlipkartListingMasterImport(input.existingListings ?? [], listingMasterRows);
  const listingBySku = new Map(listingMasterRows.map((row) => [normalizeSkuForMatching(row.sku), row.data]));
  const parsedOrders = parseFlipkartOrderRows(input.orderRows, "dry-run-orders.xlsx");
  const dedupedOrders = dedupeFlipkartOrderRows(parsedOrders.orders);
  const uniqueOrderSkus = unique(dedupedOrders.importableOrders.map((order) => order.sku));
  const uniqueTrackingIds = unique(dedupedOrders.importableOrders.map((order) => order.trackingId));
  const trackingCounts = dedupedOrders.importableOrders.reduce<Map<string, { itemCount: number; skus: Set<string> }>>((counts, order) => {
    const trackingId = normalizeSkuForMatching(order.trackingId);

    if (!trackingId) {
      return counts;
    }

    const existing = counts.get(trackingId) ?? { itemCount: 0, skus: new Set<string>() };
    existing.itemCount += 1;
    existing.skus.add(normalizeSkuForMatching(order.sku));
    counts.set(trackingId, existing);
    return counts;
  }, new Map());
  const orderMappingIssues = dedupedOrders.importableOrders.map((order) => {
    const listing = listingBySku.get(normalizeSkuForMatching(order.sku));

    return {
      hasListing: Boolean(listing),
      hasImage: Boolean(listing?.mainImageUrl)
    };
  });

  return {
    listingRowsTotal: input.listingRows.length,
    listingRowsValid: dedupedListings.importableListings.length,
    listingImageDiagnostics,
    listingMissingSkuCount: countIssues(parsedListings.issues, "MISSING_SELLER_SKU_ID"),
    listingDuplicateSellerSkuCount: dedupedListings.duplicateIssues.length,
    listingMissingImageCount: dedupedListings.importableListings.filter((listing) => !listing.mainImageUrl).length,
    listingInactiveCount: dedupedListings.importableListings.filter((listing) => {
      const status = listing.listingStatus?.trim().toLowerCase();
      return Boolean(status && status !== "active");
    }).length,
    listingPlan: {
      created: listingPlan.created.length,
      updated: listingPlan.updated.length,
      unchanged: listingPlan.unchanged.length,
      mode: input.existingListings ? "EXISTING_LISTINGS" : "EMPTY_DATABASE_ASSUMPTION"
    },
    orderRowsTotal: input.orderRows.length,
    orderRowsValid: dedupedOrders.importableOrders.length,
    heldRows: parsedOrders.issues.length,
    duplicateRows: dedupedOrders.duplicateIssues.length,
    missingSkuCount: countIssues(parsedOrders.issues, "MISSING_SKU"),
    missingListingCount: orderMappingIssues.filter((issue) => !issue.hasListing).length,
    missingImageCount: orderMappingIssues.filter((issue) => issue.hasListing && !issue.hasImage).length,
    uniqueOrderSkus,
    uniqueTrackingIds,
    multiItemTrackingIds: Array.from(trackingCounts.entries())
      .filter(([, value]) => value.itemCount > 1)
      .map(([trackingId, value]) => ({
        trackingId,
        itemCount: value.itemCount,
        skus: Array.from(value.skus).sort((left, right) => left.localeCompare(right))
      })),
    headers: {
      orders: {
        unknownHeaders: orderHeaders.unknownHeaders,
        missingExpectedHeaders: orderHeaders.missingExpectedHeaders
      },
      listings: {
        unknownHeaders: listingHeaders.unknownHeaders,
        missingExpectedHeaders: listingHeaders.missingExpectedHeaders
      }
    }
  };
}

export function flipkartDryRunDuplicateOrderKeys(rows: FlipkartRawRow[]) {
  const parsedOrders = parseFlipkartOrderRows(rows, "dry-run-orders.xlsx");
  const dedupedOrders = dedupeFlipkartOrderRows(parsedOrders.orders);

  return dedupedOrders.importableOrders.map((order) => flipkartInternalOrderKey(order)).filter((key): key is string => Boolean(key));
}
