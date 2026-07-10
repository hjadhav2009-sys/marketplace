import { getMobileAppReleaseMetadata } from "@/lib/mobile-app-release";
import { mobileJson } from "@/lib/mobile-api";

export async function GET() {
  return mobileJson(getMobileAppReleaseMetadata(), { headers: { "Cache-Control": "no-store" } });
}
