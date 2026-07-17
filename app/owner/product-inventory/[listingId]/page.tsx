import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ProcessRuleEditor } from "../../process-rules/ProcessRuleEditor";
import { saveCatalogFieldLocksAction } from "./actions";
import { LOCKABLE_CATALOG_FIELDS } from "./fields";

export default async function ProductDetailPage({ params }: { params: Promise<{ listingId: string }> }) {
  const user=await requireUser(["OWNER"]),account=await requireAccount(user),{listingId}=await params;
  const listing=await prisma.marketplaceListing.findFirst({where:{id:listingId,accountId:account.id},include:{identifiers:{where:{active:true},orderBy:{identifierType:"asc"}},processRules:{where:{active:true},take:1},markingAssetLinks:{where:{active:true},include:{markingAsset:{include:{files:{where:{activeVersion:true},take:1}}}}}}});if(!listing)notFound();
  const assets=listing.markingAssetLinks.map(({markingAsset})=>({id:markingAsset.id,label:markingAsset.masterDesignId??markingAsset.name,hasFile:Boolean(markingAsset.files.length)}));
  const locks=(()=>{try{return JSON.parse(listing.manualLocksJson??"{}") as Record<string,boolean>;}catch{return{};}})();
  return <AppShell><PageHeader eyebrow={`${listing.marketplace} / ${account.accountDisplayName??account.name}`} title={listing.productTitle??listing.sellerSkuId} description="Account-scoped product identity and optional processing configuration." action={{href:"/owner/product-inventory",label:"Back to inventory"}}/>
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]"><section className="rounded-md border bg-white p-4"><ProductImage src={listing.mainImageUrl} alt={listing.productTitle??listing.sellerSkuId} size="lg" showBadge/><h2 className="mt-4 font-black">Listing identity</h2><dl className="mt-2 space-y-2 text-sm"><Row label="Seller SKU" value={listing.sellerSkuId}/><Row label="Internal SKU" value={listing.sku}/><Row label="FSN" value={listing.fsn}/><Row label="Listing ID" value={listing.listingId}/><Row label="Status" value={listing.listingStatus}/><Row label="Category" value={listing.liveCategory??listing.subCategory}/><Row label="Brand" value={listing.liveBrand}/></dl></section>
      <div className="space-y-4"><section className="rounded-md border bg-white p-4"><h2 className="font-black">Marketplace identifiers</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{listing.identifiers.map(id=><div key={id.id} className="rounded border p-2 text-sm"><p className="text-xs font-bold text-slate-500">{id.identifierType}</p><p className="break-all font-semibold">{id.rawValue}</p><p className="text-xs text-slate-500">{id.source}</p></div>)}</div></section>
      <section className="rounded-md border bg-white p-4"><h2 className="font-black">Default processing (optional)</h2><p className="mb-3 text-sm text-slate-600">With no saved default, workers start with Direct to Pack preselected.</p><ProcessRuleEditor listingId={listing.id} rule={listing.processRules[0]} assets={assets}/></section>
      <section className="rounded-md border bg-white p-4"><h2 className="font-black">Manual catalog locks</h2><p className="mt-1 text-sm text-slate-600">Locked fields keep the current owner-reviewed value during future automated refreshes.</p><form action={saveCatalogFieldLocksAction} className="mt-3"><input type="hidden" name="listingId" value={listing.id}/><div className="grid gap-2 sm:grid-cols-2">{LOCKABLE_CATALOG_FIELDS.map(field=><label key={field} className="flex min-h-11 items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" name="lockedField" value={field} defaultChecked={locks[field]===true}/>{field}</label>)}</div><button className="mt-3 min-h-11 rounded-md bg-slate-900 px-4 py-2 font-bold text-white">Save field locks</button></form></section>
      <section className="rounded-md border bg-white p-4"><h2 className="font-black">Safe history</h2><p className="mt-2 text-sm">Last catalog refresh: {listing.lastImportedAt?formatDateTime(listing.lastImportedAt):"Not recorded"}</p><p className="text-sm">Last changed: {formatDateTime(listing.updatedAt)}</p><p className="mt-2 text-xs text-slate-500">Catalog refresh enriches this record and never deletes it merely because it is absent from an uploaded file.</p></section></div></div>
  </AppShell>;
}
function Row({label,value}:{label:string;value:string|null|undefined}){return <div><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="break-all">{value??"-"}</dd></div>}
