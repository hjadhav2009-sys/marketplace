import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { searchSkuMappings } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { imageHealthLabel, normalizeSkuMappingImageFilter } from "@/lib/product-image";
import { recheckVisibleSkuImagesAction, upsertSkuImageMappingAction } from "./actions";

type SkuMappingsPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
    recheck?: string;
    q?: string;
    active?: string;
    image?: string;
  }>;
};

export default async function SkuMappingsPage({ searchParams }: SkuMappingsPageProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const imageFilter = normalizeSkuMappingImageFilter(params?.image);
  const mappings = await searchSkuMappings(account.id, params?.q, params?.active, imageFilter);
  const returnToParams = new URLSearchParams();

  if (params?.q) {
    returnToParams.set("q", params.q);
  }

  if (params?.active) {
    returnToParams.set("active", params.active);
  }

  if (params?.image) {
    returnToParams.set("image", params.image);
  }

  const returnTo = `/owner/sku-mappings${returnToParams.size > 0 ? `?${returnToParams}` : ""}`;

  return (
    <AppShell>
      <PageHeader
        eyebrow="SKU Images"
        title="Map SKU to product image URL"
        description="Store only the Meesho product image URL. These images power picker cards and the packer scan result screen."
        action={{ href: "/owner/sku-mappings/import", label: "Import CSV/XLSX" }}
      />

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected account</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{account.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/owner/sku-mappings/export?format=csv"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-berry hover:text-berry"
            >
              Export selected CSV
            </a>
            <a
              href="/owner/sku-mappings/export?format=xlsx"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-berry hover:text-berry"
            >
              Export selected XLSX
            </a>
            <a
              href="/owner/sku-mappings/export?scope=all&format=csv"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-berry hover:text-berry"
            >
              Export all accounts
            </a>
            <a
              href="/owner/sku-mappings/export?health=broken&format=csv"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:border-rose-300"
            >
              Export broken CSV
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <form action={upsertSkuImageMappingAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Add or update mapping</h2>

          {params?.error ? (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Check SKU and image URL.
            </div>
          ) : null}

          {params?.saved ? (
            <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
              Mapping saved.
            </div>
          ) : null}
          {params?.recheck ? (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
              Broken visible mappings were reset for browser recheck.
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">SKU</span>
              <input
                name="sku"
                required
                placeholder="1202919298_6"
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Image URL</span>
              <input
                name="imageUrl"
                required
                type="url"
                placeholder="https://images-r.meesho.com/..."
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Product name</span>
              <input
                name="productName"
                placeholder="Sports Jersey Number Personalized Pendant"
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Color</span>
              <input
                name="color"
                placeholder="Silver"
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Notes</span>
              <textarea
                name="notes"
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input name="active" type="checkbox" defaultChecked className="h-5 w-5 accent-pink-700" />
              Active mapping
            </label>
            <SubmitButton pendingText="Saving...">Save mapping</SubmitButton>
          </div>
        </form>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="font-semibold text-slate-950">Current mappings</h2>
              <form action={recheckVisibleSkuImagesAction}>
                <input type="hidden" name="returnTo" value={`${returnTo}${returnTo.includes("?") ? "&" : "?"}recheck=1`} />
                {mappings.map((mapping) => (
                  <input key={mapping.id} type="hidden" name="mappingId" value={mapping.id} />
                ))}
                <button
                  type="submit"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-berry hover:text-berry"
                >
                  Recheck visible images
                </button>
              </form>
            </div>
            <form className="mt-3 grid gap-2 xl:grid-cols-[1fr_auto_auto_auto]">
              <input
                name="q"
                defaultValue={params?.q ?? ""}
                placeholder="Search SKU or product"
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
              <select
                name="active"
                defaultValue={params?.active ?? "active"}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
              <select
                name="image"
                defaultValue={imageFilter}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              >
                <option value="all">All image states</option>
                <option value="mapped">Mapped</option>
                <option value="broken">Broken</option>
                <option value="missing">Missing/empty URL</option>
              </select>
              <button className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                Filter
              </button>
            </form>
          </div>
          <div className="overflow-x-auto">
            {mappings.length > 0 ? (
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Preview</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Product name</th>
                    <th className="px-4 py-3">Image URL</th>
                    <th className="px-4 py-3">Image health</th>
                    <th className="px-4 py-3">Last imported</th>
                    <th className="px-4 py-3">Updated at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappings.map((mapping) => (
                    <tr key={mapping.id}>
                      <td className="px-4 py-3">
                        <ProductImage
                          src={mapping.imageUrl}
                          alt={mapping.productName ?? mapping.sku}
                          size="sm"
                          mappingId={mapping.id}
                          showDebug
                          imageHealth={mapping.imageHealth}
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-950">
                        {mapping.sku} {!mapping.active ? <span className="text-xs text-slate-500">(inactive)</span> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{mapping.productName ?? "No product name"}</td>
                      <td className="max-w-xs break-all px-4 py-3 text-xs text-slate-500">{mapping.imageUrl || "Missing/empty URL"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {imageHealthLabel(mapping)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{mapping.lastImportedAt ? formatDateTime(mapping.lastImportedAt) : "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(mapping.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {mappings.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No SKU images mapped yet.</div>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
