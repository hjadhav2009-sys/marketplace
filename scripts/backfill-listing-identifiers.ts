import { recordAuditLog } from "../lib/audit";
import { prisma } from "../lib/prisma";
import { backfillListingIdentifiers } from "../src/lib/marking/identifiers";

const accountId = process.argv[2]?.trim() || undefined;
const summary = await backfillListingIdentifiers(accountId);
await recordAuditLog({ accountId: accountId ?? null, action: "LISTING_IDENTIFIER_BACKFILLED", entityType: "MarketplaceListingIdentifier", metadata: summary });
console.log(`Identifier backfill complete: ${summary.listings} listings, ${summary.identifiers} identifiers.`);
await prisma.$disconnect();
