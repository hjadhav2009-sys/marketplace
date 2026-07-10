/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ProcessRoute, type Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkPermission } from "@/lib/work-permissions";
import { disableProcessRuleAction, setProcessRuleAction } from "./actions";

export default async function ProcessRulesPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const user = await requireWorkPermission("canManageProcessRules");
  const account = await requireAccount(user);
  const params = await searchParams;
  const page = Math.max(1, Number(params?.page) || 1);
  const pageSize = 50;
  const q = params?.q?.trim();
  const filter = params?.filter;
  const where: Prisma.MarketplaceListingWhereInput = {
    accountId: account.id,
    OR: q ? [{ sellerSkuId: { contains: q } }, { sku: { contains: q } }, { fsn: { contains: q } }, { listingId: { contains: q } }, { productTitle: { contains: q } }] : undefined,
    processRules: filter === "missing-rule" ? { none: { active: true } } : filter && Object.values(ProcessRoute).includes(filter as ProcessRoute) ? { some: { active: true, route: filter as ProcessRoute } } : filter === "marking" ? { some: { active: true, markingRequired: true } } : filter === "assembly" ? { some: { active: true, assemblyRequired: true } } : undefined
  };
  const [total, listings] = await Promise.all([
    prisma.marketplaceListing.count({ where }),
    prisma.marketplaceListing.findMany({
      where,
      include: {
        processRules: { where: { active: true }, take: 1, include: { markingAsset: true } },
        markingAssetLinks: { where: { active: true, accountId: account.id }, include: { markingAsset: { include: { files: { where: { activeVersion: true }, select: { attachmentType: true } } } } } }
      },
      orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize
    })
  ]);

  return <AppShell><PageHeader eyebrow="Workflow foundation" title="Product process rules" description="Set future listing routes without changing existing order pick/pack status." /><div className="mb-4 flex gap-2"><Link href="/owner/marking-library" className="rounded-md border bg-white px-4 py-2 text-sm font-bold">Marking Library</Link></div>{params?.error ? <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm font-semibold text-rose-700">{params.error}</div> : null}{params?.updated || params?.disabled ? <div className="mb-4 rounded-md bg-teal-50 p-3 text-sm font-semibold text-teal-800">Process rule saved. Existing orders were not changed.</div> : null}<form className="mb-5 grid gap-3 rounded-md border bg-white p-4 sm:grid-cols-[1fr_0.7fr_auto]"><input name="q" defaultValue={params?.q} placeholder="SKU, FSN, listing ID or title" className="min-h-11 rounded-md border px-3" /><select name="filter" defaultValue={filter ?? ""} className="min-h-11 rounded-md border px-3"><option value="">All listings</option><option value="missing-rule">Missing rule</option><option value="marking">Marking required</option><option value="assembly">Assembly required</option>{Object.values(ProcessRoute).map((route) => <option key={route}>{route}</option>)}</select><button className="rounded-md bg-slate-950 px-4 font-bold text-white">Apply</button></form><p className="mb-3 text-sm font-semibold text-slate-600">{total} listings / {account.marketplace} / {account.accountDisplayName ?? account.name}</p><section className="space-y-4">{listings.map((listing) => { const rule = listing.processRules[0]; const assets = listing.markingAssetLinks.map((link) => link.markingAsset); const missingFile = rule?.markingRequired && !rule.markingAsset?.id ? true : rule?.markingRequired && !assets.some((asset) => asset.id === rule.markingAssetId && asset.files.some((file) => file.attachmentType === "MARKING_FILE")); return <article key={listing.id} className="grid gap-4 rounded-md border bg-white p-4 shadow-sm lg:grid-cols-[5rem_1fr_1.4fr]"><div className="aspect-square bg-slate-50">{listing.mainImageUrl ? <img src={listing.mainImageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</div><div><p className="font-black">{listing.sellerSkuId}</p><p className="line-clamp-2 text-sm text-slate-600">{listing.productTitle ?? "Untitled"}</p><p className="mt-1 text-xs text-slate-500">{listing.fsn ?? "No FSN"} / {listing.listingId ?? "No listing ID"}</p><div className="mt-2 flex flex-wrap gap-1"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{rule?.route ?? "MISSING RULE"}</span>{missingFile ? <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">Missing marking file</span> : null}</div></div><div><form action={setProcessRuleAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="listingId" value={listing.id} /><select name="route" defaultValue={rule?.route ?? "PICK_PACK"} className="min-h-10 rounded-md border px-2">{Object.values(ProcessRoute).map((route) => <option key={route}>{route}</option>)}</select><select name="markingAssetId" defaultValue={rule?.markingAssetId ?? ""} className="min-h-10 rounded-md border px-2"><option value="">No marking asset</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.masterDesignId ?? asset.name}</option>)}</select><input name="assemblyTitle" defaultValue={rule?.assemblyTitle ?? ""} placeholder="Assembly title" className="min-h-10 rounded-md border px-2" /><input name="assemblyInstructions" defaultValue={rule?.assemblyInstructions ?? ""} placeholder="Assembly instructions" className="min-h-10 rounded-md border px-2" /><div className="sm:col-span-2"><SubmitButton pendingText="Saving...">Save route</SubmitButton></div></form>{rule ? <form action={disableProcessRuleAction} className="mt-2"><input type="hidden" name="ruleId" value={rule.id} /><SubmitButton pendingText="Disabling..." variant="secondary">Disable rule</SubmitButton></form> : null}</div></article>; })}</section><div className="mt-5 flex justify-between text-sm font-bold"><span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span><div className="flex gap-2">{page > 1 ? <Link href={`?page=${page - 1}`} className="rounded-md border px-3 py-2">Previous</Link> : null}{page * pageSize < total ? <Link href={`?page=${page + 1}`} className="rounded-md border px-3 py-2">Next</Link> : null}</div></div></AppShell>;
}
