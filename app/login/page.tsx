import { redirect } from "next/navigation";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, fieldControlStyles } from "@/components/ui/Field";
import { buttonStyles } from "@/components/ui/buttonStyles";
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
  const hasLoginError = hasInvalidError || hasSessionError;
  const showDevHint = process.env.NODE_ENV !== "production" && process.env.SHOW_DEV_LOGIN_HINTS === "true";

  return (
    <main className="flex min-h-screen items-start justify-center bg-stone-50 px-4 py-4 sm:items-center sm:px-6 sm:py-10">
      <section className="w-full max-w-[460px] rounded-xl border border-slate-200 bg-white p-5 shadow-soft sm:p-8">
        <div className="mb-6 text-center">
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

        {hasLoginError ? (
          <div id="login-error" role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {hasInvalidError ? "The username or password is incorrect." : null}
            {hasSessionError ? "Session creation failed. Try again." : null}
          </div>
        ) : null}

        <form action={loginAction} aria-describedby={hasLoginError ? "login-error" : undefined} className="space-y-5">
          <Field id="login-username" label="Username" invalid={hasLoginError} describedBy={hasLoginError ? "login-error" : undefined} required>
            {(attributes) => (
              <input
                {...attributes}
                name="username"
                autoComplete="username"
                autoFocus={hasLoginError}
                className={fieldControlStyles({ size: "large" })}
                placeholder="Enter username"
                required
              />
            )}
          </Field>

          <PasswordField invalid={hasLoginError} describedBy={hasLoginError ? "login-error" : undefined} />

          <SubmitButton className="w-full" size="large" pendingText="Signing in...">Sign in</SubmitButton>
        </form>

        <Link href="/forgot-password" className={buttonStyles({ variant: "quiet", className: "mt-3 w-full" })}>
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
