import Link from "next/link";
import type { WorkStage } from "@prisma/client";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getSmartStageSummary } from "@/src/lib/workflow/grouped-work";
import { LiveWorkHubSummary } from "./LiveWorkHubSummary";

function permissionFor(stage: WorkStage) {
  return stage === "PICK" ? "canPick" : stage === "MARK" ? "canMark" : stage === "ASSEMBLE" ? "canAssemble" : "canPack";
}

export default async function WorkHubPage() {
  const user = await requireUser();
  const stages = ["PICK", "MARK", "ASSEMBLE", "PACK"] as WorkStage[];
  const allowed = stages.filter((stage) => hasWorkPermission(user, permissionFor(stage)) || user.canViewAllWork);
  if (!allowed.length) redirect(capabilityHomePath(user));
  const account = await requireAccount(user);
  const values = await Promise.all(allowed.map((stage) => getSmartStageSummary({ actorUserId: user.id, accountId: account.id, stage })));
  const initial = Object.fromEntries(allowed.map((stage, index) => [stage, values[index]]));
  const access = Object.fromEntries(allowed.map((stage) => [stage, hasWorkPermission(user, permissionFor(stage)) ? "ACTION" : "READ_ONLY"]));

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${account.marketplace} / ${account.accountDisplayName ?? account.name}`}
        title="Work Hub"
        description="Open your assigned stage. Customer Orders and Consignments remain separated inside every queue."
      />
      <LiveWorkHubSummary initial={initial} access={access}/>
      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link href="/work/scan" className="rounded-md border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-blue-700">SCAN AND LOOK UP</p>
          <p className="mt-2 text-xl font-black">Universal Scanner</p>
          <p className="text-sm text-slate-600">Find active work in the selected seller account. Scanning alone never performs an action.</p>
        </Link>
        <Link href="/work/problems" className="rounded-md border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold text-rose-700">WORK EXCEPTIONS</p>
          <p className="mt-2 text-xl font-black">Problems</p>
          <p className="text-sm text-slate-600">Review assignment and interrupted-stage problems you are allowed to see.</p>
        </Link>
      </section>
    </AppShell>
  );
}
