import { NextResponse } from "next/server";
import { requireAccount, requireUser } from "@/lib/auth";
import { normalizeAwb } from "@/lib/awb";
import { searchOrdersByAwbFragment } from "@/lib/data";
import { hasWorkPermission } from "@/lib/work-permissions";
import { canOfferManualAssemblyDiversion, getOrderAssemblyPackingGate } from "@/src/lib/workflow/order-assembly";

export async function GET(request: Request) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPack")) return NextResponse.json({ error: "Packing permission required." }, { status: 403 });
  const url = new URL(request.url);
  const query = normalizeAwb(url.searchParams.get("q"));

  if (query.length < 5) {
    return NextResponse.json({ query, results: [] });
  }

  const results = await searchOrdersByAwbFragment(account.id, query, 10);
  const gate = await getOrderAssemblyPackingGate({ accountId: account.id, orders: results.map((order) => ({ id: order.id, accountId: order.accountId, sku: order.sku })) });
  const assemblyByOrder = new Map(gate.states.map((state) => [state.orderId, state]));

  return NextResponse.json({
    query,
    results: results.map((order) => ({
      awb: order.awb,
      id: order.id,
      marketplace: order.marketplace,
      accountName: account.accountDisplayName ?? account.name,
      trackingId: order.trackingId,
      sku: order.sku,
      cachedImageUrl: order.cachedImageUrl,
      cacheStatus: order.cacheStatus,
      color: order.color,
      qty: order.qty,
      courier: order.courier,
      pickStatus: order.pickStatus,
      packStatus: order.packStatus,
      canPack: order.pickStatus === "PICKED" && assemblyByOrder.get(order.id)?.allowed !== false,
      assemblyState: assemblyByOrder.get(order.id)?.state,
      canOfferManualAssembly: canOfferManualAssemblyDiversion(assemblyByOrder.get(order.id)?.state),
      packBlockedReason: order.pickStatus !== "PICKED" ? "Order must be picked before packing." : assemblyByOrder.get(order.id)?.message,
      listingTitle: order.listingTitle,
      listingId: order.listingId,
      listingCategory: order.listingCategory,
      matchType: order.matchType,
      matchedField: order.matchedField
    }))
  });
}
