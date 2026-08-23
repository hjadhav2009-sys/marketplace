import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { Metric } from "@/components/ui/Metric";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCT_INVENTORY_PAGE_SIZE, searchProductInventory } from "@/src/lib/product-inventory/search";
import { InventoryCard } from "./InventoryCard";
import { InventoryFilters } from "./InventoryFilters";
import { normalizeProcessingFilter, productInventoryHref, type ProductInventoryFilterState } from "./presentation";

type SearchParams = { q?: string; status?: string; processing?: string; default?: string; image?: string; page?: string };

function metricHref(state: ProductInventoryFilterState, changes: Partial<ProductInventoryFilterState>) {
  return productInventoryHref({ ...state, ...changes }, 1);
}

export default async function ProductInventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const state: ProductInventoryFilterState = {
    q: params.q?.trim().slice(0, 160) ?? "",
    status: params.status === "active" || params.status === "inactive" ? params.status : "all",
    image: params.image === "available" || params.image === "missing" ? params.image : "all",
    processing: normalizeProcessingFilter(params.processing ?? params.default)
  };
  const summaryWhere = { accountId: account.id, marketplace: account.marketplace };
  const [summary, result] = await Promise.all([
    prisma.$transaction([
      prisma.marketplaceListing.count({ where: summaryWhere }),
      prisma.marketplaceListing.count({ where: { ...summaryWhere, listingStatus: { notIn: ["INACTIVE", "ARCHIVED"] } } }),
      prisma.marketplaceListing.count({ where: { ...summaryWhere, processRules: { none: { active: true } } } }),
      prisma.marketplaceListing.count({ where: { ...summaryWhere, mainImageUrl: null } })
    ]),
    searchProductInventory(prisma, {
      accountId: account.id,
      marketplace: account.marketplace,
      query: state.q,
      status: state.status,
      route: state.processing === "all" ? undefined : state.processing,
      image: state.image,
      page
    })
  ]);
  const [total, active, noDefault, missingImage] = summary;
  const displayAttributes = account.marketplace === "MEESHO" && result.listings.length ? await prisma.marketplaceListingAttribute.findMany({
    where: {
      accountId: account.id,
      marketplace: account.marketplace,
      marketplaceListingId: { in: result.listings.map((listing) => listing.id) },
      technicalKey: { in: ["product_id", "catalog_id", "meesho_product_id", "meesho_catalog_id"] }
    },
    select: { marketplaceListingId: true, technicalKey: true, valueText: true },
    orderBy: { technicalKey: "asc" },
    take: result.listings.length * 4
  }) : [];
  const attributesByListing = new Map<string, typeof displayAttributes>();
  for (const attribute of displayAttributes) attributesByListing.set(attribute.marketplaceListingId, [...(attributesByListing.get(attribute.marketplaceListingId) ?? []), attribute]);
  const pages = Math.max(1, Math.ceil(result.total / PRODUCT_INVENTORY_PAGE_SIZE));
  const currentPage = result.page;
  const hasFilters = state.status !== "all" || state.image !== "all" || state.processing !== "all";

  return <AppShell>
    <div className="mx-auto w-full max-w-[1440px]">
      <PageHeader
        eyebrow={`${account.marketplace} / ${account.accountDisplayName ?? account.name}`}
        title="Product Inventory"
        description="Marketplace product and listing catalog."
        action={{ href: "/owner/product-inventory/refresh", label: "Refresh Product Inventory" }}
      >
        <Link href="/owner/catalog/missing" className={buttonStyles({ variant: "secondary" })}>Missing Listings</Link>
      </PageHeader>

      <section aria-label="Product Inventory summary" className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4">
        <Link href="/owner/product-inventory" className="min-h-11 border-b border-r border-slate-200 p-3 hover:bg-stone-50 lg:border-b-0">
          <Metric label="Products" value={total.toLocaleString()} />
        </Link>
        <Link href={metricHref(state, { status: "active" })} className="min-h-11 border-b border-slate-200 p-3 hover:bg-stone-50 lg:border-b-0 lg:border-r">
          <Metric label="Active" value={active.toLocaleString()} tone="success" />
        </Link>
        <Link href={metricHref(state, { processing: "none" })} className="min-h-11 border-r border-slate-200 p-3 hover:bg-stone-50">
          <Metric label="No saved default" value={noDefault.toLocaleString()} tone={noDefault ? "warning" : "neutral"} />
        </Link>
        <Link href={metricHref(state, { image: "missing" })} className="min-h-11 p-3 hover:bg-stone-50">
          <Metric label="Missing image" value={missingImage.toLocaleString()} tone={missingImage ? "warning" : "neutral"} />
        </Link>
      </section>

      <InventoryFilters state={state} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold text-slate-800">{result.total.toLocaleString()} {result.total === 1 ? "product" : "products"}{result.query && result.exactCount > 0 ? ` / ${result.exactCount.toLocaleString()} exact` : ""}</p>
        <p className="text-slate-500">Selected seller account only</p>
      </div>

      {result.listings.length ? <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {result.listings.map((listing, index) => <InventoryCard key={listing.id} listing={{ ...listing, attributes: attributesByListing.get(listing.id) ?? [] }} priority={index < 2} />)}
      </div> : total === 0 ? <EmptyState
        title="No products imported"
        description={`No products have been imported for this seller account. Refresh ${account.marketplace} Product Inventory to add its marketplace catalog.`}
        action={{ href: "/owner/product-inventory/refresh", label: "Refresh Product Inventory" }}
      /> : state.q ? <EmptyState
        title="No products match this search"
        description={`No product in the selected seller account matches “${state.q}”. Try a Seller SKU, marketplace ID, title, or category.`}
        action={{ href: "/owner/product-inventory", label: "Clear search and filters" }}
      /> : hasFilters ? <EmptyState
        title="No products match the selected filters"
        description="Adjust the status, image, or processing filters for the selected seller account."
        action={{ href: "/owner/product-inventory", label: "Clear filters" }}
      /> : null}

      {result.total > 0 ? <nav aria-label="Product Inventory pagination" className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="justify-self-start">
          {currentPage > 1 ? <Link className={buttonStyles({ variant: "secondary" })} href={productInventoryHref(state, currentPage - 1)}>Previous</Link> : <span className={buttonStyles({ variant: "secondary", className: "pointer-events-none opacity-50" })} aria-disabled="true">Previous</span>}
        </div>
        <p className="text-center text-sm font-semibold tabular-nums text-slate-700">Page {currentPage} of {pages}</p>
        <div className="justify-self-end">
          {currentPage < pages ? <Link className={buttonStyles({ variant: "secondary" })} href={productInventoryHref(state, currentPage + 1)}>Next</Link> : <span className={buttonStyles({ variant: "secondary", className: "pointer-events-none opacity-50" })} aria-disabled="true">Next</span>}
        </div>
      </nav> : null}
    </div>
  </AppShell>;
}
