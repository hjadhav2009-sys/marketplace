const hiddenSkuSeparatorPattern = /[\uFFFE\uFFFD\u200B-\u200F\u202A-\u202E]/g;
const skuControlPattern = /[\u0000-\u001F\u007F]/g;

export function normalizeSkuForMatching(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(hiddenSkuSeparatorPattern, "-")
    .replace(skuControlPattern, "")
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*_\s*/g, "_")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/^-|-$/g, "");
}
