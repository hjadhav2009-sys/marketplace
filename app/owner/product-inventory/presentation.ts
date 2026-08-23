type Identifier = { identifierType: string; rawValue: string };
type Attribute = { technicalKey: string; valueText: string | null };

export type ProductInventoryFilterState = {
  q: string;
  status: string;
  image: string;
  processing: string;
};

const routeLabels: Record<string, string> = {
  PICK_PACK: "Direct to Pack",
  PICK_MARK_PACK: "Marking",
  PICK_ASSEMBLE_PACK: "Assembly",
  PICK_MARK_ASSEMBLE_PACK: "Marking + Assembly"
};

const processingFilters = new Set(["all", "none", ...Object.keys(routeLabels)]);

export function normalizeProcessingFilter(value: string | null | undefined) {
  return value && processingFilters.has(value) ? value : "all";
}

export function processingLabel(route?: string | null) {
  return route ? routeLabels[route] ?? "Saved processing route" : "No saved default";
}

export function markingLabel(route: string | null | undefined, hasMapping: boolean) {
  if (hasMapping) return "Marking configured";
  if (route?.includes("MARK")) return "Marking not configured";
  if (route) return "Marking not required by default";
  return "No marking configuration";
}

function identifierValue(identifiers: Identifier[], type: string) {
  return identifiers.find((identifier) => identifier.identifierType === type)?.rawValue;
}

function attributeValue(attributes: Attribute[], keys: string[]) {
  return attributes.find((attribute) => keys.includes(attribute.technicalKey))?.valueText;
}

export function marketplaceIdentities(input: {
  marketplace: string;
  sellerSkuId: string;
  sku: string;
  fsn: string | null;
  listingId: string | null;
  identifiers: Identifier[];
  attributes: Attribute[];
}) {
  if (input.marketplace === "FLIPKART") {
    return [
      { label: "Seller SKU", value: input.sellerSkuId },
      { label: "FSN", value: input.fsn ?? identifierValue(input.identifiers, "FSN") },
      { label: "Listing ID", value: input.listingId ?? identifierValue(input.identifiers, "LISTING_ID") }
    ];
  }
  if (input.marketplace === "AMAZON") {
    return [
      { label: "Seller SKU", value: input.sellerSkuId },
      { label: "ASIN", value: identifierValue(input.identifiers, "ASIN") },
      { label: "FNSKU", value: identifierValue(input.identifiers, "FNSKU") }
    ];
  }
  if (input.marketplace === "MEESHO") {
    return [
      { label: "Seller SKU", value: input.sellerSkuId },
      { label: "Product ID", value: attributeValue(input.attributes, ["product_id", "meesho_product_id"]) },
      { label: "Catalog ID", value: attributeValue(input.attributes, ["catalog_id", "meesho_catalog_id"]) }
    ];
  }
  return [
    { label: "Seller SKU", value: input.sellerSkuId },
    { label: "Internal SKU", value: input.sku }
  ];
}

export function filterSummary(state: ProductInventoryFilterState) {
  const labels: string[] = [];
  if (state.status === "active") labels.push("Active");
  if (state.status === "inactive") labels.push("Inactive");
  if (state.image === "available") labels.push("Image available");
  if (state.image === "missing") labels.push("Missing image");
  if (state.processing === "none") labels.push("No saved default");
  if (state.processing !== "all" && state.processing !== "none") labels.push(processingLabel(state.processing));
  return labels.length ? labels.join(" / ") : "All products";
}

export function productInventoryHref(state: ProductInventoryFilterState, page: number) {
  const next = new URLSearchParams();
  if (state.q) next.set("q", state.q);
  if (state.status !== "all") next.set("status", state.status);
  if (state.image !== "all") next.set("image", state.image);
  if (state.processing !== "all") next.set("processing", state.processing);
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return `/owner/product-inventory${query ? `?${query}` : ""}`;
}
