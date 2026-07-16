import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { PRODUCT_INVENTORY_PAGE_SIZE, searchProductInventory } from "@/src/lib/product-inventory/search";

const routeLabel = (route?: string) => route === "PICK_PACK" ? "Direct to Pack" : route === "PICK_MARK_PACK" ? "Send to Marking" : route === "PICK_ASSEMBLE_PACK" ? "Send to Assembly" : route === "PICK_MARK_ASSEMBLE_PACK" ? "Marking then Assembly" : "Direct to Pack (no saved default)";

type SearchParams = { q?: string; status?: string; default?: string; image?: string; page?: string };

export default async function ProductInventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [summary, result] = await Promise.all([
    prisma.$transaction([
      prisma.marketplaceListing.count({ where: { accountId: account.id } }),
      prisma.marketplaceListing.count({ where: { accountId: account.id, listingStatus: { notIn: ["INACTIVE", "ARCHIVED"] } } }),
      prisma.marketplaceListing.count({ where: { accountId: account.id, mainImageUrl: null } }),
      prisma.marketplaceListing.count({ where: { accountId: account.id, processRules: { none: { active: true } } } })
    ]),
    searchProductInventory(prisma, { accountId: account.id, query: params.q, status: params.status, route: params.default, image: params.image, page })
  ]);
  const [total, active, missingImage, noDefault] = summary;
  const pages = Math.max(1, Math.ceil(result.total / PRODUCT_INVENTORY_PAGE_SIZE));
  const href = (nextPage: number) => { const next = new URLSearchParams(); if (result.query) next.set("q", result.query); if (params.status && params.status !== "all") next.set("status", params.status); if (params.default) next.set("default", params.default); if (params.image) next.set("image", params.image); next.set("page", String(nextPage)); return `/owner/product-inventory?${next.toString()}`; };

  return <AppShell>
    <div className="mx-auto w-full max-w-[1440px]">
      <PageHeader eyebrow="Marketplace product catalog" title="Product Inventory" description="Fast account-scoped listing and catalog search. This is not physical stock inventory." action={{ href: "/owner/product-inventory/refresh", label: "Refresh Product Inventory" }} />
      <section className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">{[["Products", total], ["Active", active], ["No default", noDefault], ["Missing image", missingImage]].map(([label, value]) => <div key={label} className="rounded-md border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{Number(value).toLocaleString()}</p></div>)}</section>
      <form className="mb-4 grid gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[minmax(18rem,1fr)_auto_auto_auto_auto_auto]">
        <input name="q" defaultValue={result.query} autoComplete="off" placeholder="Seller SKU, internal SKU, FSN, Listing ID, ASIN, FNSKU, barcode, title or category" className="min-h-11 min-w-0 rounded-md border border-slate-300 px-3" />
        <select name="status" defaultValue={params.status ?? "all"} className="min-h-11 rounded-md border border-slate-300 px-3"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <select name="image" defaultValue={params.image ?? "all"} className="min-h-11 rounded-md border border-slate-300 px-3"><option value="all">All images</option><option value="available">Image available</option><option value="missing">Missing image</option></select>
        <select name="default" defaultValue={params.default ?? ""} className="min-h-11 rounded-md border border-slate-300 px-3"><option value="">All processing</option><option value="none">No saved default</option><option value="PICK_PACK">Direct to Pack</option><option value="PICK_MARK_PACK">Marking</option><option value="PICK_ASSEMBLE_PACK">Assembly</option><option value="PICK_MARK_ASSEMBLE_PACK">Marking + Assembly</option></select>
        <button className="min-h-11 rounded-md bg-slate-950 px-4 font-bold text-white">Search</button>
        <Link href="/owner/product-inventory" className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 px-4 font-bold text-slate-800">Clear</Link>
      </form>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><p className="font-bold text-slate-700">{result.total.toLocaleString()} results{result.query && result.exactCount > 0 ? ` / ${result.exactCount} exact` : ""}</p><p className="text-slate-500">Page {Math.min(page, pages)} of {pages}</p></div>
      <div className="space-y-3">
        {result.listings.map((listing, index) => { const identifiers = new Map(listing.identifiers.map((identifier) => [identifier.identifierType, identifier.rawValue])); const rule = listing.processRules[0]; return <article key={listing.id} className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[5.5rem_minmax(0,1fr)] lg:grid-cols-[5.5rem_minmax(0,1fr)_18rem] lg:items-center">
          <ProductImage src={listing.mainImageUrl} alt={listing.productTitle ?? listing.sellerSkuId} size="inventory" showBadge={false} priority={index < 4} />
          <div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{listing.marketplace}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{listing.listingStatus ?? "UNKNOWN"}</span></div><h2 className="mt-2 break-words text-base font-black leading-5 text-slate-950">{listing.productTitle ?? "Missing title"}</h2><dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2"><Identity label="Seller SKU" value={listing.sellerSkuId} /><Identity label="Internal SKU" value={listing.sku} /><Identity label="FSN / Listing ID" value={[listing.fsn, listing.listingId].filter(Boolean).join(" / ")} /><Identity label="ASIN / FNSKU" value={[identifiers.get("ASIN"), identifiers.get("FNSKU")].filter(Boolean).join(" / ")} /></dl><p className="mt-2 break-words text-xs text-slate-500">{listing.liveCategory ?? listing.subCategory ?? "No category"}</p></div>
          <div className="flex min-w-0 flex-col gap-2 border-t border-slate-100 pt-3 text-xs lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"><p className="font-bold text-slate-800">{routeLabel(rule?.route)}</p><p className={listing.markingAssetLinks.length ? "text-teal-700" : "text-slate-500"}>{listing.markingAssetLinks.length ? "Marking mapped" : "No marking mapping"}</p><p className="text-slate-500">Changed {formatDateTime(listing.updatedAt)}</p><Link href={`/owner/product-inventory/${listing.id}`} className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-slate-950 px-4 font-bold text-white">Details</Link></div>
        </article>; })}
        {!result.listings.length ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No products match these account-scoped filters.</div> : null}
      </div>
      <footer className="mt-4 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"><span className="text-sm font-semibold text-slate-600">{result.total.toLocaleString()} results</span><div className="flex gap-2">{page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-bold" href={href(page - 1)}>Previous</Link> : null}{page < pages ? <Link className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-bold" href={href(page + 1)}>Next</Link> : null}</div></footer>
    </div>
  </AppShell>;
}

function Identity({ label, value }: { label: string; value: string | null | undefined }) { return <div className="min-w-0"><dt className="font-bold text-slate-500">{label}</dt><dd className="break-all font-semibold text-slate-800">{value || "-"}</dd></div>; }
