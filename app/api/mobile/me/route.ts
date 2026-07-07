import { getCurrentSessionState } from "@/lib/auth";
import { mobileError, mobileJson, serializeMobileUser } from "@/lib/mobile-api";

export async function GET() {
  const session = await getCurrentSessionState();

  if (session.status !== "authenticated") {
    return mobileError("unauthorized", "Login required.", 401);
  }

  return mobileJson({
    ok: true,
    user: await serializeMobileUser(session.user)
  });
}
