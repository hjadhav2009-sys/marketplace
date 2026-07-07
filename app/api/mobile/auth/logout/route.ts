import { clearSession } from "@/lib/auth";
import { mobileJson } from "@/lib/mobile-api";

export async function POST() {
  await clearSession();
  return mobileJson({ ok: true });
}
