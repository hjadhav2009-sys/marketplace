export const AMAZON_HEADER_ALIASES = {
  shipmentId: ["shipment id", "shipment-id", "shipment_id", "shipment reference"],
  shipmentName: ["shipment name", "shipment-name", "shipment_name", "shipment"],
  destination: ["destination", "destination fulfillment center", "fulfillment center", "fc", "ship to"],
  sellerSku: ["seller sku", "seller-sku", "seller_sku", "merchant sku", "merchant-sku", "merchant_sku", "item sku", "item_sku", "sku"],
  fnsku: ["fnsku", "fulfillment network sku", "fulfilment network sku"],
  asin: ["asin", "amazon asin", "product asin"],
  externalId: ["external id", "external product id", "product id", "external_product_id"],
  ean: ["ean", "ean code"], upc: ["upc", "upc code"], gtin: ["gtin", "gtin code"],
  quantity: ["quantity", "qty", "units", "shipped quantity", "quantity shipped", "expected quantity", "units expected"],
  title: ["item name", "item_name", "product name", "product title", "item title", "title"],
  brand: ["brand", "brand name", "brand_name", "manufacturer"], category: ["category", "product type", "product_type", "feed product type", "feed_product_type", "item type"], subCategory: ["sub category", "subcategory"],
  material: ["material", "material type", "material_type"], color: ["colour", "color", "color name", "color_name"], size: ["size", "size name", "size_name"], modelNumber: ["model number", "model_number", "model"],
  description: ["description", "product description", "item description"],
  bullet1: ["bullet point 1", "bullet_point1", "bullet point1", "bullet1", "key product features1"], bullet2: ["bullet point 2", "bullet_point2", "bullet point2", "bullet2", "key product features2"], bullet3: ["bullet point 3", "bullet_point3", "bullet point3", "bullet3"], bullet4: ["bullet point 4", "bullet_point4", "bullet point4", "bullet4"], bullet5: ["bullet point 5", "bullet_point5", "bullet point5", "bullet5"],
  mainImage: ["main image url", "main_image_url", "main image", "image url", "image_url"],
  otherImage1: ["other image url1", "other_image_url1", "image url 1"], otherImage2: ["other image url2", "other_image_url2", "image url 2"], otherImage3: ["other image url3", "other_image_url3", "image url 3"], otherImage4: ["other image url4", "other_image_url4", "image url 4"], otherImage5: ["other image url5", "other_image_url5", "image url 5"],
  otherImage6: ["other image url6", "other_image_url6", "image url 6"], otherImage7: ["other image url7", "other_image_url7", "image url 7"], otherImage8: ["other image url8", "other_image_url8", "image url 8"], otherImage9: ["other image url9", "other_image_url9", "image url 9"], otherImage10: ["other image url10", "other_image_url10", "image url 10"],
  listingStatus: ["listing status", "listing_status", "status", "item status"],
  externalIdType: ["external product id type", "external_product_id_type", "product id type"],
  standardPrice: ["standard price", "standard_price", "price"]
} as const;

export function normalizeAmazonHeader(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

export function amazonHeaderIndex(headers: string[], aliases: readonly string[]) {
  const normalized = headers.map(normalizeAmazonHeader);
  return aliases.map(normalizeAmazonHeader).map((alias) => normalized.indexOf(alias)).find((index) => index >= 0) ?? -1;
}
