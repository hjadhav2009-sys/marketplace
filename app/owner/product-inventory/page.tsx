import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;
const routeLabel = (route?: string) => route === "PICK_PACK" ? "Direct to Pack" : route === "PICK_MARK_PACK" ? "Marking" : route === "PICK_ASSEMBLE_PACK" ? "Assembly" : route === "PICK_MARK_ASSEMBLE_PACK" ? "Marking + Assembly" : "No saved default - Direct to Pack preselected";

export default async function ProductInventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; default?: string; page?: string }> }) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 160) ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where: Prisma.MarketplaceListingWhereInput = {
    accountId: account.id,
    ...(params.status === "active" ? { listingStatus: { notIn: ["INACTIVE", "ARCHIVED"] } } : params.status === "inactive" ? { listingStatus: { in: ["INACTIVE", "ARCHIVED"] } } : {}),
    ...(params.default === "none" ? { processRules: { none: { active: true } } } : params.default ? { processRules: { some: { active: true, route: params.default as never } } } : {}),
    ...(q ? { OR: [
      { sellerSkuId: { contains: q } }, { sku: { contains: q } }, { fsn: { contains: q } }, { listingId: { contains: q } },
      { productTitle: { contains: q } }, { liveCategory: { contains: q } }, { subCategory: { contains: q } },
      { identifiers: { some: { active: true, OR: [{ rawValue: { contains: q } }, { normalizedValue: { contains: q.toUpperCase() } }] } } }
    ] } : {})
  };
  const [total, active, missingImage, missingTitle, noDefault, listings] = await prisma.$transaction([
    prisma.marketplaceListing.count({ where: { accountId: account.id } }),
    prisma.marketplaceListing.count({ where: { accountId: account.id, listingStatus: { notIn: ["INACTIVE", "ARCHIVED"] } } }),
    prisma.marketplaceListing.count({ where: { accountId: account.id, mainImageUrl: null } }),
    prisma.marketplaceListing.count({ where: { accountId: account.id, productTitle: null } }),
    prisma.marketplaceListing.count({ where: { accountId: account.id, processRules: { none: { active: true } } } }),
    prisma.marketplaceListing.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { identifiers: { where: { active: true }, orderBy: { identifierType: "asc" } }, processRules: { where: { active: true }, take: 1 }, markingAssetLinks: { where: { active: true }, take: 1 } } })
  ]);
  const filtered = await prisma.marketplaceListing.count({ where });
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const href = (next: number) => { const copy = new URLSearchParams(); if (q) copy.set("q", q); if (params.status) copy.set("status", params.status); if (params.default) copy.set("default", params.default); copy.set("page", String(next)); return `/owner/product-inventory?${copy}`; };
  return <AppShell><PageHeader eyebrow="Marketplace product catalog" title="Product Inventory" description="Searchable listing identity, images, attributes and optional default processing. This is not physical stock inventory." action={{ href: "/owner/product-inventory/refresh", label: "Product Inventory Refresh" }}/>
    <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{[["Products",total],["Active",active],["Inactive",total-active],["No default",noDefault],["Missing image",missingImage],["Missing title",missingTitle]].map(([label,value])=><div key={label} className="rounded-md border bg-white p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="text-2xl font-black">{value}</p></div>)}</section>
    <form className="sticky top-16 z-20 mb-4 grid gap-2 rounded-md border bg-white p-3 shadow-sm md:grid-cols-[1fr_auto_auto_auto]"><input name="q" defaultValue={q} placeholder="SKU, FSN, Listing ID, ASIN, FNSKU, barcode, title or category" className="min-h-11 rounded-md border px-3"/><select name="status" defaultValue={params.status??"all"} className="min-h-11 rounded-md border px-3"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select name="default" defaultValue={params.default??""} className="min-h-11 rounded-md border px-3"><option value="">All processing</option><option value="none">No saved default</option><option value="PICK_PACK">Direct to Pack</option><option value="PICK_MARK_PACK">Marking</option><option value="PICK_ASSEMBLE_PACK">Assembly</option><option value="PICK_MARK_ASSEMBLE_PACK">Marking + Assembly</option></select><button className="min-h-11 rounded-md bg-slate-900 px-4 font-bold text-white">Filter</button></form>
    <div className="max-h-[min(70vh,850px)] space-y-2 overflow-y-auto rounded-md border bg-slate-100 p-2">{listings.map((listing)=>{const ids=new Map(listing.identifiers.map((id)=>[id.identifierType,id.rawValue]));const rule=listing.processRules[0];return <Link key={listing.id} href={`/owner/product-inventory/${listing.id}`} className="grid gap-3 rounded-md border bg-white p-3 shadow-sm sm:grid-cols-[5rem_1fr_auto]"><ProductImage src={listing.mainImageUrl} alt={listing.productTitle??listing.sellerSkuId} size="sm" showBadge={false}/><div className="min-w-0"><p className="break-words font-black">{listing.productTitle??"Missing title"}</p><p className="break-all text-sm">Seller SKU {listing.sellerSkuId} · Internal SKU {listing.sku}</p><p className="break-all text-xs text-slate-500">FSN {listing.fsn??"—"} · Listing {listing.listingId??"—"} · ASIN {ids.get("ASIN")??"—"} · FNSKU {ids.get("FNSKU")??"—"}</p><p className="mt-1 text-xs text-slate-500">{listing.liveBrand??"No brand"} · {listing.liveCategory??listing.subCategory??"No category"}</p></div><div className="text-xs sm:text-right"><p className="font-bold">{account.marketplace}</p><p>{routeLabel(rule?.route)}</p><p>{listing.markingAssetLinks.length?"Marking mapped":"No marking mapping"}</p><p className="text-slate-500">Changed {formatDateTime(listing.updatedAt)}</p></div></Link>})}{!listings.length?<p className="p-8 text-center text-sm text-slate-500">No products match these filters.</p>:null}</div>
    <footer className="sticky bottom-16 mt-3 flex items-center justify-between rounded-md border bg-white p-3 shadow-lg sm:bottom-3"><p className="text-sm">{filtered.toLocaleString()} results · page {Math.min(page,pages)} of {pages}</p><div className="flex gap-2">{page>1?<Link className="min-h-11 rounded-md border px-4 py-3 text-sm font-bold" href={href(page-1)}>Previous</Link>:null}{page<pages?<Link className="min-h-11 rounded-md border px-4 py-3 text-sm font-bold" href={href(page+1)}>Next</Link>:null}</div></footer>
  </AppShell>;
}
