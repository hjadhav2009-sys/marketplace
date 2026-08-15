import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav, MobileDrawer } from "@/components/AppNav";
import { MobileAccountMenu } from "@/components/MobileAccountMenu";
import { MobileOverlayCoordinator } from "@/components/MobileOverlayCoordinator";
import { capabilityHomePath, clearSession, getSelectedAccount, requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { navigationForUser, type NavigationUser } from "@/lib/app-navigation";
import { getRequestMeta } from "@/lib/request-context";

type AppShellProps = {
  children: ReactNode;
  title?: string;
  allowNoAccount?: boolean;
};

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
    request,
  });
  await clearSession();
  redirect("/login");
}

function linksForUser(user: NavigationUser) {
  return navigationForUser(user);
}

export async function AppShell({ children, title, allowNoAccount = false }: AppShellProps) {
  const user = await requireUser();
  const account = allowNoAccount ? await getSelectedAccount(user) : await requireAccount(user);
  const links = linksForUser(user);
  const accountName = account
    ? account.accountDisplayName ?? account.name
    : user.role === "OWNER"
      ? "No seller account selected"
      : "No assigned seller account";
  const accountCode = account
    ? account.accountCode ?? account.code
    : user.role === "OWNER"
      ? "Create or choose an account"
      : "Ask the owner to assign an account";
  const accountHome = account ? capabilityHomePath(user) : user.role === "OWNER" ? "/owner/accounts" : "/accounts";
  const accountTitle = account
    ? `${account.companyName} / ${accountName} / ${account.marketplace} / ${accountCode}`
    : `${accountName} / ${accountCode}`;

  return (
    <div className="flex min-h-screen bg-stone-50 text-slate-950">
      <AppNav
        links={links}
        companyName={account?.companyName}
        accountName={accountName}
        accountCode={accountCode}
        marketplace={account?.marketplace ?? user.role}
      />
      <div className="min-w-0 flex-1" data-app-shell-background>
        <a
          href="#app-shell-main"
          className="ui-action ui-action--secondary sr-only fixed left-3 top-3 z-[60] focus:not-sr-only"
        >
          Skip to main content
        </a>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <MobileOverlayCoordinator>
            <div className="flex min-h-16 items-center justify-between gap-3 px-3 py-2 sm:px-6">
              <MobileDrawer
                links={links}
                companyName={account?.companyName}
                accountName={accountName}
                accountCode={accountCode}
                marketplace={account?.marketplace ?? user.role}
              />
              <Link
                href={accountHome}
                prefetch
                title={accountTitle}
                className="flex min-h-11 min-w-0 flex-1 flex-col justify-center xl:hidden"
              >
                <span className="truncate text-sm font-bold text-slate-950 sm:text-base">
                  {account ? `${account.companyName} / ${accountName}` : accountName}
                </span>
                <span className="truncate text-xs font-medium text-slate-600">
                  {account ? `${account.marketplace} / ${accountCode}` : accountCode}
                </span>
              </Link>
              <div className="hidden min-w-0 xl:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-berry">Marketplace Pick &amp; Pack</p>
                <p className="truncate text-sm font-semibold text-slate-700">Warehouse operations workspace</p>
              </div>
              <MobileAccountMenu
                role={user.role}
                name={user.name}
                companyName={account?.companyName}
                accountName={accountName}
                marketplace={account?.marketplace}
                accountCode={accountCode}
                logoutAction={logoutAction}
              />
            </div>
          </MobileOverlayCoordinator>
        </header>
        <main id="app-shell-main" tabIndex={-1} className="mx-auto w-full max-w-[1600px] px-3 pb-8 pt-4 sm:px-6 sm:py-6 xl:py-8">
          {title ? <h1 className="mb-5 break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
