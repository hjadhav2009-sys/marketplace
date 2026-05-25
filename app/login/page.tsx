import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    expired?: string;
    inactive?: string;
    passwordChanged?: string;
    setup?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/accounts");
  }

  const params = await searchParams;
  const hasInvalidError = params?.error === "invalid";
  const hasLockedError = params?.error === "locked";
  const hasSessionError = params?.error === "session";
  const hasExpiredMessage = params?.expired === "1";
  const hasInactiveMessage = params?.inactive === "1";
  const hasPasswordChangedMessage = params?.passwordChanged === "1";
  const hasSetupComplete = params?.setup === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-berry">Meesho Pick & Pack</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Fast login for daily picking and packing work.</p>
        </div>

        {hasSetupComplete ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Setup complete. Login with your owner account.
          </div>
        ) : null}

        {hasPasswordChangedMessage ? (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            Password changed, login again.
          </div>
        ) : null}

        {hasExpiredMessage ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Session expired. Login again.
          </div>
        ) : null}

        {hasInactiveMessage ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Account inactive. Ask the owner to reactivate this user.
          </div>
        ) : null}

        {hasInvalidError || hasLockedError || hasSessionError ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {hasLockedError ? "Too many failed attempts. Try again later or ask the owner." : null}
            {hasInvalidError ? "Invalid username or password." : null}
            {hasSessionError ? "Session creation failed. Try again." : null}
          </div>
        ) : null}

        <form action={loginAction} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Username</span>
            <input
              name="username"
              autoComplete="username"
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              placeholder="owner"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              placeholder="demo1234"
              required
            />
          </label>

          <SubmitButton pendingText="Signing in...">Sign in</SubmitButton>
        </form>

        <div className="mt-6 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          Seed users: <span className="font-semibold text-slate-900">owner</span>,{" "}
          <span className="font-semibold text-slate-900">picker</span>,{" "}
          <span className="font-semibold text-slate-900">packer</span>. Password:{" "}
          <span className="font-semibold text-slate-900">demo1234</span>.
        </div>
      </section>
    </main>
  );
}
