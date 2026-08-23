import { Prisma, type PrismaClient } from "@prisma/client";

export const PRODUCT_DETAIL_ATTRIBUTE_PAGE_SIZE = 40;
export const PRODUCT_DETAIL_ATTRIBUTE_MAX_PAGE_SIZE = 100;

const identityAttributeKeys = ["product_id", "catalog_id", "meesho_product_id", "meesho_catalog_id"];

const detailInclude = {
  identifiers: { where: { active: true }, orderBy: { identifierType: "asc" as const } },
  processRules: { where: { active: true }, take: 1 },
  markingAssetLinks: {
    where: { active: true },
    include: {
      markingAsset: { include: { files: { where: { activeVersion: true }, take: 1 } } }
    }
  }
} satisfies Prisma.MarketplaceListingInclude;

export function productDetailAttributeWhere(
  listingId: string,
  attributeQuery: string
): Prisma.MarketplaceListingAttributeWhereInput {
  return {
    marketplaceListingId: listingId,
    ...(attributeQuery
      ? {
          OR: [
            { displayLabel: { contains: attributeQuery } },
            { technicalKey: { contains: attributeQuery } },
            { valueText: { contains: attributeQuery } }
          ]
        }
      : {})
  };
}

export async function loadProductDetail(
  client: PrismaClient,
  input: { accountId: string; listingId: string; attributeQuery?: string | null; attributePage?: number }
) {
  const attributeQuery = input.attributeQuery?.normalize("NFKC").trim().slice(0, 160) ?? "";
  const requestedPage = Math.max(1, input.attributePage ?? 1);
  const listing = await client.marketplaceListing.findFirst({
    where: { id: input.listingId, accountId: input.accountId },
    include: detailInclude
  });
  if (!listing) return null;

  const where = productDetailAttributeWhere(listing.id, attributeQuery);
  const [attributeTotal, filteredTotal, identityAttributes] = await Promise.all([
    client.marketplaceListingAttribute.count({ where: { marketplaceListingId: listing.id } }),
    client.marketplaceListingAttribute.count({ where }),
    client.marketplaceListingAttribute.findMany({
      where: { marketplaceListingId: listing.id, technicalKey: { in: identityAttributeKeys } },
      select: { technicalKey: true, valueText: true },
      orderBy: { technicalKey: "asc" }
    })
  ]);
  const pageSize = PRODUCT_DETAIL_ATTRIBUTE_PAGE_SIZE;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(filteredTotal / pageSize)));
  const attributes = await client.marketplaceListingAttribute.findMany({
    where,
    select: {
      id: true,
      technicalKey: true,
      displayLabel: true,
      valueText: true,
      valueJson: true,
      sourceAuthority: true,
      manualLocked: true
    },
    orderBy: [{ displayLabel: "asc" }, { technicalKey: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  });
  return { listing, attributes, identityAttributes, attributeQuery, attributeTotal, filteredTotal, page, pageSize };
}

export function displayAttributeValue(valueText: string | null, valueJson: string) {
  if (valueText?.trim()) return valueText.trim();
  try {
    const parsed: unknown = JSON.parse(valueJson);
    if (["string", "number", "boolean"].includes(typeof parsed)) return String(parsed);
  } catch {}
  return "Stored marketplace value";
}

export function parseManualLocks(value: string | null) {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    if (Array.isArray(parsed)) return new Set(parsed.filter((field): field is string => typeof field === "string"));
    if (parsed && typeof parsed === "object") {
      return new Set(Object.entries(parsed).flatMap(([field, locked]) => (locked === true ? [field] : [])));
    }
  } catch {}
  return new Set<string>();
}

export function productImageUrls(listing: Record<string, unknown>) {
  const keys = [
    ...Array.from({ length: 10 }, (_, index) => `image1366Url${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `imageUrl${index + 1}`),
    "mainImageUrl"
  ];
  return [...new Set(keys.map((key) => listing[key]).filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

export function safeExternalHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
