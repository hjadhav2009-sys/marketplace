import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { startOfApplicationDay } from "@/src/lib/workflow/dates";

export default async function WorkHubPage(){
 const user=await requireUser();const account=await requireAccount(user);const today=startOfApplicationDay();
 const [orderPick,orderMark,orderAssembly,orderPack,orderProblems,orderCompleted,consPick,consMark,consAssembly,consPack,consProblems,activeConsignments]=await Promise.all([
  prisma.order.count({where:{accountId:account.id,pickStatus:"READY",packStatus:{not:"PACKED"}}}),
  prisma.workTask.count({where:{accountId:account.id,sourceType:"ORDER",stage:"MARK",status:{in:["READY","IN_PROGRESS"]}}}),
  prisma.workTask.count({where:{accountId:account.id,sourceType:"ORDER",stage:"ASSEMBLE",status:{in:["READY","IN_PROGRESS"]}}}),
  prisma.workTask.count({where:{accountId:account.id,sourceType:"ORDER",stage:"PACK",status:{in:["READY","IN_PROGRESS"]}}}),
  prisma.order.count({where:{accountId:account.id,OR:[{status:"PROBLEM"},{pickStatus:"PROBLEM"},{packStatus:"PROBLEM"}]}}),
  prisma.order.count({where:{accountId:account.id,packStatus:"PACKED",packedAt:{gte:today}}}),
  ...(["PICK","MARK","ASSEMBLE","PACK"] as const).map(stage=>prisma.workTask.count({where:{accountId:account.id,sourceType:"CONSIGNMENT",stage,status:{in:["READY","IN_PROGRESS"]}}})),
  prisma.workTask.count({where:{accountId:account.id,sourceType:"CONSIGNMENT",status:"PROBLEM"}}),
  prisma.consignmentBatch.count({where:{accountId:account.id,status:{in:["ACTIVE","PROBLEM"]}}})
 ]);
 const cards=[
  {title:"Customer Orders",label:"CUSTOMER ORDER",href:"/picker",stats:[["Ready to Pick",orderPick],["Waiting for Marking",orderMark],["Waiting for Assembly",orderAssembly],["Ready to Pack",orderPack],["Problems",orderProblems],["Completed today",orderCompleted]]},
  {title:"Consignments",label:"CONSIGNMENT",href:"/work/consignments/pick",stats:[["Ready to Pick",consPick],["Waiting for Marking",consMark],["Waiting for Assembly",consAssembly],["Ready to Pack",consPack],["Problems",consProblems],["Active consignments",activeConsignments]]},
  {title:"Universal Scan",label:"ALL AUTHORIZED SOURCES",href:"/work/scan",stats:[]}
 ];
 return <AppShell><PageHeader eyebrow="Selected-account work" title="Work Hub" description="Choose a source first. Customer orders and consignments remain visibly separated."/><section className="grid gap-4 lg:grid-cols-3">{cards.map(card=><Link key={card.title} href={card.href} prefetch className="rounded-md border bg-white p-5 shadow-sm transition hover:border-berry"><span className="rounded-full bg-slate-950 px-2 py-1 text-[11px] font-black text-white">{card.label}</span><p className="mt-3 text-xl font-black">{card.title}</p>{card.stats.length?<div className="mt-3 grid grid-cols-2 gap-2">{card.stats.map(([label,value])=><Stat key={String(label)} label={String(label)} value={Number(value)}/>)}</div>:<p className="mt-3 text-sm text-slate-600">Scan one identifier, filter by stage and source, then choose an explicit action.</p>}</Link>)}</section><section className="mt-5 flex flex-wrap gap-2">{hasWorkPermission(user,"canMark")?<><Link className="rounded-md border bg-white px-4 py-3 font-bold" href="/work/order-marking">Order Marking</Link><Link className="rounded-md border bg-white px-4 py-3 font-bold" href="/work/marking">Consignment Marking</Link></>:null}{hasWorkPermission(user,"canAssemble")?<><Link className="rounded-md border bg-white px-4 py-3 font-bold" href="/work/assembly">Order Assembly</Link><Link className="rounded-md border bg-white px-4 py-3 font-bold" href="/work/consignments/assemble">Consignment Assembly</Link></>:null}{hasWorkPermission(user,"canPack")?<><Link className="rounded-md border bg-white px-4 py-3 font-bold" href="/packing">Order Packing</Link><Link className="rounded-md border bg-white px-4 py-3 font-bold" href="/work/consignments/pack">Consignment Packing</Link></>:null}{user.role==="OWNER"||user.canManageConsignments||user.canViewAllWork||user.canReportProblem?<Link className="rounded-md border bg-white px-4 py-3 font-bold" href="/work/problems">Problems</Link>:null}</section></AppShell>;
}
function Stat({label,value}:{label:string;value:number}){return <div className="rounded-md bg-slate-50 p-2"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div>}
