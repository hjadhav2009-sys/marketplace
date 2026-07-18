import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DynamicMarketplaceListingForm } from "@/components/DynamicMarketplaceListingForm";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DynamicListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { linkExistingListingAction, resolveMissingListingAction } from "../actions";

const RESOLVABLE_ORDER_ISSUES: string[] = [
  "MISSING_FLIPKART_LISTING_MAPPING",
  "AMBIGUOUS_LISTING",
];

function candidateIdsFromSafeData(safe: Record<string, unknown>) {
  if (!Array.isArray(safe.listingIds)) return [];
  return [...new Set(safe.listingIds)]
    .filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 191)
    .slice(0, 25);
}

export default async function MissingListingIssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const { issueId } = await params;
  const issue = await prisma.importRowIssue.findFirst({
    where: {
      id: issueId,
      batch: { accountId: account.id },
      sourceType: "ORDER",
      issueType: { in: [...RESOLVABLE_ORDER_ISSUES] },
      resolved: false,
    },
    include: { batch: true },
  });
  if (!issue) notFound();

  let safe: Record<string, unknown> = {};
  try {
    safe = JSON.parse(issue.safeDataJson ?? "{}");
  } catch {}
  const sellerSku = String(safe.sellerSku ?? "");
  const ambiguous = issue.issueType === "AMBIGUOUS_LISTING";
  const candidateIds = candidateIdsFromSafeData(safe);
  const [profiles, listings] = await Promise.all([
    ambiguous
      ? Promise.resolve([])
      : prisma.marketplaceFileProfile.findMany({
          where: {
            OR: [{ accountId: account.id }, { accountId: null }],
            marketplace: account.marketplace,
            importPurpose: "PRODUCT_CATALOG",
            active: true,
            formSchemaJson: { not: null },
          },
          orderBy: [{ accountId: "desc" }, { updatedAt: "desc" }],
          take: 12,
        }),
    prisma.marketplaceListing.findMany({
      where: ambiguous
        ? {
            accountId: account.id,
            marketplace: account.marketplace,
            id: { in: candidateIds },
          }
        : {
            accountId: account.id,
            marketplace: account.marketplace,
            ...(sellerSku
              ? { OR: [{ sellerSkuId: { contains: sellerSku } }, { sku: { contains: sellerSku } }] }
              : {}),
          },
      select: { id: true, sellerSkuId: true, productTitle: true },
      take: 25,
    }),
  ]);
  const parsedProfiles = profiles.map((profile) => {
    let schema: DynamicListingFormSchema | null = null;
    try {
      schema = JSON.parse(profile.formSchemaJson ?? "null");
    } catch {}
    return { id: profile.id, name: profile.profileName, schema };
  });
  const knownIdentifiers = [safe.fsn ? { type: "FSN", value: String(safe.fsn) } : null].filter(
    (value): value is { type: string; value: string } => Boolean(value),
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow={ambiguous ? "Ambiguous listing resolution" : "Missing listing resolution"}
          title={ambiguous ? "Choose the Exact Product Inventory Listing" : "Create or link Product Inventory"}
          description={
            ambiguous
              ? "This Order matched more than one listing during import. Choose only from the exact account-scoped candidates retained with the issue."
              : "The marketplace identity is protected. Descriptive fields are optional; released work uses one immutable snapshot."
          }
        />
        <section className="mb-5 rounded-md border bg-white p-4">
          <h2 className="font-black">Link Existing Listing</h2>
          {ambiguous && listings.length < 2 ? (
            <p className="mt-3 rounded-md bg-amber-50 p-3 font-bold text-amber-900">
              The saved candidate set is no longer complete. Re-import or review the listings before releasing this Order.
            </p>
          ) : (
            <form action={linkExistingListingAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="issueId" value={issue.id} />
              <input type="hidden" name="expectedIssueVersion" value={issue.version} />
              <input type="hidden" name="clientRequestId" value={randomUUID()} />
              <select name="listingId" required className="min-h-11 min-w-0 flex-1 rounded-md border px-3">
                <option value="">Choose an exact account listing</option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.sellerSkuId} — {listing.productTitle ?? "No title"}
                  </option>
                ))}
              </select>
              <SubmitButton pendingText="Linking and releasing...">Link Existing</SubmitButton>
            </form>
          )}
        </section>
        {ambiguous ? null : (
          <DynamicMarketplaceListingForm
            action={resolveMissingListingAction}
            issueId={issue.id}
            issueVersion={issue.version}
            clientRequestId={randomUUID()}
            marketplace={account.marketplace}
            sellerSku={sellerSku}
            knownIdentifiers={knownIdentifiers}
            profiles={parsedProfiles}
          />
        )}
      </div>
    </AppShell>
  );
}
