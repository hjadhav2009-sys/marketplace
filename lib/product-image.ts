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

export type ProductImageState = "loading" | "loaded" | "missing" | "broken";
export type SkuMappingImageFilter = "all" | "mapped" | "broken" | "missing";

type ImageMappingLike = {
  imageUrl?: string | null;
  imageHealth?: string | null;
  productName?: string | null;
};

export function getInitialProductImageState(value: string | null | undefined): Exclude<ProductImageState, "loaded"> {
  if (!value) {
    return "missing";
  }

  return isLoadableImageUrl(value) ? "loading" : "broken";
}

export function productImageStateText(state: ProductImageState, hasSource: boolean, slowLoading = false) {
  if (state === "loaded") {
    return "Image mapped";
  }

  if (state === "missing") {
    return "Missing mapping";
  }

  if (state === "broken") {
    return hasSource ? "Image URL failed" : "Broken URL";
  }

  return slowLoading ? "Still loading image" : "Loading image";
}

export function normalizeSkuMappingImageFilter(value: string | null | undefined): SkuMappingImageFilter {
  return value === "all" || value === "mapped" || value === "broken" || value === "missing" ? value : "all";
}

export function skuMappingMatchesImageFilter(mapping: ImageMappingLike, filter: SkuMappingImageFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "mapped") {
    return Boolean(mapping.imageUrl) && mapping.imageHealth === "MAPPED";
  }

  if (filter === "broken") {
    return mapping.imageHealth === "BROKEN";
  }

  return !mapping.imageUrl;
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
