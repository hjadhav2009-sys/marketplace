import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const RESOLVABLE_ORDER_ISSUES: string[] = [
  "MISSING_FLIPKART_LISTING_MAPPING",
  "AMBIGUOUS_LISTING"
];

export default async function MissingCatalogPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; resolved?: string }>;
}) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = 50;
  const where = {
    batch: { accountId: account.id },
    sourceType: "ORDER",
    issueType: { in: [...RESOLVABLE_ORDER_ISSUES] },
    resolved: false
  };
  const [total, issues] = await Promise.all([
    prisma.importRowIssue.count({ where }),
    prisma.importRowIssue.findMany({
      where,
      select: {
        id: true,
        rowNumber: true,
        message: true,
        safeDataJson: true,
        issueType: true,
        createdAt: true
      },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Held catalog work"
          title="Missing Listings"
          description="Orders remain safely held here until an owner links or creates an account-scoped listing. Ambiguous matches must be linked to one exact candidate."
          action={{ href: "/owner/product-inventory/new", label: "Create Listing" }}
        />
        {query.resolved ? (
          <p
            role="status"
            className="mb-4 rounded-md border border-teal-200 bg-teal-50 p-3 font-semibold text-teal-800"
          >
            Listing resolved and eligible work was released.
          </p>
        ) : null}
        {!issues.length ? (
          <EmptyState
            title="No unresolved missing listings"
            description="All retained Order and Consignment catalog identities are resolved."
            action={{ href: "/owner/product-inventory", label: "Open Product Inventory" }}
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-semibold text-slate-800">
                {total.toLocaleString()} unresolved listing issue{total === 1 ? "" : "s"}
              </p>
              <p className="text-slate-500">Page {page}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {issues.map((issue) => {
                let safe: Record<string, unknown> = {};
                try {
                  safe = JSON.parse(issue.safeDataJson ?? "{}");
                } catch {}
                const ambiguous = issue.issueType === "AMBIGUOUS_LISTING";
                return (
                  <article
                    key={issue.id}
                    className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <p className="text-xs font-semibold text-amber-700">
                      {ambiguous
                        ? "Exact listing selection required"
                        : "Work held until listing is resolved"}
                    </p>
                    <h2 className="mt-1 break-words font-semibold text-slate-950">
                      {String(safe.sellerSku ?? "Missing Seller SKU")}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Source row {issue.rowNumber ?? "not available"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{issue.message}</p>
                    <Link
                      href={`/owner/catalog/missing/${issue.id}`}
                      className="mt-3 inline-flex min-h-11 items-center justify-center self-start rounded-md bg-berry px-4 font-semibold text-white hover:bg-pink-800"
                    >
                      {ambiguous ? "Choose Exact Listing" : "Resolve Listing"}
                    </Link>
                  </article>
                );
              })}
            </div>
          </>
        )}
        <div className="mt-4 flex gap-2">
          {page > 1 ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border px-4 font-semibold"
              href={`?page=${page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          {page * pageSize < total ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border px-4 font-semibold"
              href={`?page=${page + 1}`}
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
