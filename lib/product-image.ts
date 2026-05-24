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

export function getInitialProductImageState(value: string | null | undefined): "loading" | "missing" {
  return isLoadableImageUrl(value) ? "loading" : "missing";
}
