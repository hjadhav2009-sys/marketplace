import { redirect } from "next/navigation";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "./actions";
import { PasswordField } from "./PasswordField";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    expired?: string;
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
  const hasSessionError = params?.error === "session";
  const hasExpiredMessage = params?.expired === "1";
  const hasPasswordChangedMessage = params?.passwordChanged === "1";
  const hasSetupComplete = params?.setup === "1";
  const showDevHint = process.env.NODE_ENV !== "production" && process.env.SHOW_DEV_LOGIN_HINTS === "true";

  return (
    <main className="flex min-h-screen items-start justify-center bg-stone-50 px-4 py-8 sm:items-center sm:px-6 sm:py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-7 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-berry">Marketplace Pick & Pack</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700 sm:text-base">Fast login for daily picking and packing work.</p>
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
          <div role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Your session expired. Sign in again to continue.
          </div>
        ) : null}

        {hasInvalidError || hasSessionError ? (
          <div role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {hasInvalidError ? "The username or password is incorrect." : null}
            {hasSessionError ? "Session creation failed. Try again." : null}
          </div>
        ) : null}

        <form action={loginAction} className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Username</span>
            <input
              name="username"
              autoComplete="username"
              className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 text-base outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              placeholder="Enter username"
              required
            />
          </label>

          <PasswordField />

          <div className="[&_button]:min-h-12 [&_button]:w-full [&_button]:rounded-full [&_button]:text-base [&_button]:font-semibold">
            <SubmitButton pendingText="Signing in...">Sign in</SubmitButton>
          </div>
        </form>

        <Link href="/forgot-password" className="mt-3 flex min-h-11 items-center justify-center text-sm font-semibold text-berry hover:text-pink-800">
          Forgot password?
        </Link>

        {showDevHint ? (
          <div className="mt-6 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Development login hints are enabled locally. Disable <span className="font-semibold text-slate-900">SHOW_DEV_LOGIN_HINTS</span> before sharing this app.
          </div>
        ) : null}
      </section>
    </main>
  );
}
