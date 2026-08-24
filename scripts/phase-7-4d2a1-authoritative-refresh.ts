import { PrismaClient } from "@prisma/client";
import { mergeMarketplaceCatalogRows } from "@/src/lib/product-inventory/merge";

type Input = { accountId: string; sellerSku: string; sourceFileId: string; title: string; listingStatus: string };
const input = JSON.parse(process.argv[2] ?? "null") as Input | null;
if (!input?.accountId || !input.sellerSku || !input.sourceFileId) throw new Error("Synthetic D2A.1 refresh input is incomplete.");

const db = new PrismaClient();
try {
  const result = await mergeMarketplaceCatalogRows({ accountId: input.accountId, marketplace: "AMAZON", rows: [{
    version: 1,
    marketplace: "AMAZON",
    accountId: input.accountId,
    sourceFileId: input.sourceFileId,
    sourceTable: "Synthetic authoritative Amazon catalog",
    sourceRow: 2,
    sourceProfile: "AMAZON_ALL_LISTINGS",
    sourceAuthority: 400,
    sellerSku: input.sellerSku,
    title: input.title,
    listingStatus: input.listingStatus
  }] }, db);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await db.$disconnect();
}
