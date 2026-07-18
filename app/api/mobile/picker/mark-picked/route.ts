import {
  getMobilePermissionAccountContext,
  mobileError,
  readMobileJsonBody
} from "@/lib/mobile-api";

export async function POST(request: Request) {
  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const context = await getMobilePermissionAccountContext(request, "canPick", body.data.accountId);

  if (!context.ok) {
    return context.response;
  }

  void context;
  return mobileError("legacy_picker_retired", "SKU-group Pick completion was retired. Use an exact source-aware Pick task and choose its next route.", 410);
}
