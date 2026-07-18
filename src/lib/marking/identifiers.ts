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

type TransactionalIdentifierSyncInput = {
  listing: Pick<MarketplaceListing, "id" | "accountId" | "marketplace" | "sellerSkuId" | "sku" | "fsn" | "listingId">;
  extraIdentifiers?: ListingIdentifierInput[];
  source?: string;
  replaceManagedTypes?: boolean;
};

const MANAGED_IDENTITY_TYPES = new Set<IdentifierType>(["SELLER_SKU", "INTERNAL_SKU", "FSN", "LISTING_ID"]);

/**
 * Synchronize a listing's identifier registry without leaving the caller's
 * transaction. Callers that need cross-listing conflict guarantees must use a
 * serializable transaction because the legacy schema has no account-wide
 * identifier uniqueness constraint.
 */
export async function syncMarketplaceListingIdentifiersInTransaction(
  tx: Prisma.TransactionClient,
  input: TransactionalIdentifierSyncInput
) {
  const marketplace = input.listing.marketplace.toUpperCase() as Marketplace;
  const source = (input.source ?? "MANUAL_OWNER").normalize("NFKC").trim().slice(0, 80) || "MANUAL_OWNER";
  if (input.extraIdentifiers !== undefined && !Array.isArray(input.extraIdentifiers)) throw new Error("Listing identifiers must be submitted as a bounded list.");
  const extras = input.extraIdentifiers ?? [];
  if (extras.length > 250) throw new Error("Too many listing identifiers were submitted.");

  const baseRows = listingIdentifierRows(input.listing).map((row) => ({ ...row, marketplace, source }));
  const extraRows = extras.flatMap((item) => {
    if (!item || typeof item !== "object" || !PRIORITY.includes(item.type)) throw new Error("Identifier type is unsupported.");
    const normalizedValue = normalizeListingIdentifier(item.type, item.value);
    if (!normalizedValue) throw new Error(`${item.type} is blank, invalid, or too long.`);
    const rawValue = String(item.value).normalize("NFKC").trim();
    return [{
      accountId: input.listing.accountId,
      marketplaceListingId: input.listing.id,
      marketplace,
      identifierType: item.type,
      rawValue,
      normalizedValue,
      source,
      active: true
    }];
  });
  const rows = [...new Map([...baseRows, ...extraRows].map((row) => [`${row.identifierType}:${row.normalizedValue}`, row])).values()];

  for (const row of rows) {
    const conflict = await tx.marketplaceListingIdentifier.findFirst({
      where: {
        accountId: input.listing.accountId,
        marketplace,
        identifierType: row.identifierType,
        normalizedValue: row.normalizedValue,
        active: true,
        marketplaceListingId: { not: input.listing.id }
      },
      select: { id: true }
    });
    if (conflict) throw new Error(`${row.identifierType} is already linked to another listing in this account.`);
    await tx.marketplaceListingIdentifier.upsert({
      where: {
        marketplaceListingId_identifierType_normalizedValue: {
          marketplaceListingId: input.listing.id,
          identifierType: row.identifierType,
          normalizedValue: row.normalizedValue
        }
      },
      create: row,
      update: {
        accountId: input.listing.accountId,
        marketplace,
        rawValue: row.rawValue,
        source,
        active: true
      }
    });
  }

  if (input.replaceManagedTypes !== false) {
    const managedTypes = [...new Set<IdentifierType>([
      ...MANAGED_IDENTITY_TYPES,
      ...extras.map((item) => item.type)
    ])];
    const desired = new Set(rows.map((row) => `${row.identifierType}:${row.normalizedValue}`));
    const stale = await tx.marketplaceListingIdentifier.findMany({
      where: {
        marketplaceListingId: input.listing.id,
        accountId: input.listing.accountId,
        marketplace,
        identifierType: { in: managedTypes },
        active: true
      },
      select: { id: true, identifierType: true, normalizedValue: true }
    });
    const staleIds = stale.filter((row) => !desired.has(`${row.identifierType}:${row.normalizedValue}`)).map((row) => row.id);
    if (staleIds.length) await tx.marketplaceListingIdentifier.updateMany({ where: { id: { in: staleIds } }, data: { active: false } });
  }

  return rows.length;
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
