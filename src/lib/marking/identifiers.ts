import type { IdentifierType, Marketplace, MarketplaceListing, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_IDENTIFIER_LENGTH = 160;
const COMPACT_TYPES = new Set<IdentifierType>(["EAN", "UPC", "GTIN", "BARCODE"]);
const PRIORITY: IdentifierType[] = [
  "SELLER_SKU",
  "FSN",
  "LISTING_ID",
  "LID",
  "ASIN",
  "FNSKU",
  "EAN",
  "UPC",
  "GTIN",
  "BARCODE",
  "MODEL_NUMBER",
  "INTERNAL_SKU",
  "EXTERNAL_ID"
];

export type ListingIdentifierInput = { type: IdentifierType; value: unknown };
export type ListingMatchResult =
  | { status: "INVALID"; candidates: []; identifier: null }
  | { status: "NOT_FOUND"; candidates: []; identifier: { type: IdentifierType; normalizedValue: string } }
  | { status: "EXACT_UNIQUE"; candidates: MarketplaceListing[]; identifier: { type: IdentifierType; normalizedValue: string } }
  | { status: "EXACT_MULTIPLE"; candidates: MarketplaceListing[]; identifier: { type: IdentifierType; normalizedValue: string } }
  | { status: "IDENTIFIER_CONFLICT"; candidates: MarketplaceListing[]; identifier: { type: IdentifierType; normalizedValue: string } };

export function normalizeListingIdentifier(type: IdentifierType, value: unknown) {
  const raw = String(value ?? "").normalize("NFKC").trim();
  if (!raw || raw.length > MAX_IDENTIFIER_LENGTH || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  const normalized = COMPACT_TYPES.has(type) ? raw.replace(/[\s-]+/g, "") : raw;
  return normalized.toUpperCase();
}

export async function upsertListingIdentifier(input: {
  accountId: string;
  marketplaceListingId: string;
  marketplace: Marketplace;
  identifierType: IdentifierType;
  rawValue: string;
  source?: string;
}) {
  const normalizedValue = normalizeListingIdentifier(input.identifierType, input.rawValue);
  if (!normalizedValue) throw new Error("Identifier is blank, invalid, or too long.");

  return prisma.marketplaceListingIdentifier.upsert({
    where: {
      marketplaceListingId_identifierType_normalizedValue: {
        marketplaceListingId: input.marketplaceListingId,
        identifierType: input.identifierType,
        normalizedValue
      }
    },
    create: { ...input, normalizedValue, source: input.source ?? "MANUAL", active: true },
    update: { accountId: input.accountId, marketplace: input.marketplace, rawValue: input.rawValue.trim(), source: input.source ?? "MANUAL", active: true }
  });
}

export function listingIdentifierRows(listing: Pick<MarketplaceListing, "id" | "accountId" | "marketplace" | "sellerSkuId" | "sku" | "fsn" | "listingId">) {
  const marketplace = listing.marketplace.toUpperCase() as Marketplace;
  const inputs: ListingIdentifierInput[] = [
    { type: "SELLER_SKU", value: listing.sellerSkuId },
    { type: "INTERNAL_SKU", value: listing.sku },
    { type: "FSN", value: listing.fsn },
    { type: "LISTING_ID", value: listing.listingId }
  ];

  return inputs.flatMap((input) => {
    const normalizedValue = normalizeListingIdentifier(input.type, input.value);
    if (!normalizedValue) return [];
    return [{
      accountId: listing.accountId,
      marketplaceListingId: listing.id,
      marketplace,
      identifierType: input.type,
      rawValue: String(input.value).trim(),
      normalizedValue,
      source: "LISTING_IMPORT",
      active: true
    }];
  });
}

export async function syncIdentifiersForMarketplaceListing(listing: Pick<MarketplaceListing, "id" | "accountId" | "marketplace" | "sellerSkuId" | "sku" | "fsn" | "listingId">) {
  const rows = listingIdentifierRows(listing);
  await prisma.$transaction([
    prisma.marketplaceListingIdentifier.deleteMany({ where: { marketplaceListingId: listing.id, source: { in: ["LISTING_IMPORT", "BACKFILL_20260711"] } } }),
    ...(rows.length ? [prisma.marketplaceListingIdentifier.createMany({ data: rows })] : [])
  ]);
  return rows.length;
}

export async function syncIdentifiersForImportedListings(input: { accountId: string; importedAt: Date }) {
  let cursor: string | undefined;
  let syncedListings = 0;
  let syncedIdentifiers = 0;

  while (true) {
    const listings = await prisma.marketplaceListing.findMany({
      where: { accountId: input.accountId, lastImportedAt: input.importedAt },
      select: { id: true, accountId: true, marketplace: true, sellerSkuId: true, sku: true, fsn: true, listingId: true },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (!listings.length) break;

    const ids = listings.map((listing) => listing.id);
    const rows = listings.flatMap(listingIdentifierRows);
    await prisma.$transaction([
      prisma.marketplaceListingIdentifier.deleteMany({ where: { marketplaceListingId: { in: ids }, source: { in: ["LISTING_IMPORT", "BACKFILL_20260711"] } } }),
      ...(rows.length ? [prisma.marketplaceListingIdentifier.createMany({ data: rows })] : [])
    ]);
    syncedListings += listings.length;
    syncedIdentifiers += rows.length;
    cursor = listings.at(-1)?.id;
  }

  return { syncedListings, syncedIdentifiers };
}

export async function findListingMatchesByIdentifiers(input: { accountId: string; marketplace?: Marketplace; identifiers: ListingIdentifierInput[] }, client: PrismaClient | Prisma.TransactionClient = prisma): Promise<ListingMatchResult> {
  const ordered = [...input.identifiers]
    .map((item) => ({ type: item.type, normalizedValue: normalizeListingIdentifier(item.type, item.value) }))
    .filter((item): item is { type: IdentifierType; normalizedValue: string } => Boolean(item.normalizedValue))
    .sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));

  if (!ordered.length) return { status: "INVALID", candidates: [], identifier: null };

  const matches: Array<{identifier: typeof ordered[number]; candidates: MarketplaceListing[]}> = [];
  for (const identifier of ordered) {
    const rows = await client.marketplaceListingIdentifier.findMany({
      where: { accountId: input.accountId, marketplace: input.marketplace, identifierType: identifier.type, normalizedValue: identifier.normalizedValue, active: true },
      include: { marketplaceListing: true },
      take: 25
    });
    const candidates = [...new Map(rows.map((row) => [row.marketplaceListing.id, row.marketplaceListing])).values()];
    if (candidates.length) matches.push({identifier,candidates});
  }

  if(matches.length){
    const first=matches[0],union=[...new Map(matches.flatMap(match=>match.candidates).map(candidate=>[candidate.id,candidate])).values()];
    const intersection=first.candidates.filter(candidate=>matches.every(match=>match.candidates.some(item=>item.id===candidate.id)));
    if(intersection.length===1)return{status:"EXACT_UNIQUE",candidates:intersection,identifier:first.identifier};
    if(union.length===1)return{status:"EXACT_UNIQUE",candidates:union,identifier:first.identifier};
    if(matches.length>1&&intersection.length===0)return{status:"IDENTIFIER_CONFLICT",candidates:union,identifier:first.identifier};
    return{status:"EXACT_MULTIPLE",candidates:union,identifier:first.identifier};
  }

  return { status: "NOT_FOUND", candidates: [], identifier: ordered[0] };
}

export async function backfillListingIdentifiers(accountId?: string) {
  const listings = await prisma.marketplaceListing.findMany({
    where: accountId ? { accountId } : undefined,
    select: { id: true, accountId: true, marketplace: true, sellerSkuId: true, sku: true, fsn: true, listingId: true }
  });
  let identifiers = 0;
  for (const listing of listings) identifiers += await syncIdentifiersForMarketplaceListing(listing);
  return { listings: listings.length, identifiers };
}
