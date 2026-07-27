import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { User } from "@prisma/client";
import { AppNav, MobileDrawer, type AppNavLink } from "@/components/AppNav";
import { MobileAccountMenu } from "@/components/MobileAccountMenu";
import { capabilityHomePath, clearSession, getSelectedAccount, requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-context";
import { hasWorkPermission } from "@/lib/work-permissions";

type AppShellProps = {
  children: ReactNode;
  title?: string;
  allowNoAccount?: boolean;
};

const ownerLinks:AppNavLink[] = [
  { href: "/dashboard", label: "Dashboard", section:"OVERVIEW" },
  { href: "/work", label: "Work Hub", section:"OVERVIEW" },
  { href: "/owner/product-inventory", label: "Product Inventory", section:"CATALOG" },
  { href: "/owner/catalog/missing", label: "Missing Listings", section:"CATALOG" },
  { href: "/owner/process-rules", label: "Default Processing", section:"CATALOG" },
  { href: "/owner/marking-library", label: "Marking Library", section:"CATALOG" },
  { href: "/owner/product-inventory/refresh", label: "New Import", section:"IMPORTS" },
  { href: "/owner/imports", label: "Import History", section:"IMPORTS" },
  { href: "/owner/consignments", label: "Consignments", section:"IMPORTS" },
  { href: "/work/pick?source=ORDER", label: "Pick", section:"OPERATIONS" },
  { href: "/work/mark", label: "Mark", section:"OPERATIONS" },
  { href: "/work/assemble", label: "Assemble", section:"OPERATIONS" },
  { href: "/work/pack", label: "Pack", section:"OPERATIONS" },
  { href: "/work/scan", label: "Universal Scan", section:"OPERATIONS" },
  { href: "/work/problems", label: "Problems", section:"OPERATIONS" },
  { href: "/owner/work-route-summary", label: "Route Summary", section:"OPERATIONS" },
  { href: "/owner/accounts", label: "Accounts", section:"PEOPLE" },
  { href: "/owner/users", label: "Users", section:"PEOPLE" },
  { href: "/reports", label: "Reports", section:"INSIGHTS" },
  { href: "/owner/system", label: "System", section:"INSIGHTS" },
  { href: "/owner/data-management", label: "Data Management", section:"INSIGHTS" },
  { href: "/change-password", label: "Password", section:"PROFILE" }
];

async function logoutAction() {
  "use server";

  const user = await requireUser();
  const account = await getSelectedAccount(user);
  const request = await getRequestMeta();
  await recordAuditLog({
    userId: user.id,
    accountId: account?.id,
    action: "LOGOUT",
    entityType: "User",
    entityId: user.id,
    request
  });
  await clearSession();
  redirect("/login");
}

type NavigationUser = Pick<User, "role" | "canPick" | "canPack" | "canReportProblem" | "canMark" | "canAssemble" | "canManageMarkingLibrary" | "canManageProcessRules" | "canViewAllWork" | "canViewConsignments" | "canImportConsignments" | "canManageConsignments">;

function linksForUser(user: NavigationUser) {
  if (user.role === "OWNER") {
    return ownerLinks;
  }

  const links = [];
  if (hasWorkPermission(user, "canPick") || hasWorkPermission(user, "canMark") || hasWorkPermission(user, "canAssemble") || hasWorkPermission(user, "canPack") || user.canViewAllWork) links.push({ href: "/work", label: "Work" }, { href: "/work/scan", label: "Scan / Pack" });
  if (hasWorkPermission(user, "canPick")) links.push({ href: "/work/pick?source=ORDER", label: "Order Pick" }, { href: "/work/consignments/pick", label: "Consignment Pick" });
  if (hasWorkPermission(user, "canMark")) links.push({ href: "/work/marking", label: "Marking" });
  if (hasWorkPermission(user, "canAssemble") || user.canViewAllWork) links.push({ href: "/work/assembly", label: "Assembly" });
  if (hasWorkPermission(user, "canPack")) links.push({ href: "/packing", label: "Order Pack" }, { href: "/work/consignments/pack", label: "Consignment Pack" });
  if (user.canReportProblem || user.canManageConsignments || user.canViewAllWork) links.push({ href: "/work/problems", label: "Work Problems" });
  if (hasWorkPermission(user, "canViewConsignments") || hasWorkPermission(user, "canImportConsignments") || hasWorkPermission(user, "canManageConsignments")) links.push({ href: "/owner/consignments", label: "Consignments" });
  if (hasWorkPermission(user, "canManageMarkingLibrary")) links.push({ href: "/owner/marking-library", label: "Marking Library" });
  if (hasWorkPermission(user, "canManageProcessRules")) links.push({ href: "/owner/process-rules", label: "Default Processing" });
  links.push({ href: "/change-password", label: "Password" });
  return links;
}

export async function AppShell({ children, title, allowNoAccount = false }: AppShellProps) {
  const user = await requireUser();
  const account = allowNoAccount ? await getSelectedAccount(user) : await requireAccount(user);
  const links = linksForUser(user);
  const accountName = account ? account.accountDisplayName ?? account.name : "No seller account selected";
  const accountCode = account ? account.accountCode ?? account.code : "Create or choose an account";

  return (
    <div className="flex min-h-screen bg-stone-50 text-slate-950">
      <AppNav links={links} accountName={accountName} marketplace={account?.marketplace ?? user.role}/>
      <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-6 sm:py-3">
          <MobileDrawer links={links} accountName={accountName} marketplace={account?.marketplace ?? user.role}/>
          <Link href={account ? capabilityHomePath(user) : user.role === "OWNER" ? "/owner/accounts" : "/accounts"} prefetch className="min-w-0">
            <p className="hidden text-xs font-semibold uppercase tracking-wide text-berry sm:block">Marketplace Pick & Pack</p>
            <p className="truncate text-base font-bold text-slate-950 sm:text-lg">{account ? `${account.companyName} / ${accountName}` : accountName}</p>
            <p className="truncate text-xs font-medium text-slate-500 sm:hidden">
              {account ? account.marketplace : user.role}
            </p>
            <p className="hidden truncate text-xs font-medium text-slate-500 sm:block">
              {account ? `${account.marketplace} / ${accountCode}` : accountCode}
            </p>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 sm:inline-flex">
              {user.role} / {user.name}
            </span>
            <Link
              href="/accounts"
              prefetch
              className="hidden min-h-11 items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:inline-flex"
            >
              Switch account
            </Link>
            <form action={logoutAction} className="hidden sm:block">
              <button className="min-h-11 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:text-sm">
                Logout
              </button>
            </form>
            <MobileAccountMenu role={user.role} name={user.name} logoutAction={logoutAction}/>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-3 pb-8 pt-4 sm:px-6 sm:py-6 lg:py-8">
        {title ? <h1 className="mb-5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1> : null}
        {children}
      </main>
      </div>
    </div>
  );
}
