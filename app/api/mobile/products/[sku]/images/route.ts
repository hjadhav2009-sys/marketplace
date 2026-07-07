import { cachedProductImageUrl } from "@/lib/image-cache";
import { getMobileAccountContext, mobileError, mobileJson } from "@/lib/mobile-api";
import { buildListingImageGallery } from "@/lib/product-image";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";
import type { MobileProductImages } from "@/src/lib/mobile-api/types";

type RouteContext = {
  params: Promise<{ sku: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const mobileContext = await getMobileAccountContext(request, ["OWNER", "PICKER", "PACKER"]);

  if (!mobileContext.ok) {
    return mobileContext.response;
  }

  const { sku } = await context.params;
  const decodedSku = decodeURIComponent(sku).trim();

  if (!decodedSku) {
    return mobileError("invalid_sku", "SKU is required.", 400);
  }

  const skuValues = Array.from(new Set([decodedSku, normalizeSkuForMatching(decodedSku)].filter(Boolean)));
  const [mapping, listing] = await Promise.all([
    prisma.skuImageMapping.findFirst({
      where: {
        accountId: mobileContext.account.id,
        active: true,
        sku: { in: skuValues }
      },
      select: {
        accountId: true,
        sku: true,
        imageUrl: true,
        cacheStatus: true,
        cacheFilePath: true,
        cacheOriginalImageUrl: true,
        cacheCachedAt: true
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.marketplaceListing.findFirst({
      where: {
        accountId: mobileContext.account.id,
        marketplace: "FLIPKART",
        sku: { in: skuValues }
      },
      select: {
        sku: true,
        mainImageUrl: true,
        imageUrl1: true,
        imageUrl2: true,
        imageUrl3: true,
        imageUrl4: true,
        imageUrl5: true,
        imageUrl6: true,
        imageUrl7: true,
        imageUrl8: true,
        imageUrl9: true,
        imageUrl10: true,
        image1366Url1: true,
        image1366Url2: true,
        image1366Url3: true,
        image1366Url4: true,
        image1366Url5: true,
        image1366Url6: true,
        image1366Url7: true,
        image1366Url8: true,
        image1366Url9: true,
        image1366Url10: true
      }
    })
  ]);
  const mainImageUrl = (mapping ? cachedProductImageUrl(mapping) : null) ?? listing?.mainImageUrl ?? mapping?.imageUrl ?? null;
  const response: MobileProductImages = {
    sku: decodedSku,
    mainImageUrl,
    gallery: buildListingImageGallery(listing, mainImageUrl)
  };

  return mobileJson({ ok: true, images: response });
}
