import { getSkuGroups } from "@/lib/data";
import { getMobilePermissionAccountContext, mobileJson } from "@/lib/mobile-api";
import { startMobileTiming } from "@/lib/mobile-timing";
import type { MobilePickerGroup } from "@/src/lib/mobile-api/types";

export async function GET(request: Request) {
  const done = startMobileTiming("/api/mobile/picker/groups");
  const context = await getMobilePermissionAccountContext(request, "canPick");

  if (!context.ok) {
    done({ status: 403 });
    return context.response;
  }

  const url = new URL(request.url);
  const result = await getSkuGroups(context.account.id, {
    query: url.searchParams.get("q") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? "50",
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

  done({ status: 200, rows: groups.length, total: result.total });
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
