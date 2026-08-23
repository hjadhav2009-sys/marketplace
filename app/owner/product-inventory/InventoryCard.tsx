import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { formatDateTime } from "@/lib/format";
import type { searchProductInventory } from "@/src/lib/product-inventory/search";
import { marketplaceIdentities, markingLabel, processingLabel } from "./presentation";

type Listing = Awaited<ReturnType<typeof searchProductInventory>>["listings"][number] & {
  attributes: Array<{ technicalKey: string; valueText: string | null }>;
};

function Identity({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0">
    <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 break-all text-xs font-semibold text-slate-800" title={value || "Not available"}>{value || "Not available"}</dd>
  </div>;
}

export function InventoryCard({ listing, priority = false }: { listing: Listing; priority?: boolean }) {
  const rule = listing.processRules[0];
  const identities = marketplaceIdentities(listing);
  const detailHref = `/owner/product-inventory/${listing.id}`;
  const marking = markingLabel(rule?.route, listing.markingAssetLinks.length > 0);

  return <article data-inventory-card className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3 p-3 sm:p-4 lg:grid-cols-[5.5rem_minmax(0,1fr)_minmax(15rem,19rem)_auto] lg:items-center">
    <ProductImage src={listing.mainImageUrl} alt={listing.productTitle ?? listing.sellerSkuId} size="inventory" showBadge={false} priority={priority} />

    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{listing.marketplace}</span>
        <StatusBadge value={listing.listingStatus ?? "UNKNOWN"} />
      </div>
      <h2 className="mt-2 break-words text-base font-semibold leading-5 text-slate-950">{listing.productTitle ?? "Untitled product"}</h2>
      <dl className="mt-3 grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 min-[390px]:grid-cols-2 sm:grid-cols-3">
        {identities.map((identity) => <Identity key={identity.label} {...identity} />)}
      </dl>
    </div>

    <dl className="col-span-2 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs lg:col-span-1 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
      <Identity label="Category" value={listing.liveCategory ?? listing.subCategory ?? "Uncategorised"} />
      <Identity label="Processing" value={processingLabel(rule?.route)} />
      <div className="min-w-0">
        <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">Marking</dt>
        <dd className={`mt-0.5 break-words text-xs font-semibold ${listing.markingAssetLinks.length ? "text-teal-700" : "text-slate-700"}`}>{marking}</dd>
      </div>
      <Identity label="Refreshed" value={formatDateTime(listing.lastImportedAt ?? listing.updatedAt)} />
    </dl>

    <Link href={detailHref} className={buttonStyles({ variant: "secondary", className: "col-span-2 w-full lg:col-span-1 lg:w-auto" })}>Details</Link>
  </article>;
}
