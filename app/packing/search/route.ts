import { NextResponse } from "next/server";
import { requireAccount, requireUser } from "@/lib/auth";
import { normalizeAwb } from "@/lib/awb";
import { searchOrdersByAwbFragment } from "@/lib/data";

export async function GET(request: Request) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const url = new URL(request.url);
  const query = normalizeAwb(url.searchParams.get("q"));

  if (query.length < 5) {
    return NextResponse.json({ query, results: [] });
  }

  const results = await searchOrdersByAwbFragment(account.id, query, 10);

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
      packStatus: order.packStatus,
      listingTitle: order.listingTitle,
      listingId: order.listingId,
      listingCategory: order.listingCategory,
      matchType: order.matchType,
      matchedField: order.matchedField
    }))
  });
}
