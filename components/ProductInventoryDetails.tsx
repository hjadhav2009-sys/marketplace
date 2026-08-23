import Link from "next/link";
import { saveCatalogFieldLocksAction } from "@/app/owner/product-inventory/[listingId]/actions";
import { LOCKABLE_CATALOG_FIELDS } from "@/app/owner/product-inventory/[listingId]/fields";
import { marketplaceIdentities, markingLabel, processingLabel } from "@/app/owner/product-inventory/presentation";
import { formatDateTime } from "@/lib/format";
import { displayAttributeValue, loadProductDetail, parseManualLocks, productImageUrls, safeExternalHttpUrl } from "@/lib/product-inventory-details";
import { stableActionRequestId } from "@/lib/stable-action-request-id";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";
import { SubmitButton } from "./SubmitButton";
import { Surface } from "./ui/Surface";
import { buttonStyles } from "./ui/buttonStyles";
import { WorkImageGallery } from "./WorkImageGallery";
import { ProfessionalProcessRuleEditor } from "./ProfessionalProcessRuleEditor";

type DetailResult = NonNullable<Awaited<ReturnType<typeof loadProductDetail>>>;

const fieldLabel = (field: string) => field.toLowerCase() === "mrp"
  ? "MRP"
  : field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());

function detailHref(listingId: string, input: { empty: boolean; query: string; page?: number }) {
  const search = new URLSearchParams();
  if (input.empty) search.set("empty", "1");
  if (input.query) search.set("attributeQ", input.query);
  if ((input.page ?? 1) > 1) search.set("attributePage", String(input.page));
  return `/owner/product-inventory/${listingId}${search.size ? `?${search}` : ""}#marketplace-attributes`;
}

export function ProductInventoryDetails({ result, accountName, showEmpty }: { result: DetailResult; accountName: string; showEmpty: boolean }) {
  const { listing, attributes, identityAttributes, attributeQuery, attributeTotal, filteredTotal, page, pageSize } = result;
  const rule = listing.processRules[0];
  const assets = listing.markingAssetLinks.map(({ markingAsset }) => ({
    id: markingAsset.id,
    label: markingAsset.masterDesignId ?? markingAsset.name,
    hasFile: Boolean(markingAsset.files.length)
  }));
  const locks = parseManualLocks(listing.manualLocksJson);
  const lockRequestId = stableActionRequestId("catalog-locks", listing.id, listing.updatedAt);
  const marketplaceLinks = [
    { label: "Generated Direct Product URL", href: safeExternalHttpUrl(listing.generatedDirectProductUrl) },
    { label: "Canonical Product URL", href: safeExternalHttpUrl(listing.canonicalProductUrl) }
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));
  const identities = marketplaceIdentities({
    marketplace: listing.marketplace,
    sellerSkuId: listing.sellerSkuId,
    sku: listing.sku,
    fsn: listing.fsn,
    listingId: listing.listingId,
    identifiers: listing.identifiers,
    attributes: identityAttributes
  });

  return <div className="mx-auto max-w-7xl">
    <PageHeader eyebrow={`${listing.marketplace} / ${accountName}`} title={listing.productTitle ?? listing.sellerSkuId} description="Account-scoped identity, saved processing truth, and marketplace detail in one operational record.">
      <div className="flex flex-wrap gap-2"><Link href="/owner/product-inventory" className={buttonStyles({ variant: "quiet" })}>Back to inventory</Link><Link href={`/owner/product-inventory/${listing.id}/edit`} className={buttonStyles()}>Edit listing</Link></div>
    </PageHeader>
    <Surface padding="compact" className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge value={listing.listingStatus ?? "UNKNOWN"}/><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{listing.marketplace}</span></div><p className="text-xs text-slate-500">Refreshed {listing.lastImportedAt ? formatDateTime(listing.lastImportedAt) : "not yet"}</p></div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Seller SKU" value={listing.sellerSkuId}/><Summary label="Marketplace identity" value={identities.find((item) => item.label !== "Seller SKU" && item.value)?.value ?? "Not provided"}/><Summary label="Default processing" value={processingLabel(rule?.route)}/><Summary label="Last changed" value={formatDateTime(listing.updatedAt)}/></dl>
    </Surface>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4">
        <WorkImageGallery images={productImageUrls(listing as unknown as Record<string, unknown>)} alt={listing.productTitle ?? listing.sellerSkuId} priority/>
        {marketplaceLinks.length ? <Surface padding="compact"><h2 className="font-semibold text-slate-950">Marketplace links</h2><p className="mt-1 text-sm leading-6 text-slate-600">Open only validated HTTP or HTTPS catalog destinations.</p><div className="mt-3 grid gap-2">{marketplaceLinks.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "quiet", className: "w-full justify-between" })}><span>{link.label}</span><span aria-hidden="true">↗</span></a>)}</div></Surface> : null}
        <Surface padding="compact"><h2 className="font-semibold text-slate-950">Saved processing truth</h2><p className="mt-1 text-sm leading-6 text-slate-600">No saved default uses Direct to Pack. Active work keeps its frozen route snapshot.</p><dl className="my-3 grid gap-2"><Summary label="Route" value={processingLabel(rule?.route)}/><Summary label="Marking" value={markingLabel(rule?.route, Boolean(listing.markingAssetLinks.length))}/><Summary label="Assembly" value={rule?.route.includes("ASSEMBLE") ? rule.assemblyTitle ?? "Assembly configured" : "Not required by default"}/></dl><ProfessionalProcessRuleEditor listingId={listing.id} rule={rule} assets={assets}/></Surface>
        <Surface padding="compact"><h2 className="font-semibold text-slate-950">Manual protection</h2><p className="mt-1 text-sm leading-6 text-slate-600">Protected owner values survive marketplace refresh. Unchecked fields remain refreshable.</p><form action={saveCatalogFieldLocksAction} className="mt-3"><input type="hidden" name="marketplaceListingId" value={listing.id}/><input type="hidden" name="expectedUpdatedAt" value={listing.updatedAt.toISOString()}/><input type="hidden" name="clientRequestId" value={lockRequestId}/><fieldset className="grid gap-2"><legend className="sr-only">Fields protected from automated refresh</legend>{LOCKABLE_CATALOG_FIELDS.map((field) => <label key={field} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-stone-50"><input type="checkbox" name="lockedField" value={field} defaultChecked={locks.has(field)}/>{fieldLabel(field)}</label>)}</fieldset><SubmitButton className="mt-3 w-full" pendingText="Saving protection...">Save protection</SubmitButton></form></Surface>
      </aside>
      <main className="min-w-0 space-y-4">
        <Surface padding="compact"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">Listing record</h2><p className="mt-1 text-sm text-slate-600">Operational values appear first. Empty supported fields stay hidden by default.</p></div><Link href={detailHref(listing.id, { empty: !showEmpty, query: attributeQuery, page })} className={buttonStyles({ variant: "quiet" })}>{showEmpty ? "Hide empty fields" : "Show empty fields"}</Link></div><div className="mt-4 divide-y divide-slate-200">
          <RecordSection title="Marketplace identity" fields={identities.map((item) => [item.label, item.value])} showEmpty={showEmpty}/>
          <RecordSection title="Commercial" fields={[["MRP", listing.mrp], ["Selling price", listing.sellingPrice], ["Live price", listing.livePrice], ["Live MRP", listing.liveMrp]]} showEmpty={showEmpty}/>
          <RecordSection title="Catalog description" fields={[["Brand", listing.liveBrand], ["Category", listing.liveCategory], ["Sub-category", listing.subCategory], ["Highlights", listing.productHighlights], ["Description", listing.description], ["Specifications", listing.allSpecifications]]} showEmpty={showEmpty}/>
          <RecordSection title="Marketplace health" fields={[["Live title", listing.liveTitle], ["Rating", listing.rating], ["Review count", listing.reviewCount], ["Scrape status", listing.scrapeStatus], ["Scrape issue", listing.scrapeError]]} showEmpty={showEmpty}/>
          <RecordSection title="Record history" fields={[["Created", formatDateTime(listing.createdAt)], ["Updated", formatDateTime(listing.updatedAt)], ["Protected fields", locks.size ? [...locks].map(fieldLabel).join(", ") : "None"]]} showEmpty/>
        </div></Surface>
        <Surface padding="compact" id="marketplace-attributes">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">Advanced marketplace attributes</h2><p className="mt-1 text-sm text-slate-600">{attributeTotal.toLocaleString()} stored; at most {pageSize} render at once.</p></div><form className="flex w-full min-w-0 gap-2 sm:w-auto" action={`/owner/product-inventory/${listing.id}`}>{showEmpty ? <input type="hidden" name="empty" value="1"/> : null}<label className="min-w-0 flex-1 sm:w-72"><span className="sr-only">Search marketplace attributes</span><input name="attributeQ" type="search" defaultValue={attributeQuery} placeholder="Label, key, or value" className="ui-field-control w-full"/></label><button className={buttonStyles({ variant: "secondary" })}>Search</button></form></div>
          {attributes.length ? <dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{attributes.map((attribute) => <div key={attribute.id} className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)] sm:gap-5"><dt className="min-w-0 text-sm font-semibold"><span className="block break-words">{attribute.displayLabel || fieldLabel(attribute.technicalKey)}</span><span className="block break-all font-mono text-[0.7rem] font-normal text-slate-500">{attribute.technicalKey}</span></dt><dd className="min-w-0 break-words text-sm leading-6 text-slate-700">{displayAttributeValue(attribute.valueText, attribute.valueJson)}<span className="mt-1 block text-xs text-slate-500">{attribute.manualLocked ? "Owner protected" : attribute.sourceAuthority.replaceAll("_", " ").toLowerCase()}</span></dd></div>)}</dl> : <p className="mt-4 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-600">No marketplace attributes match this search.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-600">Showing {filteredTotal ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filteredTotal)} of {filteredTotal}</p><div className="flex gap-2">{page > 1 ? <Link href={detailHref(listing.id, { empty: showEmpty, query: attributeQuery, page: page - 1 })} className={buttonStyles({ variant: "secondary" })}>Previous</Link> : null}{page * pageSize < filteredTotal ? <Link href={detailHref(listing.id, { empty: showEmpty, query: attributeQuery, page: page + 1 })} className={buttonStyles({ variant: "secondary" })}>Next</Link> : null}</div></div>
        </Surface>
      </main>
    </div>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd></div>; }

function RecordSection({ title, fields, showEmpty }: { title: string; fields: Array<[string, string | number | null | undefined]>; showEmpty: boolean }) {
  const visible = fields.filter(([, value]) => showEmpty || (value !== null && value !== undefined && value !== ""));
  if (!visible.length) return null;
  return <section className="py-4 first:pt-0 last:pb-0"><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2">{visible.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900">{value === null || value === undefined || value === "" ? "Not provided" : String(value)}</dd></div>)}</dl></section>;
}
