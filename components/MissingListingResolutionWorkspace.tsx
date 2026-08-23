import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { linkExistingListingAction, resolveMissingListingAction } from "@/app/owner/catalog/missing/actions";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DynamicListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { searchProductInventory } from "@/src/lib/product-inventory/search";
import { AppShell } from "./AppShell";
import { BoundedMarketplaceListingForm } from "./BoundedMarketplaceListingForm";
import { PageHeader } from "./PageHeader";
import { ProductImage } from "./ProductImage";
import { SubmitButton } from "./SubmitButton";
import { Surface } from "./ui/Surface";
import { buttonStyles } from "./ui/buttonStyles";

const RESOLVABLE_ORDER_ISSUES = ["MISSING_FLIPKART_LISTING_MAPPING", "AMBIGUOUS_LISTING"];
type Mode = "link" | "minimal" | "full";

function safeObject(value: string | null) {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function savedCandidateIds(safe: Record<string, unknown>) {
  return Array.isArray(safe.listingIds) ? [...new Set(safe.listingIds)].filter((id): id is string => typeof id === "string" && id.length <= 191).slice(0, 25) : [];
}

function modeHref(issueId: string, mode: Mode, listingQ = "") {
  const search = new URLSearchParams({ action: mode });
  if (listingQ) search.set("listingQ", listingQ);
  return `/owner/catalog/missing/${issueId}?${search}`;
}

export async function MissingListingResolutionWorkspace({ params, searchParams }: {
  params: Promise<{ issueId: string }>;
  searchParams: Promise<{ action?: string; listingQ?: string }>;
}) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const [{ issueId }, query] = await Promise.all([params, searchParams]);
  const mode: Mode = query.action === "minimal" || query.action === "full" ? query.action : "link";
  const issue = await prisma.importRowIssue.findFirst({
    where: { id: issueId, batch: { accountId: account.id }, sourceType: "ORDER", issueType: { in: RESOLVABLE_ORDER_ISSUES }, resolved: false },
    include: { batch: true }
  });
  if (!issue) notFound();
  const safe = safeObject(issue.safeDataJson);
  const sellerSku = typeof safe.sellerSku === "string" ? safe.sellerSku : "";
  const ambiguous = issue.issueType === "AMBIGUOUS_LISTING";
  const candidateIds = savedCandidateIds(safe);
  const listingQ = (query.listingQ?.normalize("NFKC").trim().slice(0, 160) || sellerSku).trim();
  const listingResult = mode === "link" && !ambiguous
    ? await searchProductInventory(prisma, { accountId: account.id, marketplace: account.marketplace, query: listingQ, pageSize: 25 })
    : null;
  const candidates = mode === "link" && ambiguous ? await prisma.marketplaceListing.findMany({
    where: { accountId: account.id, marketplace: account.marketplace, id: { in: candidateIds } },
    select: { id: true, sellerSkuId: true, productTitle: true, fsn: true, listingId: true, mainImageUrl: true, listingStatus: true },
    take: 25
  }) : listingResult?.listings ?? [];
  const profiles = mode === "full" ? await prisma.marketplaceFileProfile.findMany({
    where: { OR: [{ accountId: account.id }, { accountId: null }], marketplace: account.marketplace, importPurpose: "PRODUCT_CATALOG", active: true, formSchemaJson: { not: null } },
    orderBy: [{ accountId: "desc" }, { updatedAt: "desc" }],
    take: 12
  }) : [];
  const parsedProfiles = profiles.map((profile) => { let schema: DynamicListingFormSchema | null = null; try { schema = JSON.parse(profile.formSchemaJson ?? "null"); } catch {} return { id: profile.id, name: profile.profileName, schema }; });
  const knownIdentifiers = [safe.fsn ? { type: "FSN", value: String(safe.fsn) } : null].filter((value): value is { type: string; value: string } => Boolean(value));

  return <AppShell><div className="mx-auto max-w-5xl">
    <PageHeader eyebrow={ambiguous ? "Exact selection required" : "Missing listing resolution"} title={sellerSku || "Resolve retained Order row"} description="Choose one resolution path. Seller identity and held-work release remain protected by the existing account-scoped service."><Link href="/owner/catalog/missing" className={buttonStyles({ variant: "quiet" })}>Back to Missing Listings</Link></PageHeader>
    <Surface padding="compact" className="mb-4"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Fact label="Source" value={`Order import row ${issue.rowNumber ?? "unknown"}`}/><Fact label="Marketplace" value={account.marketplace}/><Fact label="Seller SKU" value={sellerSku || "Unavailable"}/><Fact label="Reason" value={ambiguous ? "Multiple exact candidates" : "No account listing found"}/></dl><p className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600">{issue.message}</p></Surface>
    <nav aria-label="Resolution method" className="mb-4 grid gap-2 sm:grid-cols-3">{([['link','Link existing','Use an exact account listing'],['minimal','Create minimal','Identity now; enrich later'],['full','Create full','Add complete catalog detail']] as const).map(([value,label,description]) => <Link key={value} href={modeHref(issue.id, value)} aria-current={mode === value ? "page" : undefined} className={`min-h-16 rounded-md border p-3 ${mode === value ? "border-berry bg-pink-50" : "border-slate-200 bg-white hover:bg-stone-50"}`}><span className="block font-semibold text-slate-950">{label}</span><span className="mt-1 block text-xs text-slate-600">{description}</span></Link>)}</nav>
    {mode === "link" ? <Surface><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Link an existing listing</h2><p className="mt-1 text-sm text-slate-600">{ambiguous ? "Only candidates retained with this issue can release the row." : "Exact identifier matches appear before broader catalog matches."}</p></div>{!ambiguous ? <form className="flex w-full gap-2 sm:w-auto"><input type="hidden" name="action" value="link"/><label className="min-w-0 flex-1 sm:w-72"><span className="sr-only">Search Product Inventory</span><input className="ui-field-control w-full" name="listingQ" type="search" defaultValue={listingQ} placeholder="Seller SKU, FSN, title, or ID"/></label><button className={buttonStyles({ variant: "secondary" })}>Search</button></form> : null}</div>
      {ambiguous && candidates.length < 2 ? <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">The retained candidate set is no longer complete. Re-import or review Product Inventory before releasing this Order.</p> : <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{candidates.map((candidate) => <form key={candidate.id} action={linkExistingListingAction} className="grid min-w-0 gap-3 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:items-center"><ProductImage src={candidate.mainImageUrl} alt={candidate.productTitle ?? candidate.sellerSkuId} size="sm" showBadge={false}/><div className="min-w-0"><p className="break-words font-semibold">{candidate.sellerSkuId}</p><p className="line-clamp-2 text-sm text-slate-600">{candidate.productTitle ?? "No title"}</p><p className="mt-1 break-all text-xs text-slate-500">{candidate.fsn ?? "No FSN"} / {candidate.listingId ?? "No listing ID"}</p></div><input type="hidden" name="issueId" value={issue.id}/><input type="hidden" name="expectedIssueVersion" value={issue.version}/><input type="hidden" name="clientRequestId" value={randomUUID()}/><input type="hidden" name="listingId" value={candidate.id}/><SubmitButton pendingText="Linking safely...">Choose listing</SubmitButton></form>)}</div>}
      {!candidates.length && !(ambiguous && candidates.length < 2) ? <p className="mt-4 rounded-md border border-dashed p-5 text-sm text-slate-600">No account listing matches this search. Try another identity or choose a create path.</p> : null}
    </Surface> : null}
    {mode === "minimal" ? <Surface><h2 className="text-lg font-semibold">Create minimal account listing</h2><p className="mt-1 text-sm leading-6 text-slate-600">Creates only the protected seller identity and optional title, then releases this retained row through the normal service.</p><form action={resolveMissingListingAction} className="mt-4 grid gap-4 sm:grid-cols-2"><input type="hidden" name="issueId" value={issue.id}/><input type="hidden" name="expectedIssueVersion" value={issue.version}/><input type="hidden" name="clientRequestId" value={randomUUID()}/><input type="hidden" name="resolutionAction" value="CREATE_MINIMAL"/><Fact label="Protected Seller SKU" value={sellerSku}/><label className="font-semibold">Title (optional)<input className="ui-field-control mt-1 w-full" name="productTitle" maxLength={500}/></label><label className="flex min-h-11 items-center gap-2 sm:col-span-2"><input type="checkbox" name="manualLocked" defaultChecked/> Protect entered values from automated refresh</label><div className="sm:col-span-2"><SubmitButton pendingText="Creating and releasing...">Create minimal listing</SubmitButton></div></form></Surface> : null}
    {mode === "full" ? <BoundedMarketplaceListingForm action={resolveMissingListingAction} issueId={issue.id} issueVersion={issue.version} clientRequestId={randomUUID()} marketplace={account.marketplace} sellerSku={sellerSku} knownIdentifiers={knownIdentifiers} profiles={parsedProfiles} showMinimalAction={false}/> : null}
  </div></AppShell>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd></div>; }
