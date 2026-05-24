import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { getProblemOrders } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { resolveProblemOrderAction } from "./actions";

type ProblemsPageProps = {
  searchParams?: Promise<{
    resolved?: string;
    error?: string;
  }>;
};

export default async function ProblemOrdersPage({ searchParams }: ProblemsPageProps) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const [params, problems] = await Promise.all([searchParams, getProblemOrders(account.id)]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Problems"
        title="Problem orders"
        description="Orders that need owner attention before they can be packed."
      />

      {params?.resolved ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Problem resolved and order returned to ready queue.
        </div>
      ) : null}

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Could not update that problem order.
        </div>
      ) : null}

      {problems.length === 0 ? (
        <EmptyState
          title="No problem orders"
          description="When packers mark missing items, color mismatches, or other exceptions, they will appear here."
        />
      ) : (
        <section className="space-y-4">
          {problems.map((problem) => (
            <article key={problem.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-950">AWB {problem.order.awb}</h2>
                    <StatusBadge value={problem.status} />
                  </div>
                  <p className="mt-2 font-semibold text-slate-800">{problem.reason}</p>
                  {problem.details ? <p className="mt-1 text-sm leading-6 text-slate-600">{problem.details}</p> : null}
                </div>
                <div className="text-sm text-slate-500 sm:text-right">
                  <p>{formatDateTime(problem.createdAt)}</p>
                  <p>By {problem.reportedBy?.name ?? "Unknown"}</p>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="font-medium text-slate-500">SKU</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{problem.order.sku}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Qty</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{problem.order.qty}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Color</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{problem.order.color ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Order</dt>
                  <dd className="mt-1 break-words font-semibold text-slate-950">{problem.order.orderNo}</dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href={`/packing/${problem.order.awb}`} className="text-sm font-semibold text-berry hover:text-pink-800">
                  Open scan result
                </Link>
                {problem.status === "OPEN" ? (
                  <form action={resolveProblemOrderAction}>
                    <input type="hidden" name="problemId" value={problem.id} />
                    <SubmitButton pendingText="Resolving..." variant="secondary">
                      Resolve
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </AppShell>
  );
}
