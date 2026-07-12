import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const reviewLinks = [
  ["Dashboard", "/dashboard"], ["Accounts", "/owner/accounts"], ["Users", "/owner/users"], ["Imports", "/owner/imports"],
  ["Listings", "/owner/sku-mappings"], ["Marking Library", "/owner/marking-library"], ["Process Rules", "/owner/process-rules"],
  ["Customer Picker", "/picker"], ["Assembly", "/work/assembly"], ["Customer Packing", "/packing"],
  ["Flipkart and Amazon Consignments", "/owner/consignments"], ["Consignment Picker", "/work/consignments/pick"],
  ["Marking", "/work/marking"], ["Consignment Packing", "/work/consignments/pack"], ["Universal Scanner", "/work/scan"],
  ["Problems", "/problems"], ["Reports", "/reports"], ["System", "/owner/system"]
] as const;

export default async function OwnerManualReviewPage() {
  await requireUser(["OWNER"]);
  const accounts = await prisma.account.count();
  const amazonAccounts = await prisma.account.count({ where: { marketplace: "AMAZON", active: true } });
  const listings = await prisma.marketplaceListing.count();
  const orders = await prisma.order.count();
  const activeConsignments = await prisma.consignmentBatch.count({ where: { status: { in: ["ACTIVE", "PROBLEM"] } } });
  const taskGroups = await prisma.workTask.groupBy({ by: ["stage"], where: { status: { in: ["READY", "IN_PROGRESS", "PROBLEM"] } }, _count: { _all: true } });
  const taskCount = (stage: "PICK" | "MARK" | "ASSEMBLE" | "PACK") => taskGroups.find((group) => group.stage === stage)?._count._all ?? 0;
  const orderProblems = await prisma.problemOrder.count({ where: { status: "OPEN" } });
  const taskProblems = await prisma.workTask.count({ where: { status: "PROBLEM" } });

  return <AppShell>
    <PageHeader eyebrow="Owner QA" title="Current data manual review" description="Read-only navigation and safe counts for reviewing the migrated application with current marketplace data." />
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Accounts" value={accounts}/><StatCard label="Listings" value={listings}/><StatCard label="Orders" value={orders}/><StatCard label="Active consignments" value={activeConsignments}/><StatCard label="Problems" value={orderProblems+taskProblems} tone={orderProblems+taskProblems?"clay":"mint"}/>
      <StatCard label="Pick tasks" value={taskCount("PICK")}/><StatCard label="Mark tasks" value={taskCount("MARK")}/><StatCard label="Assembly tasks" value={taskCount("ASSEMBLE")}/><StatCard label="Pack tasks" value={taskCount("PACK")}/>
    </section>
    <section className="mt-6"><h2 className="text-lg font-bold">Review pages</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{reviewLinks.map(([label,href])=><Link key={href} href={href} prefetch className="min-h-11 rounded-md border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 shadow-sm hover:border-pink-300 hover:bg-pink-50">{label}</Link>)}</div></section>
    <section className="mt-6 grid gap-4 lg:grid-cols-3">
      {!amazonAccounts?<EmptyState title="No active Amazon account" description="Create or activate an Amazon seller account, then import an Amazon shipment and supporting reports." action={{href:"/owner/accounts",label:"Open accounts"}}/>:null}
      {!taskCount("MARK")?<EmptyState title="No marking work" description="Activate a marking-required consignment or configure a listing process rule." action={{href:"/owner/process-rules",label:"Open process rules"}}/>:null}
      {!taskCount("ASSEMBLE")?<EmptyState title="No assembly work" description="Pick an assembly-required order or send a picked order to Assembly manually." action={{href:"/work/assembly",label:"Open Assembly"}}/>:null}
    </section>
    <p className="mt-6 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">This page does not create, update, delete, activate, pack, pick, mark, or assemble records. Follow the documented checklist and use sanitized screenshots when reporting issues.</p>
  </AppShell>;
}
