const hiddenSkuSeparatorPattern = /[\uFFFE\uFFFD\u200B-\u200F\u202A-\u202E]/g;
const mojibakeHiddenSkuSeparatorPattern = /\u00EF\u00BF[\u00BD\u00BE]/g;
const skuControlPattern = /[\u0000-\u001F\u007F]/g;

function joinWrappedSkuParts(value: string) {
  return value
    .replace(/-\s+(?=[A-Za-z][A-Za-z0-9]*\d\b)/g, "-")
    .replace(/\b([A-Za-z0-9]+(?:-[A-Za-z0-9]+){2,})\s+([A-Za-z][A-Za-z0-9]*\d)\b/g, "$1-$2");
}

/**
 * Preserve marketplace SKU identity while removing only presentation noise.
 * In particular, repeated punctuation is meaningful for some seller SKUs and
 * must not be collapsed when the value is stored or used to create a listing.
 */
export function canonicalSkuIdentity(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return joinWrappedSkuParts(
    value
      .normalize("NFKC")
      .replace(mojibakeHiddenSkuSeparatorPattern, "-")
      .replace(hiddenSkuSeparatorPattern, "-")
      .replace(skuControlPattern, " ")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).trim();
}

export function normalizeSkuForMatching(value: string | null | undefined) {
  const canonical = canonicalSkuIdentity(value);

  if (!canonical) {
    return "";
  }

  return canonical
    .replace(/-{2,}/g, "-")
    .replace(/_{2,}/g, "_")
    .trim()
    .replace(/^-|-$/g, "");
}
