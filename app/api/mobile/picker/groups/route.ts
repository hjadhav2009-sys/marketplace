import { getSkuGroups } from "@/lib/data";
import { getMobileAccountContext, mobileJson } from "@/lib/mobile-api";
import type { MobilePickerGroup } from "@/src/lib/mobile-api/types";

export async function GET(request: Request) {
  const context = await getMobileAccountContext(request, ["OWNER", "PICKER"]);

  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const result = await getSkuGroups(context.account.id, {
    query: url.searchParams.get("q") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? "24",
    work: url.searchParams.get("work") ?? undefined,
    batchId: url.searchParams.get("batchId") ?? undefined
  });
  const groups: MobilePickerGroup[] = result.groups.map((group) => ({
    sku: group.sku,
    title: group.productName,
    qty: group.totalQuantity,
    pendingCount: group.pendingCount,
    pickedCount: group.pickedCount,
    problemCount: group.problemCount,
    color: group.color,
    size: group.size,
    mainImageUrl: group.imageUrl,
    cacheStatus: group.mapping?.cacheStatus ?? null,
    status: group.status
  }));

  return mobileJson({
    ok: true,
    accountId: context.account.id,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
    nextPage: result.hasMore ? result.nextPage : null,
    groups
  });
}
