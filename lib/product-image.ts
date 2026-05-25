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
    return cacheStatus === "CACHED" ? "Cached image" : "Image mapped";
  }

  if (state === "missing") {
    if (cacheStatus === "BROKEN") {
      return "Image URL failed";
    }

    if (cacheStatus === "RECHECK_NEEDED") {
      return "Image needs refresh";
    }

    return cacheStatus ? "Image not prepared" : "No image URL";
  }

  if (state === "broken") {
    return hasSource ? "Image URL failed" : "Broken URL";
  }

  return slowLoading ? (cacheStatus === "CACHED" ? "Cached image loading" : "External image slow") : "Loading image";
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
