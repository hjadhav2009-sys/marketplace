import { IdentifierType, Prisma, type PrismaClient } from "@prisma/client";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";

export const PRODUCT_INVENTORY_PAGE_SIZE = 25;

export type ProductInventorySearchInput = {
  accountId: string;
  query?: string | null;
  status?: string | null;
  route?: string | null;
  image?: string | null;
  page?: number;
  pageSize?: number;
};

const include = {
  identifiers: { where: { active: true }, orderBy: { identifierType: "asc" as const } },
  processRules: { where: { active: true }, take: 1 },
  markingAssetLinks: { where: { active: true }, take: 1 }
} satisfies Prisma.MarketplaceListingInclude;

function normalizedIdentifierValues(query: string) {
  return [...new Set(Object.values(IdentifierType).map((type) => normalizeListingIdentifier(type, query)).filter((value): value is string => Boolean(value)))];
}

export function productInventoryBaseWhere(input: ProductInventorySearchInput): Prisma.MarketplaceListingWhereInput {
  return {
    accountId: input.accountId,
    ...(input.status === "active" ? { listingStatus: { notIn: ["INACTIVE", "ARCHIVED"] } } : input.status === "inactive" ? { listingStatus: { in: ["INACTIVE", "ARCHIVED"] } } : {}),
    ...(input.route === "none" ? { processRules: { none: { active: true } } } : input.route ? { processRules: { some: { active: true, route: input.route as never } } } : {}),
    ...(input.image === "missing" ? { mainImageUrl: null } : input.image === "available" ? { mainImageUrl: { not: null } } : {})
  };
}

export function productInventoryExactWhere(query: string): Prisma.MarketplaceListingWhereInput {
  const normalizedValues = normalizedIdentifierValues(query);
  return {
    OR: [
      { sellerSkuId: { equals: query } },
      { sku: { equals: query } },
      { fsn: { equals: query } },
      { listingId: { equals: query } },
      { identifiers: { some: { active: true, OR: [{ rawValue: { equals: query } }, { normalizedValue: { in: normalizedValues } }] } } }
    ]
  };
}

export function productInventoryContainsWhere(query: string): Prisma.MarketplaceListingWhereInput {
  const normalizedValues = normalizedIdentifierValues(query);
  return {
    OR: [
      { sellerSkuId: { contains: query } },
      { sku: { contains: query } },
      { fsn: { contains: query } },
      { listingId: { contains: query } },
      { productTitle: { contains: query } },
      { liveTitle: { contains: query } },
      { liveCategory: { contains: query } },
      { subCategory: { contains: query } },
      { identifiers: { some: { active: true, OR: [{ rawValue: { contains: query } }, { normalizedValue: { in: normalizedValues } }] } } }
    ]
  };
}

export async function searchProductInventory(client: PrismaClient, input: ProductInventorySearchInput) {
  const query = input.query?.trim().slice(0, 160) ?? "";
  const pageSize = Math.max(1, Math.min(input.pageSize ?? PRODUCT_INVENTORY_PAGE_SIZE, 100));
  const page = Math.max(1, input.page ?? 1);
  const skip = (page - 1) * pageSize;
  const base = productInventoryBaseWhere(input);
  const exact = query ? productInventoryExactWhere(query) : undefined;
  const contains = query ? productInventoryContainsWhere(query) : undefined;
  const allWhere: Prisma.MarketplaceListingWhereInput = contains ? { AND: [base, contains] } : base;
  const nonExactWhere: Prisma.MarketplaceListingWhereInput = exact ? { AND: [base, contains!, { NOT: exact }] } : base;

  const [total, exactCount] = await Promise.all([
    client.marketplaceListing.count({ where: allWhere }),
    exact ? client.marketplaceListing.count({ where: { AND: [base, exact] } }) : Promise.resolve(0)
  ]);

  const exactTake = Math.max(0, Math.min(pageSize, exactCount - skip));
  const exactRows = exactTake > 0 && exact
    ? await client.marketplaceListing.findMany({ where: { AND: [base, exact] }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take: exactTake, include })
    : [];
  const remaining = pageSize - exactRows.length;
  const nonExactSkip = Math.max(0, skip - exactCount);
  const otherRows = remaining > 0
    ? await client.marketplaceListing.findMany({ where: nonExactWhere, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: nonExactSkip, take: remaining, include })
    : [];

  return { query, page, pageSize, total, exactCount, listings: [...exactRows, ...otherRows] };
}
