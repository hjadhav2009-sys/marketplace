import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount } from "@/lib/auth";
import { requireWorkPermission } from "@/lib/work-permissions";
import { createMarkingAssetAction } from "../actions";

export default async function NewMarkingAssetPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  await requireAccount(user);
  const params = await searchParams;
  return <AppShell><PageHeader eyebrow="Marking Library" title="New marking asset" description="Create design metadata first, then upload immutable file versions and link listings." />{params?.error ? <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm font-semibold text-rose-700">{params.error}</div> : null}<form action={createMarkingAssetAction} className="max-w-2xl space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"><Field name="name" label="Name" required /><Field name="masterDesignId" label="Master Design ID" placeholder="DESIGN-000245" /><label className="block"><span className="text-sm font-bold text-slate-700">Description</span><textarea name="description" rows={5} className="mt-1 w-full rounded-md border border-slate-300 p-3" /></label><button className="min-h-11 rounded-md bg-slate-950 px-5 py-2 font-bold text-white">Create asset</button></form></AppShell>;
}
function Field({ name, label, placeholder, required }: { name: string; label: string; placeholder?: string; required?: boolean }) { return <label className="block"><span className="text-sm font-bold text-slate-700">{label}</span><input name={name} placeholder={placeholder} required={required} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3" /></label>; }
