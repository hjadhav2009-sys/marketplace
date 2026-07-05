import { normalizeSkuForMatching } from "@/lib/sku";
import type { FlipkartListingLine, FlipkartParseIssue } from "./parser";

export const FLIPKART_LISTING_IMPORT_BATCH_SIZE = 500;
export const FLIPKART_DUPLICATE_SELLER_SKU_ID = "DUPLICATE_SELLER_SKU_ID";

export type FlipkartListingMasterData = {
  marketplace: string;
  sellerSkuId: string;
  sku: string;
  productTitle: string | null;
  subCategory: string | null;
  fsn: string | null;
  listingId: string | null;
  listingStatus: string | null;
  mrp: number | null;
  sellingPrice: number | null;
  liveTitle: string | null;
  liveBrand: string | null;
  liveCategory: string | null;
  livePrice: number | null;
  liveMrp: number | null;
  rating: number | null;
  reviewCount: number | null;
  productHighlights: string | null;
  description: string | null;
  allSpecifications: string | null;
  generatedDirectProductUrl: string | null;
  canonicalProductUrl: string | null;
  scrapeStatus: string | null;
  scrapeError: string | null;
  imageUrl1: string | null;
  imageUrl2: string | null;
  imageUrl3: string | null;
  imageUrl4: string | null;
  imageUrl5: string | null;
  imageUrl6: string | null;
  imageUrl7: string | null;
  imageUrl8: string | null;
  imageUrl9: string | null;
  imageUrl10: string | null;
  image1366Url1: string | null;
  image1366Url2: string | null;
  image1366Url3: string | null;
  image1366Url4: string | null;
  image1366Url5: string | null;
  image1366Url6: string | null;
  image1366Url7: string | null;
  image1366Url8: string | null;
  image1366Url9: string | null;
  image1366Url10: string | null;
  mainImageUrl: string | null;
};

export type FlipkartListingMasterComparable = FlipkartListingMasterData;

export type FlipkartListingMasterImportPlan<T extends { sellerSkuId: string; sku: string }> = {
  created: T[];
  updated: T[];
  unchanged: T[];
};

export type FlipkartListingDedupeResult = {
  importableListings: FlipkartListingLine[];
  duplicateIssues: FlipkartParseIssue[];
};

function optionalText(value: string | null | undefined) {
  return value === undefined ? null : value;
}

function optionalNumber(value: number | null | undefined) {
  return value === undefined ? null : value;
}

function imageValue(values: Array<string | undefined>, index: number) {
  return values[index] ?? null;
}

export function flipkartListingIsInactive(listing: Pick<FlipkartListingLine, "listingStatus">) {
  const status = listing.listingStatus?.trim().toLowerCase();
  return Boolean(status && status !== "active");
}

export function chunkFlipkartListingRows<T>(rows: T[], batchSize = FLIPKART_LISTING_IMPORT_BATCH_SIZE) {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += safeBatchSize) {
    chunks.push(rows.slice(index, index + safeBatchSize));
  }

  return chunks;
}

export function dedupeFlipkartListingRows(listings: FlipkartListingLine[]): FlipkartListingDedupeResult {
  const seenSkus = new Set<string>();
  const duplicateIssues: FlipkartParseIssue[] = [];
  const importableListings = listings.filter((listing) => {
    const sku = normalizeSkuForMatching(listing.sellerSkuId ?? listing.sku);

    if (!sku) {
      return false;
    }

    if (seenSkus.has(sku)) {
      duplicateIssues.push({
        rowNumber: listing.rowNumber,
        issueType: FLIPKART_DUPLICATE_SELLER_SKU_ID,
        message: `Duplicate Flipkart Seller SKU Id skipped for ${sku}.`,
        rawData: listing.rawData
      });
      return false;
    }

    seenSkus.add(sku);
    return true;
  });

  return {
    importableListings,
    duplicateIssues
  };
}

export function flipkartListingMasterData(listing: FlipkartListingLine): FlipkartListingMasterData {
  const sku = normalizeSkuForMatching(listing.sku ?? listing.sellerSkuId);

  return {
    marketplace: "FLIPKART",
    sellerSkuId: sku,
    sku,
    productTitle: optionalText(listing.productTitle),
    subCategory: optionalText(listing.subCategory),
    fsn: optionalText(listing.fsn),
    listingId: optionalText(listing.listingId),
    listingStatus: optionalText(listing.listingStatus),
    mrp: optionalNumber(listing.mrp),
    sellingPrice: optionalNumber(listing.sellingPrice),
    liveTitle: optionalText(listing.liveTitle),
    liveBrand: optionalText(listing.liveBrand),
    liveCategory: optionalText(listing.liveCategory),
    livePrice: optionalNumber(listing.livePrice),
    liveMrp: optionalNumber(listing.liveMrp),
    rating: optionalNumber(listing.rating),
    reviewCount: optionalNumber(listing.reviewCount),
    productHighlights: optionalText(listing.productHighlights),
    description: optionalText(listing.description),
    allSpecifications: optionalText(listing.allSpecifications),
    generatedDirectProductUrl: optionalText(listing.generatedDirectProductUrl ?? listing.productUrl),
    canonicalProductUrl: optionalText(listing.canonicalProductUrl),
    scrapeStatus: optionalText(listing.scrapeStatus),
    scrapeError: optionalText(listing.scrapeError),
    imageUrl1: imageValue(listing.imageUrls, 0),
    imageUrl2: imageValue(listing.imageUrls, 1),
    imageUrl3: imageValue(listing.imageUrls, 2),
    imageUrl4: imageValue(listing.imageUrls, 3),
    imageUrl5: imageValue(listing.imageUrls, 4),
    imageUrl6: imageValue(listing.imageUrls, 5),
    imageUrl7: imageValue(listing.imageUrls, 6),
    imageUrl8: imageValue(listing.imageUrls, 7),
    imageUrl9: imageValue(listing.imageUrls, 8),
    imageUrl10: imageValue(listing.imageUrls, 9),
    image1366Url1: imageValue(listing.image1366Urls, 0),
    image1366Url2: imageValue(listing.image1366Urls, 1),
    image1366Url3: imageValue(listing.image1366Urls, 2),
    image1366Url4: imageValue(listing.image1366Urls, 3),
    image1366Url5: imageValue(listing.image1366Urls, 4),
    image1366Url6: imageValue(listing.image1366Urls, 5),
    image1366Url7: imageValue(listing.image1366Urls, 6),
    image1366Url8: imageValue(listing.image1366Urls, 7),
    image1366Url9: imageValue(listing.image1366Urls, 8),
    image1366Url10: imageValue(listing.image1366Urls, 9),
    mainImageUrl: optionalText(listing.mainImageUrl ?? listing.imageUrl)
  };
}

export function sameFlipkartListingMaster(existing: FlipkartListingMasterComparable, next: FlipkartListingMasterData) {
  return Object.keys(next).every((key) => {
    const typedKey = key as keyof FlipkartListingMasterData;
    return (existing[typedKey] ?? null) === (next[typedKey] ?? null);
  });
}

export function planFlipkartListingMasterImport<T extends { sellerSkuId: string; sku: string; data: FlipkartListingMasterData }>(
  existingListings: FlipkartListingMasterComparable[],
  rows: T[]
): FlipkartListingMasterImportPlan<T> {
  const existingBySku = new Map(existingListings.map((listing) => [normalizeSkuForMatching(listing.sellerSkuId), listing]));

  return rows.reduce<FlipkartListingMasterImportPlan<T>>(
    (plan, row) => {
      const existing = existingBySku.get(normalizeSkuForMatching(row.sellerSkuId));

      if (!existing) {
        plan.created.push(row);
      } else if (sameFlipkartListingMaster(existing, row.data)) {
        plan.unchanged.push(row);
      } else {
        plan.updated.push(row);
      }

      return plan;
    },
    { created: [], updated: [], unchanged: [] }
  );
}

export function selectFlipkartListingImagesForOrderSkus<T extends { sku: string; mainImageUrl: string | null }>(listings: T[], orderSkus: string[]) {
  const neededSkus = new Set(orderSkus.map((sku) => normalizeSkuForMatching(sku)).filter(Boolean));
  const selected = new Map<string, T>();

  for (const listing of listings) {
    const sku = normalizeSkuForMatching(listing.sku);

    if (neededSkus.has(sku) && listing.mainImageUrl && !selected.has(sku)) {
      selected.set(sku, listing);
    }
  }

  return Array.from(selected.values());
}
