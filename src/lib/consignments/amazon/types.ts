import type { ConsignmentImportFileType } from "@prisma/client";

export type AmazonSourceProfile = "SHIPMENT" | "ALL_LISTINGS" | "CATEGORY_CATALOG" | "PRODUCT_CATALOG" | "SUPPORTING" | "UNKNOWN";

export type AmazonConsignmentSourceRow = {
  rowNumber: number;
  shipmentId: string | null;
  shipmentName: string | null;
  destinationText: string | null;
  sellerSku: string | null;
  fnsku: string | null;
  asin: string | null;
  externalId: string | null;
  ean: string | null;
  upc: string | null;
  gtin: string | null;
  requiredQuantity: number | null;
  productTitle: string | null;
  brand: string | null;
  category: string | null;
  subCategory: string | null;
  material: string | null;
  color: string | null;
  size: string | null;
  modelNumber: string | null;
  description: string | null;
  bulletPoints: string[];
  mainImageUrl: string | null;
  imageUrls: string[];
  listingStatus: string | null;
  sourceFileId: string | null;
  sourceSheet: string;
  sourceProfile: AmazonSourceProfile;
};

export type AmazonParserIssue = { rowNumber?: number; sheet?: string; issueType: string; severity: "INFO" | "WARNING" | "ERROR"; message: string };
export type AmazonParsedTable = { sheet: string; headers: string[]; profile: AmazonSourceProfile; fileType: ConsignmentImportFileType; confidence: number; headerRow: number; labelRow?: number; dataRow: number; rows: AmazonConsignmentSourceRow[]; issues: AmazonParserIssue[] };
export type AmazonParsedFile = { fileName: string; tables: AmazonParsedTable[]; fileType: ConsignmentImportFileType; shipmentCandidateCount: number; totalRows: number };

export type ConsignmentCatalogSnapshotV1 = {
  version: 1;
  marketplace: "FLIPKART" | "AMAZON";
  title?: string;
  brand?: string;
  category?: string;
  subCategory?: string;
  material?: string;
  color?: string;
  size?: string;
  modelNumber?: string;
  description?: string;
  bulletPoints?: string[];
  mainImageUrl?: string;
  imageUrls?: string[];
  identifiers: { sellerSku?: string; fsn?: string; listingId?: string; asin?: string; fnsku?: string; externalId?: string; ean?: string; upc?: string; gtin?: string };
  provenance: { shipmentFileId?: string; listingFileId?: string; catalogFileIds?: string[] };
};
