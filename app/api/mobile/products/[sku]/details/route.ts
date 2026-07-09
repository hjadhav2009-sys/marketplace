import { cachedProductImageUrl } from "@/lib/image-cache";
import { getMobileAccountContext, mobileError, mobileJson } from "@/lib/mobile-api";
import { startMobileTiming } from "@/lib/mobile-timing";
import { buildListingImageGallery } from "@/lib/product-image";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";

type RouteContext = {
  params: Promise<{ sku: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const done = startMobileTiming("/api/mobile/products/[sku]/details");
  const mobileContext = await getMobileAccountContext(request, ["OWNER", "PICKER", "PACKER"]);

  if (!mobileContext.ok) {
    done({ status: 403 });
    return mobileContext.response;
  }

  const { sku } = await context.params;
  const decodedSku = decodeURIComponent(sku).trim();

  if (!decodedSku) {
    done({ status: 400 });
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
        productName: true,
        color: true,
        size: true,
        imageHealth: true,
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
        sellerSkuId: true,
        productTitle: true,
        liveTitle: true,
        liveBrand: true,
        liveCategory: true,
        subCategory: true,
        fsn: true,
        listingId: true,
        mrp: true,
        sellingPrice: true,
        livePrice: true,
        rating: true,
        reviewCount: true,
        productHighlights: true,
        description: true,
        allSpecifications: true,
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

  if (!mapping && !listing) {
    done({ status: 404 });
    return mobileError("not_found", "No product data found for this SKU.", 404);
  }

  const mainImageUrl = (mapping ? cachedProductImageUrl(mapping) : null) ?? listing?.mainImageUrl ?? mapping?.imageUrl ?? null;

  done({ status: 200, images: buildListingImageGallery(listing, mainImageUrl).length });
  return mobileJson({
    ok: true,
    product: {
      sku: decodedSku,
      title: listing?.productTitle ?? listing?.liveTitle ?? mapping?.productName ?? null,
      brand: listing?.liveBrand ?? null,
      category: listing?.liveCategory ?? listing?.subCategory ?? null,
      fsn: listing?.fsn ?? null,
      listingId: listing?.listingId ?? null,
      color: mapping?.color ?? null,
      size: mapping?.size ?? null,
      mrp: listing?.mrp ?? null,
      sellingPrice: listing?.sellingPrice ?? listing?.livePrice ?? null,
      rating: listing?.rating ?? null,
      reviewCount: listing?.reviewCount ?? null,
      highlights: listing?.productHighlights ?? null,
      description: listing?.description ?? null,
      specifications: listing?.allSpecifications ?? null,
      mainImageUrl,
      gallery: buildListingImageGallery(listing, mainImageUrl),
      cacheStatus: mapping?.cacheStatus ?? null,
      imageHealth: mapping?.imageHealth ?? null
    }
  });
}
