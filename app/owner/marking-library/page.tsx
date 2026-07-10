import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { requireAccount } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireWorkPermission } from "@/lib/work-permissions";
import { markingAssetAccessWhere } from "@/src/lib/marking/access";

type Props = { searchParams?: Promise<Record<string, string | undefined>> };

export default async function MarkingLibraryPage({ searchParams }: Props) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const params = await searchParams;
  const pageSize = 50;
  const page = Math.max(1, Number(params?.page) || 1);
  const q = params?.q?.trim();
  const linked = params?.linked;
  const file = params?.file;
  const active = params?.active;
  const where: Prisma.MarkingAssetWhereInput = {
    ...markingAssetAccessWhere(user, account.id),
    active: active === "archived" ? false : active === "all" ? undefined : true,
    OR: q ? [{ name: { contains: q } }, { masterDesignId: { contains: q } }, { material: { contains: q } }] : undefined,
    listingLinks: linked === "linked" ? { some: { accountId: account.id, active: true } } : linked === "unlinked" ? { none: { active: true } } : undefined,
    files: file === "has" ? { some: { attachmentType: "MARKING_FILE", activeVersion: true } } : file === "missing" ? { none: { attachmentType: "MARKING_FILE", activeVersion: true } } : undefined
  };
  const [total, assets] = await Promise.all([
    prisma.markingAsset.count({ where }),
    prisma.markingAsset.findMany({
      where,
      include: {
        files: { where: { activeVersion: true }, orderBy: { createdAt: "desc" } },
        listingLinks: { where: { active: true }, include: { account: true, marketplaceListing: { select: { id: true, productTitle: true, sellerSkuId: true } } }, take: 8 },
        _count: { select: { listingLinks: { where: { active: true } } } }
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AppShell>
      <PageHeader eyebrow="Production foundation" title="Marking Library" description="Manage master marking designs and explicit listing links. Original files remain on the owner PC." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/owner/marking-library/new" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white">New marking asset</Link>
        <Link href="/owner/process-rules" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800">Process rules</Link>
      </div>
      {params?.archived ? <Banner>Asset archived. All original files remain stored.</Banner> : null}
      <form className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <FilterInput name="q" label="Search" value={params?.q} />
        <FilterSelect name="linked" label="Listing links" value={linked} options={[["", "All"], ["linked", "Linked in selected account"], ["unlinked", "Unlinked"]]} />
        <FilterSelect name="file" label="Marking file" value={file} options={[["", "All"], ["has", "Has file"], ["missing", "Missing file"]]} />
        <FilterSelect name="active" label="Status" value={active} options={[["", "Active"], ["archived", "Archived"], ["all", "All"]]} />
        <button className="mt-5 min-h-11 rounded-md bg-berry px-4 py-2 text-sm font-bold text-white">Apply</button>
      </form>
      <p className="mb-3 text-sm font-semibold text-slate-600">{total} assets / selected account {account.accountDisplayName ?? account.name}</p>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => {
          const preview = asset.files.find((item) => item.attachmentType === "MARKING_PREVIEW");
          const markingFile = asset.files.find((item) => item.attachmentType === "MARKING_FILE");
          return (
            <article key={asset.id} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="aspect-square bg-slate-50">
                {preview ? <ProductImage src={`/owner/marking-library/${asset.id}/files/${preview.id}?inline=1`} alt="Marking preview" size="lg" showBadge={false} /> : <div className="flex h-full items-center justify-center p-4 text-center text-sm font-semibold text-slate-400">No preview</div>}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3"><h2 className="font-black text-slate-950">{asset.name}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{asset.status}</span></div>
                <p className="mt-1 text-sm text-slate-600">{asset.masterDesignId ?? "No Master Design ID"}</p>
                <p className="mt-2 text-sm text-slate-600">{asset.material ?? "Material not set"} / {asset.machineType ?? "Machine not set"}</p>
                <p className="mt-2 text-xs text-slate-500">File {markingFile ? `v${markingFile.versionNumber}` : "missing"} / {asset._count.listingLinks} linked listings</p>
                <div className="mt-2 flex flex-wrap gap-1">{asset.listingLinks.slice(0, 4).map((link) => <span key={link.id} className="rounded-full bg-pink-50 px-2 py-1 text-xs font-semibold text-berry">{link.marketplace} / {link.account.accountDisplayName ?? link.account.name}</span>)}</div>
                <p className="mt-3 text-xs text-slate-400">Updated {formatDateTime(asset.updatedAt)}</p>
                <Link href={`/owner/marking-library/${asset.id}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-300 text-sm font-bold text-slate-800">Open asset</Link>
              </div>
            </article>
          );
        })}
      </section>
      {!assets.length ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No marking assets match these filters.</div> : null}
      <div className="mt-5 flex items-center justify-between text-sm font-semibold"><span>Page {page} of {totalPages}</span><div className="flex gap-2">{page > 1 ? <Link href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => value)), page: String(page - 1) }).toString()}`} className="rounded-md border px-3 py-2">Previous</Link> : null}{page < totalPages ? <Link href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => value)), page: String(page + 1) }).toString()}`} className="rounded-md border px-3 py-2">Next</Link> : null}</div></div>
    </AppShell>
  );
}

function Banner({ children }: { children: React.ReactNode }) { return <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{children}</div>; }
function FilterInput({ name, label, value }: { name: string; label: string; value?: string }) { return <label><span className="text-xs font-bold uppercase text-slate-500">{label}</span><input name={name} defaultValue={value} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3" /></label>; }
function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: string[][] }) { return <label><span className="text-xs font-bold uppercase text-slate-500">{label}</span><select name={name} defaultValue={value ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
