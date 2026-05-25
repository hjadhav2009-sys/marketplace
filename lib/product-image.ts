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

export function getInitialProductImageState(value: string | null | undefined): Exclude<ProductImageState, "loaded"> {
  if (!value) {
    return "missing";
  }

  return isLoadableImageUrl(value) ? "loading" : "broken";
}

export function productImageStateText(state: ProductImageState, hasSource: boolean) {
  if (state === "loaded") {
    return "Image mapped";
  }

  if (state === "missing") {
    return "Missing mapping";
  }

  if (state === "broken") {
    return hasSource ? "Loading failed" : "Broken URL";
  }

  return "Loading image";
}
