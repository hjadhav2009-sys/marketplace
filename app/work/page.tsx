import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getWorkHubCounts } from "@/src/lib/workflow/queues";
import { getOrderAssemblyCounts } from "@/src/lib/workflow/order-assembly";

export default async function WorkHubPage(){const user=await requireUser();const account=await requireAccount(user);const [counts,assemblyCounts]=await Promise.all([getWorkHubCounts(user,account.id),(hasWorkPermission(user,"canAssemble")||user.canViewAllWork)?getOrderAssemblyCounts(user.id,account.id):null]);const cards=[
 {show:hasWorkPermission(user,"canPick")||hasWorkPermission(user,"canMark")||hasWorkPermission(user,"canAssemble")||hasWorkPermission(user,"canPack")||user.canViewAllWork,href:"/work/scan",title:"Universal Work Scanner",stage:null,stats:null},
 {show:hasWorkPermission(user,"canPick"),href:"/picker",title:"Order Picking",stage:null},
 {show:hasWorkPermission(user,"canPack"),href:"/packing",title:"Order Packing",stage:null},
 {show:Boolean(assemblyCounts),href:"/work/assembly",title:"Order Assembly",stage:null,stats:assemblyCounts},
 {show:hasWorkPermission(user,"canPick"),href:"/work/consignments/pick",title:"Consignment Picking",stage:"PICK"},
 {show:hasWorkPermission(user,"canMark"),href:"/work/marking",title:"Marking",stage:"MARK"},
 {show:hasWorkPermission(user,"canPack"),href:"/work/consignments/pack",title:"Consignment Packing",stage:"PACK"},
 {show:user.role==="OWNER"||user.canReportProblem||user.canManageConsignments||user.canViewAllWork,href:"/work/problems",title:"Problems",stage:null}
 ];return <AppShell><PageHeader eyebrow="Selected-account work" title="Work Hub" description="Fast worker queues for orders and activated consignments. Quantities are work progress, not inventory."/><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.filter((card)=>card.show).map((card)=>{const stats=card.stats??(card.stage?counts[card.stage]:null);return <Link key={card.title} href={card.href} prefetch className="rounded-md border bg-white p-5 shadow-sm transition hover:border-berry"><p className="text-lg font-black">{card.title}</p>{stats?<div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Stat label="Ready" value={stats.ready}/><Stat label="In progress" value={stats.inProgress}/><Stat label="Assigned to me" value={stats.mine}/><Stat label="Problems" value={stats.problems}/><Stat label="Completed today" value={stats.completedToday}/></div>:<p className="mt-2 text-sm text-slate-600">Open the existing customer-order workflow.</p>}</Link>})}</section></AppShell>;}
function Stat({label,value}:{label:string;value:number}){return <div className="rounded-md bg-slate-50 p-2"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div>;}
