import { getCurrentSessionState } from "@/lib/auth";
import { mobileError, mobileJson, serializeMobileUser } from "@/lib/mobile-api";
import { startMobileTiming } from "@/lib/mobile-timing";

export async function GET() {
  const done = startMobileTiming("/api/mobile/me");
  const session = await getCurrentSessionState();

  if (session.status !== "authenticated") {
    done({ status: 401 });
    return mobileError("unauthorized", "Login required.", 401);
  }

  const user = await serializeMobileUser(session.user);
  done({ status: 200, accounts: user.accounts.length });
  return mobileJson({
    ok: true,
    user
  });
}
