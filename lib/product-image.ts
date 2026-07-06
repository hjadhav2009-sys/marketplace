export function isLoadableImageUrl(value: string | null | undefined) {
  if (!value || (!value.startsWith("http://") && !value.startsWith("https://"))) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isDisplayableImageSrc(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  if (value.startsWith("/product-images/")) {
    return true;
  }

  return isLoadableImageUrl(value);
}

export type ProductImageState = "loading" | "loaded" | "missing" | "broken";
export type SkuMappingImageFilter = "all" | "cached" | "not-cached" | "broken" | "recheck-needed";

export type ListingImageGalleryInput = {
  mainImageUrl?: string | null;
  imageUrl1?: string | null;
  imageUrl2?: string | null;
  imageUrl3?: string | null;
  imageUrl4?: string | null;
  imageUrl5?: string | null;
  imageUrl6?: string | null;
  imageUrl7?: string | null;
  imageUrl8?: string | null;
  imageUrl9?: string | null;
  imageUrl10?: string | null;
  image1366Url1?: string | null;
  image1366Url2?: string | null;
  image1366Url3?: string | null;
  image1366Url4?: string | null;
  image1366Url5?: string | null;
  image1366Url6?: string | null;
  image1366Url7?: string | null;
  image1366Url8?: string | null;
  image1366Url9?: string | null;
  image1366Url10?: string | null;
};

type ImageMappingLike = {
  imageUrl?: string | null;
  imageHealth?: string | null;
  cacheStatus?: string | null;
  productName?: string | null;
  cacheLastUsedAt?: Date | string | null;
  cacheFilePath?: string | null;
  cacheOriginalImageUrl?: string | null;
};

export function getInitialProductImageState(value: string | null | undefined): Exclude<ProductImageState, "loaded"> {
  if (!value) {
    return "missing";
  }

  return isLoadableImageUrl(value) ? "loading" : "broken";
}

export function getInitialDisplayImageState(value: string | null | undefined): Exclude<ProductImageState, "loaded"> {
  if (!value) {
    return "missing";
  }

  return isDisplayableImageSrc(value) ? "loading" : "broken";
}

export function productImageStateText(
  state: ProductImageState,
  hasSource: boolean,
  slowLoading = false,
  cacheStatus?: string | null
) {
  if (state === "loaded") {
    return cacheStatus === "CACHED" ? "Cached image available" : "Image mapped";
  }

  if (state === "missing") {
    if (cacheStatus === "BROKEN") {
      return "Image URL failed";
    }

    if (cacheStatus === "RECHECK_NEEDED") {
      return "Cache needed";
    }

    return cacheStatus ? "Image not prepared" : "No image URL";
  }

  if (state === "broken") {
    return hasSource ? "Image URL failed" : "Broken URL";
  }

  return slowLoading ? (cacheStatus === "CACHED" ? "Cached image loading" : "Still loading") : "Loading image";
}

export function buildListingImageGallery(listing: ListingImageGalleryInput | null | undefined, fallbackImageUrl?: string | null) {
  const images: string[] = [];
  const record = (listing ?? {}) as Record<string, string | null | undefined>;

  function add(value: string | null | undefined) {
    const imageUrl = value?.trim();

    if (!imageUrl || !isDisplayableImageSrc(imageUrl) || images.includes(imageUrl)) {
      return;
    }

    images.push(imageUrl);
  }

  for (let index = 1; index <= 10; index += 1) {
    add(record[`image1366Url${index}`]);
    add(record[`imageUrl${index}`]);
  }

  add(listing?.mainImageUrl);
  add(fallbackImageUrl);

  return images;
}

export function normalizeSkuMappingImageFilter(value: string | null | undefined): SkuMappingImageFilter {
  if (value === "mapped") {
    return "cached";
  }

  if (value === "missing") {
    return "not-cached";
  }

  return value === "all" || value === "cached" || value === "broken" || value === "not-cached" || value === "recheck-needed"
    ? value
    : "all";
}

export function skuMappingMatchesImageFilter(mapping: ImageMappingLike, filter: SkuMappingImageFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "cached") {
    return mapping.cacheStatus === "CACHED";
  }

  if (filter === "broken") {
    return mapping.cacheStatus === "BROKEN" || mapping.imageHealth === "BROKEN";
  }

  if (filter === "recheck-needed") {
    return mapping.cacheStatus === "RECHECK_NEEDED";
  }

  return !mapping.imageUrl || mapping.cacheStatus === "NOT_CACHED";
}

export function imageCacheStatusLabel(mapping: ImageMappingLike | null | undefined) {
  if (!mapping?.imageUrl) {
    return "No image URL";
  }

  if (mapping.cacheStatus === "CACHED") {
    return "Cached locally";
  }

  if (mapping.cacheStatus === "BROKEN") {
    return "Image URL failed";
  }

  if (mapping.cacheStatus === "RECHECK_NEEDED") {
    return "Recheck needed";
  }

  return "Not cached";
}

export function imageHealthLabel(mapping: ImageMappingLike | null | undefined) {
  if (!mapping || !mapping.imageUrl) {
    return "No mapping";
  }

  if (mapping.imageHealth === "BROKEN") {
    return "Broken image URL";
  }

  if (mapping.imageHealth === "MAPPED") {
    return "Image mapped";
  }

  return "Image not checked";
}

export function picklistSummaryProductNameLabel(mapping: ImageMappingLike | null | undefined) {
  if (!mapping) {
    return "No mapping";
  }

  if (mapping.imageHealth === "BROKEN") {
    return "Broken image URL";
  }

  return mapping.productName ?? "Mapped image, no product name";
}
