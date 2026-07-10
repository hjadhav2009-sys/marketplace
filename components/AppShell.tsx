import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav, MobileBottomNav } from "@/components/AppNav";
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
  { href: "/owner/marking-library", label: "Marking Library" },
  { href: "/owner/process-rules", label: "Process Rules" },
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

const pickerMobileLinks = [
  { href: "/picker", label: "Pick" },
  { href: "/problems", label: "Problems" },
  { href: "/accounts", label: "Account" }
];

const packerMobileLinks = [
  { href: "/packing", label: "Pack" },
  { href: "/problems", label: "Problems" },
  { href: "/accounts", label: "Account" }
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

function linksForUser(user: { role: string; canManageMarkingLibrary: boolean; canManageProcessRules: boolean }) {
  if (user.role === "OWNER") {
    return ownerLinks;
  }

  const links = user.role === "PICKER" ? [...pickerLinks] : [...packerLinks];
  if (user.canManageMarkingLibrary) links.splice(-1, 0, { href: "/owner/marking-library", label: "Marking Library" });
  if (user.canManageProcessRules) links.splice(-1, 0, { href: "/owner/process-rules", label: "Process Rules" });
  return links;
}

function mobileLinksForRole(role: string) {
  if (role === "PICKER") {
    return pickerMobileLinks;
  }

  if (role === "PACKER") {
    return packerMobileLinks;
  }

  return [];
}

export async function AppShell({ children, title }: AppShellProps) {
  const user = await requireUser();
  const account = await requireAccount(user);
  const links = linksForUser(user);
  const accountName = account.accountDisplayName ?? account.name;
  const accountCode = account.accountCode ?? account.code;
  const mobileLinks = mobileLinksForRole(user.role);
  const managementMobileLinks = (user.role === "OWNER" ? ownerLinks : links).filter((link) => link.href !== "/change-password");

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
            {user.role === "OWNER" || user.canManageMarkingLibrary || user.canManageProcessRules ? (
              <details className="relative sm:hidden" data-owner-mobile-menu>
                <summary className="list-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm">
                  Menu
                </summary>
                <div className="absolute right-0 mt-2 grid w-56 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-xl">
                  {managementMobileLinks.map((link) => (
                    <Link key={link.href} href={link.href} prefetch className="rounded-md px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
                      {link.label}
                    </Link>
                  ))}
                  <Link href="/accounts" prefetch className="rounded-md px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
                    Switch account
                  </Link>
                  <Link href="/change-password" prefetch className="rounded-md px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
                    Password
                  </Link>
                </div>
              </details>
            ) : null}
            <form action={logoutAction}>
              <button className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:text-sm">
                Logout
              </button>
            </form>
          </div>
        </div>
        <AppNav links={links} />
      </header>
      <main className="mx-auto max-w-7xl px-3 pb-24 pt-4 sm:px-6 sm:py-6 lg:py-8">
        {title ? <h1 className="mb-5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1> : null}
        {children}
      </main>
      {mobileLinks.length > 0 ? <MobileBottomNav links={mobileLinks} /> : null}
    </div>
  );
}
