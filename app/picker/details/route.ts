import { NextResponse } from "next/server";
import { requireAccount, requireUser } from "@/lib/auth";
import { getSkuDetail } from "@/lib/data";
import { hasWorkPermission } from "@/lib/work-permissions";

export async function GET(request: Request) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) return NextResponse.json({ error: "Picking permission required." }, { status: 403 });
  const url = new URL(request.url);
  const sku = url.searchParams.get("sku")?.trim();

  if (!sku) {
    return NextResponse.json({ error: "Missing SKU" }, { status: 400 });
  }

  const detail = await getSkuDetail(account.id, sku, {
    color: url.searchParams.get("color") ?? undefined,
    size: url.searchParams.get("size") ?? undefined
  });

  return NextResponse.json({
    sku,
    totalQuantity: detail.totalQuantity,
    pickedCount: detail.pickedCount,
    pendingCount: detail.pendingCount,
    problemCount: detail.problemCount,
    courierCounts: detail.courierCounts,
    mapping: detail.mapping,
    listing: detail.listing,
    orders: detail.orders.map((order) => ({
      id: order.id,
      awb: order.awb,
      trackingId: order.trackingId,
      shipmentId: order.shipmentId,
      orderItemId: order.orderItemId,
      sku: order.sku,
      fsn: order.fsn,
      qty: order.qty,
      color: order.color,
      size: order.size,
      courier: order.courier,
      orderNo: order.orderNo,
      productDescription: order.productDescription,
      pickStatus: order.pickStatus,
      packStatus: order.packStatus
    }))
  });
}
