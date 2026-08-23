import Link from "next/link";
import { AppShell } from "./AppShell";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import { FeedbackBanner } from "./ui/FeedbackBanner";
import { Surface } from "./ui/Surface";
import { buttonStyles } from "./ui/buttonStyles";
import { requireAccount, requireUser } from "@/lib/auth";
import { loadMissingListings } from "@/lib/missing-listing-read";
import { prisma } from "@/lib/prisma";

type Query = { page?: string; resolved?: string; source?: string; reason?: string; q?: string };

function workspaceHref(query: Query, page: number) {
  const search = new URLSearchParams();
  if (query.source && query.source !== "all") search.set("source", query.source);
  if (query.reason && query.reason !== "all") search.set("reason", query.reason);
  if (query.q) search.set("q", query.q);
  if (page > 1) search.set("page", String(page));
  return `/owner/catalog/missing${search.size ? `?${search}` : ""}`;
}

export async function MissingListingsWorkspace({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const query = await searchParams;
  const result = await loadMissingListings(prisma, account.id, account.marketplace, {
    source: query.source,
    reason: query.reason,
    query: query.q,
    page: Number(query.page) || 1
  });

  return <AppShell><div className="mx-auto max-w-6xl">
    <PageHeader eyebrow="Held catalog work" title="Missing Listings" description="Resolve one retained Order or Consignment row at a time. Work remains held until an exact account-scoped listing is selected or created." action={{ href: "/owner/product-inventory/new", label: "Create listing" }}/>
    {query.resolved ? <FeedbackBanner tone="success" title="Listing resolved" announcement="status">Eligible held work was released through the existing idempotent resolution service.</FeedbackBanner> : null}
    <Surface padding="compact" className="mb-4 mt-4">
      <form className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]">
        <label className="min-w-0"><span className="mb-1 block text-xs font-semibold text-slate-600">Search seller SKU or source identity</span><input className="ui-field-control w-full" type="search" name="q" defaultValue={result.query} placeholder="SKU, title, FSN, ASIN, or reference"/></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-600">Source</span><select className="ui-field-control w-full" name="source" defaultValue={result.source}><option value="all">Orders + Consignments</option><option value="orders">Orders</option><option value="consignments">Consignments</option></select></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-600">Reason</span><select className="ui-field-control w-full" name="reason" defaultValue={result.reason}><option value="all">All reasons</option><option value="missing">Not found</option><option value="ambiguous">Multiple matches</option><option value="conflict">Identifier conflict</option></select></label>
        <button className={`${buttonStyles({ variant: "secondary" })} self-end`}>Apply</button>
      </form>
    </Surface>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><p className="font-semibold text-slate-800">{result.total.toLocaleString()} unresolved row{result.total === 1 ? "" : "s"}</p><p className="text-slate-500">{result.orderTotal} Orders / {result.consignmentTotal} Consignments</p></div>
    {!result.items.length ? <EmptyState title="No unresolved missing listings" description="Every retained Order and Consignment catalog identity in this view is resolved." action={{ href: "/owner/product-inventory", label: "Open Product Inventory" }}/> : <Surface padding="compact"><div className="divide-y divide-slate-200">{result.items.map((item) => <article key={`${item.source}:${item.id}`} className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_14rem_auto] lg:items-center">
      <div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{item.source === "ORDER" ? "Order" : "Consignment"}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.reason === "NOT_FOUND" || item.reason.includes("MISSING") ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-800"}`}>{item.reasonLabel}</span></div><h2 className="mt-2 break-words font-semibold text-slate-950">{item.sellerSku}</h2><p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">{item.title}</p><p className="mt-1 break-words text-xs text-slate-500">{item.marketplace} / {item.sourceReference}</p></div>
      <div className="min-w-0 text-sm"><p className="font-semibold text-slate-800">{item.quantity === null ? "Quantity retained with source" : `Required quantity ${item.quantity}`}</p><p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-600">{item.message}</p></div>
      <div className="flex flex-wrap gap-2 lg:justify-end"><Link href={item.sourceHref} className={buttonStyles({ variant: "quiet" })}>View source</Link><Link href={item.resolveHref} className={buttonStyles()}>Resolve row</Link></div>
    </article>)}</div></Surface>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-600">Showing {result.total ? (result.page - 1) * result.pageSize + 1 : 0}-{Math.min(result.page * result.pageSize, result.total)} of {result.total}</p><div className="flex gap-2">{result.page > 1 ? <Link href={workspaceHref(query, result.page - 1)} className={buttonStyles({ variant: "secondary" })}>Previous</Link> : null}{result.page * result.pageSize < result.total ? <Link href={workspaceHref(query, result.page + 1)} className={buttonStyles({ variant: "secondary" })}>Next</Link> : null}</div></div>
  </div></AppShell>;
}
