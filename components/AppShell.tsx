import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { clearSession, requireAccount, requireUser, roleHomePath } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-context";

type AppShellProps = {
  children: ReactNode;
  title?: string;
};

const ownerLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/owner/uploads/new", label: "Import" },
  { href: "/owner/imports", label: "Imports" },
  { href: "/picker", label: "Pick" },
  { href: "/packing", label: "Pack" },
  { href: "/problems", label: "Problems" },
  { href: "/reports", label: "Reports" },
  { href: "/owner/sku-mappings", label: "Listings" },
  { href: "/owner/accounts", label: "Accounts" },
  { href: "/owner/users", label: "Users" },
  { href: "/owner/system", label: "System" },
  { href: "/change-password", label: "Password" }
];

const pickerLinks = [
  { href: "/picker", label: "Pick" },
  { href: "/change-password", label: "Password" }
];

const packerLinks = [
  { href: "/packing", label: "Pack" },
  { href: "/problems", label: "Problems" },
  { href: "/change-password", label: "Password" }
];

async function logoutAction() {
  "use server";

  const user = await requireUser();
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "LOGOUT",
    entityType: "User",
    entityId: user.id,
    request
  });
  await clearSession();
  redirect("/login");
}

function linksForRole(role: string) {
  if (role === "OWNER") {
    return ownerLinks;
  }

  if (role === "PICKER") {
    return pickerLinks;
  }

  return packerLinks;
}

export async function AppShell({ children, title }: AppShellProps) {
  const user = await requireUser();
  const account = await requireAccount(user);
  const links = linksForRole(user.role);
  const accountName = account.accountDisplayName ?? account.name;
  const accountCode = account.accountCode ?? account.code;

  return (
    <div className="min-h-screen bg-stone-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6 sm:py-3">
          <Link href={roleHomePath(user.role)} prefetch className="min-w-0">
            <p className="hidden text-xs font-semibold uppercase tracking-wide text-berry sm:block">Marketplace Pick & Pack</p>
            <p className="truncate text-base font-bold text-slate-950 sm:text-lg">{account.companyName} / {accountName}</p>
            <p className="truncate text-xs font-medium text-slate-500 sm:hidden">
              {account.marketplace} / {user.role}
            </p>
            <p className="hidden truncate text-xs font-medium text-slate-500 sm:block">
              {account.marketplace} / {accountCode}
            </p>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 sm:inline-flex">
              {user.role} / {user.name}
            </span>
            <Link
              href="/accounts"
              prefetch
              className="hidden rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:inline-flex"
            >
              Switch account
            </Link>
            <form action={logoutAction}>
              <button className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                Logout
              </button>
            </form>
          </div>
        </div>
        <AppNav links={links} />
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
        {title ? <h1 className="mb-5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1> : null}
        {children}
      </main>
    </div>
  );
}
