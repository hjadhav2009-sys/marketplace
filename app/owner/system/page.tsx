import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { getAvailableAccounts, requireUser } from "@/lib/auth";
import { compactNumber } from "@/lib/format";
import { getSystemHealth } from "@/lib/system-health";

const exportTypes = [
  { kind: "orders", label: "Orders CSV" },
  { kind: "packed-orders", label: "Packed orders CSV" },
  { kind: "pending-orders", label: "Pending orders CSV" },
  { kind: "problem-orders", label: "Problem orders CSV" },
  { kind: "scan-logs", label: "Scan logs CSV" },
  { kind: "sku-mappings", label: "SKU mappings CSV" },
  { kind: "upload-batches", label: "Upload batches CSV" }
];

export default async function OwnerSystemPage() {
  const user = await requireUser(["OWNER"]);
  const [health, accounts] = await Promise.all([getSystemHealth(), getAvailableAccounts(user)]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Production readiness"
        title="System health"
        description="Check app settings, database growth, daily activity, and export tools before production use."
      >
        <StatusBadge value={health.overallStatus} />
      </PageHeader>

      <section className="mb-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">App</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{health.appName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Version</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{health.version}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Environment</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{health.nodeEnv}</p>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cookie secure mode</p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {health.authCookie.mode} / secure={String(health.authCookie.secure)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">App URL</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-950">{health.nextPublicAppUrl || "Not set"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Database ping</p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {health.databasePingMs === null ? "Failed" : `${health.databasePingMs}ms`}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Local auth warning</p>
            <p className={`mt-1 text-sm font-semibold ${health.authCookie.warning ? "text-rose-700" : "text-teal-700"}`}>
              {health.authCookie.warning ?? "Cookie mode matches the configured app URL."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Database connected" value={health.databaseConnected ? "Yes" : "No"} tone={health.databaseConnected ? "mint" : "clay"} />
        <StatCard label="Active accounts" value={compactNumber(health.activeAccountCount)} />
        <StatCard label="Active users" value={compactNumber(health.activeUserCount)} />
        <StatCard label="Open problems" value={compactNumber(health.openProblemOrders)} tone={health.openProblemOrders > 0 ? "clay" : "mint"} />
        <StatCard label="Batches today" value={compactNumber(health.todayUploadedBatches)} />
        <StatCard label="Imported today" value={compactNumber(health.todayImportedOrders)} />
        <StatCard label="Packed today" value={compactNumber(health.todayPackedOrders)} tone="mint" />
        <StatCard label="Scans today" value={compactNumber(health.todayScanCount)} />
        <StatCard label="Missing image SKUs" value={compactNumber(health.missingImageSkuCount)} tone={health.missingImageSkuCount > 0 ? "clay" : "mint"} />
        <StatCard label="Broken image URLs" value={compactNumber(health.brokenImageUrlCount)} tone={health.brokenImageUrlCount > 0 ? "clay" : "mint"} />
        <StatCard label="Image cache folder" value={health.imageCacheRootExists ? "Ready" : "Missing"} tone={health.imageCacheRootExists ? "mint" : "clay"} />
        <StatCard
          label="Pending migrations"
          value={health.pendingMigrationCount === null ? "Unknown" : compactNumber(health.pendingMigrationCount)}
          tone={health.pendingMigrationCount && health.pendingMigrationCount > 0 ? "clay" : "mint"}
        />
        <StatCard label="Preview rows" value={compactNumber(health.uploadPreviewRowCount)} />
        <StatCard label="Import issues" value={compactNumber(health.importRowIssueCount)} />
        <StatCard label="Scan logs" value={compactNumber(health.scanLogCount)} />
        <StatCard label="Audit logs" value={compactNumber(health.auditLogCount)} />
      </section>

      <section className="mt-8 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Production checks</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {health.productionChecks.map((check) => (
            <div key={check.key} className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold text-slate-950">{check.label}</p>
                <p className="mt-1 text-slate-600">{check.message}</p>
              </div>
              <StatusBadge value={check.status} />
            </div>
          ))}
        </div>
      </section>

      {health.overallStatus === "OK" ? (
        <div className="mt-8">
          <EmptyState title="System all good" description="No production checks currently need action." />
        </div>
      ) : null}

      <section className="mt-8 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">CSV exports</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Export weekly backups or filtered operational reports.</p>
          </div>
          <Link href="/owner/cleanup" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-berry hover:text-berry">
            Open cleanup
          </Link>
        </div>

        <form method="get" className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Account</span>
              <select name="accountId" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Date from</span>
              <input name="from" type="date" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Date to</span>
              <input name="to" type="date" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <input name="status" placeholder="Optional" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exportTypes.map((exportType) => (
              <ExportButton key={exportType.kind} kind={exportType.kind} label={exportType.label} />
            ))}
          </div>
        </form>
        {exportTypes.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="No exports available" description="Export links will appear here when export routes are configured." />
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function ExportButton({ kind, label }: { kind: string; label: string }) {
  return (
    <button
      formAction={`/owner/exports/${kind}`}
      className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-berry hover:text-berry"
    >
      {label}
    </button>
  );
}
