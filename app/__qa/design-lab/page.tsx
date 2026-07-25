import Link from "next/link";
import { notFound } from "next/navigation";

const areas = ["design-system","navigation","dashboard","product-inventory","product-details","imports","work-cards","route-dialogs","scanner","problems","data-management","empty-loading-error"];

export default function DesignLabIndex() {
  if (process.env.STAGING_UI_AUDIT !== "true" || process.env.STAGE3_SYNTHETIC_STAGING !== "true") notFound();
  return <main className="min-h-screen bg-stone-50 p-4 sm:p-8"><p className="text-xs font-black uppercase text-berry">Private synthetic staging</p><h1 className="text-3xl font-black">Live Design Lab</h1><p className="mt-2 max-w-3xl text-slate-600">Audit-only current and redesign variants. These controls do not call production mutations.</p><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{areas.map(area=><Link key={area} href={`/__qa/design-lab/${area}`} className="min-h-20 rounded-xl border bg-white p-4 font-black shadow-sm hover:border-berry">{area.replaceAll("-"," ")}</Link>)}</div></main>;
}

