import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { prisma } from "@/lib/prisma";
import { parseConsignmentCatalogSnapshot } from "@/src/lib/consignments/amazon/catalog-snapshot";
import { WORK_TASK_INCLUDE } from "@/src/lib/workflow/queues";
import { WorkTaskCard } from "../../WorkTaskCard";

export default async function MarkingTaskDetailPage({params}:{params:Promise<{taskId:string}>}){
 const user=await requireUser();const account=await requireAccount(user);if(!(hasWorkPermission(user,"canMark")||user.canViewAllWork))redirect(capabilityHomePath(user));const {taskId}=await params;
 const task=await prisma.workTask.findFirst({where:{id:taskId,accountId:account.id,sourceType:"CONSIGNMENT",stage:"MARK",...(user.role==="OWNER"||user.canViewAllWork?{}:{OR:[{assignedUserId:null},{assignedUserId:user.id}]})},include:WORK_TASK_INCLUDE});if(!task?.consignmentLine)notFound();
 const line=task.consignmentLine;const catalog=parseConsignmentCatalogSnapshot(line.catalogSnapshotJson);const images=catalog?.imageUrls?.slice(0,10)??[line.productImageSnapshot].filter((value):value is string=>Boolean(value));
 return <AppShell><PageHeader eyebrow={`${line.consignmentBatch.marketplace} marking`} title={line.productTitleSnapshot??catalog?.title??line.sellerSkuSnapshot??"Marking task"} description={`${line.consignmentBatch.externalConsignmentNumber} / ${line.sellerSkuSnapshot??"No SKU"}`}><Link href="/work/marking" className="min-h-11 rounded-md border px-4 py-2 text-sm font-bold">Back to Marking</Link></PageHeader>
  <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><div className="self-start rounded-md border bg-white p-3 shadow-sm lg:sticky lg:top-28"><ProductImageGallery primarySrc={line.productImageSnapshot??catalog?.mainImageUrl} images={images} alt={catalog?.title??line.sellerSkuSnapshot??"Product"}/></div><div className="space-y-4"><div className="rounded-md border bg-white p-4 shadow-sm"><h2 className="font-black">Product and catalog details</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Detail label="Seller SKU" value={line.sellerSkuSnapshot}/><Detail label="ASIN" value={line.asinSnapshot}/><Detail label="FNSKU" value={line.fnskuSnapshot}/><Detail label="FSN" value={line.fsnSnapshot}/><Detail label="Listing ID" value={line.listingIdSnapshot}/><Detail label="Category" value={[catalog?.category,catalog?.subCategory].filter(Boolean).join(" / ")}/><Detail label="Brand" value={catalog?.brand}/><Detail label="Material" value={catalog?.material}/><Detail label="Colour" value={catalog?.color}/><Detail label="Size" value={catalog?.size}/><Detail label="Model" value={catalog?.modelNumber}/></dl>{catalog?.bulletPoints?.length?<details className="mt-4 rounded-md bg-slate-50 p-3"><summary className="cursor-pointer font-bold">Bullet points</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{catalog.bulletPoints.map((item)=><li key={item}>{item}</li>)}</ul></details>:null}{catalog?.description?<details className="mt-3 rounded-md bg-slate-50 p-3"><summary className="cursor-pointer font-bold">Description</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{catalog.description}</p></details>:null}</div><WorkTaskCard task={task} user={user} returnPath={`/work/marking/${task.id}`}/></div></section>
 </AppShell>;
}
function Detail({label,value}:{label:string;value:string|null|undefined}){return <div className="rounded-md bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value||"Not available"}</dd></div>;}
