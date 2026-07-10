import Link from "next/link";
import { IdentifierType } from "@prisma/client";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireWorkPermission } from "@/lib/work-permissions";
import { markingAssetAccessWhere } from "@/src/lib/marking/access";
import { findListingMatchesByIdentifiers } from "@/src/lib/marking/identifiers";
import { archiveMarkingAssetAction, linkMarkingListingAction, unlinkMarkingListingAction, updateMarkingAssetAction, uploadMarkingAssetFileAction } from "../actions";

const IDENTIFIER_TYPES = Object.values(IdentifierType);

export default async function MarkingAssetDetailPage({ params, searchParams }: { params: Promise<{ assetId: string }>; searchParams?: Promise<Record<string, string | undefined>> }) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const { assetId } = await params;
  const query = await searchParams;
  const asset = await prisma.markingAsset.findFirst({
    where: { id: assetId, ...markingAssetAccessWhere(user, account.id) },
    include: {
      files: { orderBy: [{ attachmentType: "asc" }, { versionNumber: "desc" }] },
      listingLinks: { where: { active: true }, include: { account: true, marketplaceListing: true }, orderBy: { createdAt: "desc" } },
      processRules: { where: { active: true }, include: { marketplaceListing: true } }
    }
  });
  if (!asset) notFound();

  const identifierType = IDENTIFIER_TYPES.includes(query?.identifierType as IdentifierType) ? query?.identifierType as IdentifierType : null;
  const identifierValue = query?.identifierValue?.trim();
  const match = identifierType && identifierValue ? await findListingMatchesByIdentifiers({ accountId: account.id, identifiers: [{ type: identifierType, value: identifierValue }] }) : null;
  const manualListings = query?.title?.trim() ? await prisma.marketplaceListing.findMany({ where: { accountId: account.id, OR: [{ productTitle: { contains: query.title.trim() } }, { sellerSkuId: { contains: query.title.trim() } }, { sku: { contains: query.title.trim() } }] }, orderBy: { updatedAt: "desc" }, take: 20 }) : [];
  const activePreview = asset.files.find((file) => file.attachmentType === "MARKING_PREVIEW" && file.activeVersion);

  return (
    <AppShell>
      <PageHeader eyebrow="Marking Library" title={asset.name} description={`${asset.masterDesignId ?? "Draft design"} / owner original files are retained`} />
      <div className="mb-5 flex flex-wrap gap-2"><Link href="/owner/marking-library" className="rounded-md border bg-white px-4 py-2 text-sm font-bold">Back to library</Link><Link href="/owner/process-rules" className="rounded-md border bg-white px-4 py-2 text-sm font-bold">Process rules</Link></div>
      {query?.error ? <Message danger>{query.error}</Message> : null}{query?.created || query?.updated || query?.uploaded || query?.linked || query?.unlinked ? <Message>Changes saved.</Message> : null}

      <section className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden rounded-md border border-slate-200 bg-white">{activePreview ? <ProductImage src={`/owner/marking-library/${asset.id}/files/${activePreview.id}?inline=1`} alt="Marking preview" size="lg" showBadge={false} /> : <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">No preview image</div>}</div>
          <form action={archiveMarkingAssetAction} className="rounded-md border border-rose-200 bg-rose-50 p-4"><input type="hidden" name="assetId" value={asset.id} /><p className="text-sm text-rose-800">Archive hides this asset but never deletes its original files.</p><SubmitButton pendingText="Archiving..." variant="secondary">Archive asset</SubmitButton></form>
        </div>
        <form action={updateMarkingAssetAction} className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <input type="hidden" name="assetId" value={asset.id} />
          <Field name="name" label="Name" value={asset.name} required /><Field name="masterDesignId" label="Master Design ID" value={asset.masterDesignId} />
          <Field name="status" label="Status" value={asset.status} /><Field name="material" label="Material" value={asset.material} />
          <Field name="machineType" label="Machine type" value={asset.machineType} /><Field name="softwareName" label="Software name" value={asset.softwareName} />
          <Field name="markingPosition" label="Marking position" value={asset.markingPosition} /><Field name="passes" label="Passes" value={asset.passes} type="number" />
          <Field name="markingWidthMm" label="Width mm" value={asset.markingWidthMm} type="number" /><Field name="markingHeightMm" label="Height mm" value={asset.markingHeightMm} type="number" />
          <Field name="powerSetting" label="Power" value={asset.powerSetting} type="number" /><Field name="speedSetting" label="Speed" value={asset.speedSetting} type="number" />
          <Field name="frequencySetting" label="Frequency" value={asset.frequencySetting} type="number" />
          <Area name="description" label="Description" value={asset.description} /><Area name="instructions" label="Instructions" value={asset.instructions} /><Area name="settingsJson" label="Extra settings" value={asset.settingsJson} />
          <div className="sm:col-span-2"><SubmitButton pendingText="Saving...">Save metadata</SubmitButton></div>
        </form>
      </section>

      <section className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Managed file versions</h2><p className="mt-1 text-sm text-slate-600">Replacement uploads create a new immutable version. ZIP files are stored without extraction.</p><div className="mt-4 grid gap-4 lg:grid-cols-3">{(["MARKING_FILE", "MARKING_PREVIEW", "MARKING_REPORT"] as const).map((type) => <form key={type} action={uploadMarkingAssetFileAction} className="rounded-md border border-slate-200 p-4"><input type="hidden" name="assetId" value={asset.id} /><input type="hidden" name="attachmentType" value={type} /><p className="font-bold">{type.replaceAll("_", " ")}</p><input name="file" type="file" required className="mt-3 block w-full text-sm" /><SubmitButton pendingText="Uploading..." variant="secondary">Upload new version</SubmitButton></form>)}</div><div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-2">Type</th><th className="p-2">Version</th><th className="p-2">Safe filename</th><th className="p-2">Size</th><th className="p-2">Created</th><th className="p-2">Download</th></tr></thead><tbody>{asset.files.map((file) => <tr key={file.id} className="border-b"><td className="p-2 font-bold">{file.attachmentType}{file.activeVersion ? " / active" : ""}</td><td className="p-2">v{file.versionNumber}</td><td className="p-2">{file.originalFileName}</td><td className="p-2">{Math.ceil(file.fileSizeBytes / 1024)} KB</td><td className="p-2">{formatDateTime(file.createdAt)}</td><td className="p-2"><a href={`/owner/marking-library/${asset.id}/files/${file.id}`} className="font-bold text-berry">Download</a></td></tr>)}</tbody></table></div></section>

      <section className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Account-aware listing links</h2><p className="mt-1 text-sm text-slate-600">Exact identifiers are checked only in {account.accountDisplayName ?? account.name}. Ambiguous results always require your choice.</p><form className="mt-4 grid gap-3 sm:grid-cols-[0.7fr_1.3fr_auto]"><select name="identifierType" defaultValue={identifierType ?? "SELLER_SKU"} className="min-h-11 rounded-md border px-3">{IDENTIFIER_TYPES.map((type) => <option key={type}>{type}</option>)}</select><input name="identifierValue" defaultValue={identifierValue} placeholder="Exact identifier" className="min-h-11 rounded-md border px-3" /><button className="rounded-md bg-slate-950 px-4 py-2 font-bold text-white">Exact match</button></form>{match ? <MatchResults assetId={asset.id} match={match} /> : null}<form className="mt-4 flex gap-2"><input name="title" defaultValue={query?.title} placeholder="Manual title/SKU fallback search" className="min-h-11 flex-1 rounded-md border px-3" /><button className="rounded-md border px-4 font-bold">Manual search</button></form>{manualListings.length ? <CandidateGrid assetId={asset.id} candidates={manualListings} method="OWNER_TITLE_FALLBACK" /> : null}<div className="mt-5 space-y-2">{asset.listingLinks.map((link) => <div key={link.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{link.marketplaceListing.sellerSkuId} / {link.marketplaceListing.productTitle ?? "Untitled"}</p><p className="text-xs text-slate-500">{link.marketplace} / {link.account.accountDisplayName ?? link.account.name} / {link.matchMethod}</p></div>{link.accountId === account.id ? <form action={unlinkMarkingListingAction}><input type="hidden" name="assetId" value={asset.id} /><input type="hidden" name="linkId" value={link.id} /><SubmitButton pendingText="Removing..." variant="secondary">Unlink</SubmitButton></form> : null}</div>)}</div></section>
    </AppShell>
  );
}

function MatchResults({ assetId, match }: { assetId: string; match: Awaited<ReturnType<typeof findListingMatchesByIdentifiers>> }) { return <div className="mt-4"><Message danger={match.status === "INVALID" || match.status === "NOT_FOUND"}>{match.status === "EXACT_UNIQUE" ? "One exact listing found. Confirm the link below." : match.status === "EXACT_MULTIPLE" ? "Multiple exact listings found. Choose one; none was selected automatically." : match.status === "NOT_FOUND" ? "No exact listing found in this account." : "Identifier is invalid."}</Message>{match.candidates.length ? <CandidateGrid assetId={assetId} candidates={match.candidates} method={match.status} /> : null}</div>; }
function CandidateGrid({ assetId, candidates, method }: { assetId: string; candidates: Array<{ id: string; sellerSkuId: string; productTitle: string | null; fsn: string | null; listingId: string | null; mainImageUrl: string | null }>; method: string }) { return <div className="mt-3 grid gap-3 md:grid-cols-2">{candidates.map((listing) => <form key={listing.id} action={linkMarkingListingAction} className="grid grid-cols-[4rem_1fr] gap-3 rounded-md border p-3"><input type="hidden" name="assetId" value={assetId} /><input type="hidden" name="listingId" value={listing.id} /><input type="hidden" name="matchMethod" value={method} /><ProductImage src={listing.mainImageUrl} alt={listing.sellerSkuId} size="sm" showBadge={false} /><div className="min-w-0"><p className="truncate font-bold">{listing.sellerSkuId}</p><p className="line-clamp-2 text-sm text-slate-600">{listing.productTitle ?? "Untitled"}</p><p className="text-xs text-slate-500">{listing.fsn ?? listing.listingId ?? "No product ID"}</p><SubmitButton pendingText="Linking..." variant="secondary">Link listing</SubmitButton></div></form>)}</div>; }
function Field({ name, label, value, type = "text", required }: { name: string; label: string; value: string | number | null; type?: string; required?: boolean }) { return <label><span className="text-sm font-bold text-slate-700">{label}</span><input name={name} type={type} step={type === "number" ? "any" : undefined} defaultValue={value ?? ""} required={required} className="mt-1 min-h-11 w-full rounded-md border px-3" /></label>; }
function Area({ name, label, value }: { name: string; label: string; value: string | null }) { return <label className="sm:col-span-2"><span className="text-sm font-bold text-slate-700">{label}</span><textarea name={name} defaultValue={value ?? ""} rows={3} className="mt-1 w-full rounded-md border p-3" /></label>; }
function Message({ children, danger }: { children: React.ReactNode; danger?: boolean }) { return <div className={`mb-3 rounded-md border px-4 py-3 text-sm font-semibold ${danger ? "border-amber-200 bg-amber-50 text-amber-900" : "border-teal-200 bg-teal-50 text-teal-800"}`}>{children}</div>; }
