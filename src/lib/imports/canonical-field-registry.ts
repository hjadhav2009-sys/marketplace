import type { Marketplace } from "@prisma/client";

export type CanonicalFieldKey =
  | "SELLER_SKU"
  | "TITLE"
  | "PRODUCT_TYPE"
  | "DESCRIPTION"
  | "COLOR"
  | "ASIN"
  | "FSN"
  | "LISTING_ID"
  | "LISTING_STATUS"
  | "PRODUCT_ID"
  | "CATALOG_ID"
  | "BRAND"
  | "MRP"
  | "SELLING_PRICE"
  | "PRODUCT_RATING"
  | "MAIN_IMAGE_URL"
  | `OTHER_IMAGE_URL_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | "SWATCH_IMAGE_URL";

export type CanonicalMultiplicity = "ONE" | "ORDERED_MEMBER";
export type CanonicalBlankBehavior = "BLOCK_ROW" | "PRESERVE_STORED_VALUE";

export type CanonicalFieldDefinition = {
  key: CanonicalFieldKey;
  mappingKey: string;
  label: string;
  targetHeader: string;
  required: boolean;
  exactHumanHeaders: readonly string[];
  approvedAliases: readonly string[];
  technicalPatterns: readonly RegExp[];
  multiplicity: CanonicalMultiplicity;
  ordinal?: number;
  storageTargets: readonly string[];
  blankBehavior: CanonicalBlankBehavior;
};

export type ProductCatalogRegistry = {
  marketplace: Extract<Marketplace, "AMAZON" | "FLIPKART" | "MEESHO">;
  label: string;
  fields: readonly CanonicalFieldDefinition[];
};

const field = (definition: CanonicalFieldDefinition) => definition;
const otherImage = (ordinal: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): CanonicalFieldDefinition => field({
  key: `OTHER_IMAGE_URL_${ordinal}`,
  mappingKey: `otherImageUrl${ordinal}`,
  label: `Other image ${ordinal}`,
  targetHeader: `Other Image URL ${ordinal}`,
  required: false,
  exactHumanHeaders: ["Other Image URL"],
  approvedAliases: [`Other Image URL ${ordinal}`, `Other Product Image URL ${ordinal}`],
  technicalPatterns: [new RegExp(`^other_product_image_locator(?:\\[[^\\]]+\\])?#${ordinal}\\.media_location$`, "i")],
  multiplicity: "ORDERED_MEMBER",
  ordinal,
  storageTargets: [`imageUrl${ordinal + 1}`],
  blankBehavior: "PRESERVE_STORED_VALUE",
});
const marketplaceImage=(marketplace:"FLIPKART"|"MEESHO",ordinal:1|2|3|4|5|6|7|8):CanonicalFieldDefinition=>field({key:`OTHER_IMAGE_URL_${ordinal}`,mappingKey:`otherImageUrl${ordinal}`,label:`Image ${ordinal+1}`,targetHeader:`Image ${ordinal+1}`,required:false,exactHumanHeaders:[`Image ${ordinal+1}`],approvedAliases:marketplace==="FLIPKART"?[`Image URL ${ordinal+1}`,`Image ${ordinal+1} 1366 URL`]:[`Image URL ${ordinal+1}`,`Image ${ordinal+1} URL`],technicalPatterns:[],multiplicity:"ORDERED_MEMBER",ordinal,storageTargets:[`imageUrl${ordinal+1}`],blankBehavior:"PRESERVE_STORED_VALUE"});

export const AMAZON_PRODUCT_CATALOG_REGISTRY: ProductCatalogRegistry = {
  marketplace: "AMAZON",
  label: "Amazon Product Catalog",
  fields: [
    field({ key: "SELLER_SKU", mappingKey: "sellerSku", label: "Seller SKU", targetHeader: "SKU", required: true, exactHumanHeaders: ["SKU"], approvedAliases: ["Seller SKU", "Merchant SKU", "Seller SKU Id", "seller_sku"], technicalPatterns: [/^(?:contribution_sku|merchant_sku|seller_sku)#\d+\.value$/i], multiplicity: "ONE", storageTargets: ["sellerSkuId", "sku"], blankBehavior: "BLOCK_ROW" }),
    field({ key: "TITLE", mappingKey: "title", label: "Title", targetHeader: "Title", required: false, exactHumanHeaders: ["Title"], approvedAliases: ["Item Name", "Product Title"], technicalPatterns: [/^item_name(?:\[[^\]]+\])?#\d+\.value$/i], multiplicity: "ONE", storageTargets: ["productTitle"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "PRODUCT_TYPE", mappingKey: "productType", label: "Product Type", targetHeader: "Product Type", required: false, exactHumanHeaders: ["Product Type"], approvedAliases: ["Product Type Name"], technicalPatterns: [/^product_type#\d+\.value$/i], multiplicity: "ONE", storageTargets: ["subCategory", "amazon.productType"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "DESCRIPTION", mappingKey: "description", label: "Description", targetHeader: "Product Description", required: false, exactHumanHeaders: ["Product Description"], approvedAliases: ["Long Description"], technicalPatterns: [/^product_description(?:\[[^\]]+\])?#\d+\.value$/i], multiplicity: "ONE", storageTargets: ["description"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "COLOR", mappingKey: "color", label: "Color", targetHeader: "Color", required: false, exactHumanHeaders: ["Color"], approvedAliases: ["Colour"], technicalPatterns: [/^color(?:\[[^\]]+\])?#\d+\.value$/i], multiplicity: "ONE", storageTargets: ["amazon.color"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "ASIN", mappingKey: "asin", label: "ASIN", targetHeader: "Product Id", required: false, exactHumanHeaders: ["Product Id"], approvedAliases: ["ASIN", "Product ID"], technicalPatterns: [/^(?:external_product_id|product_id)(?:\[[^\]]+\])?#\d+\.value$/i, /^asin(?:\[[^\]]+\])?#\d+\.value$/i], multiplicity: "ONE", storageTargets: ["identifier.ASIN"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "MAIN_IMAGE_URL", mappingKey: "mainImageUrl", label: "Main image", targetHeader: "Main Image URL", required: false, exactHumanHeaders: ["Main Image URL"], approvedAliases: ["Main Product Image", "Main Product Image URL"], technicalPatterns: [/^main_product_image_locator(?:\[[^\]]+\])?#\d+\.media_location$/i], multiplicity: "ONE", storageTargets: ["mainImageUrl", "imageUrl1"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map(otherImage),
    field({ key: "SWATCH_IMAGE_URL", mappingKey: "swatchImageUrl", label: "Swatch image", targetHeader: "Swatch Image URL", required: false, exactHumanHeaders: ["Swatch Image URL"], approvedAliases: ["Swatch Product Image URL"], technicalPatterns: [/^swatch_product_image_locator(?:\[[^\]]+\])?#\d+\.media_location$/i], multiplicity: "ONE", storageTargets: ["imageUrl10"], blankBehavior: "PRESERVE_STORED_VALUE" }),
  ],
};

export const FLIPKART_PRODUCT_CATALOG_REGISTRY: ProductCatalogRegistry = {
  marketplace: "FLIPKART",
  label: "Flipkart Product Catalog",
  fields: [
    field({ key: "SELLER_SKU", mappingKey: "sellerSku", label: "Seller SKU", targetHeader: "Seller SKU Id", required: true, exactHumanHeaders: ["Seller SKU Id"], approvedAliases: ["Seller SKU", "SKU"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["sellerSkuId", "sku"], blankBehavior: "BLOCK_ROW" }),
    field({ key: "FSN", mappingKey: "fsn", label: "FSN", targetHeader: "FSN", required: false, exactHumanHeaders: ["FSN"], approvedAliases: ["Flipkart Serial Number"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["fsn", "identifier.FSN"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "LISTING_ID", mappingKey: "listingId", label: "Listing ID", targetHeader: "Listing ID", required: false, exactHumanHeaders: ["Listing ID"], approvedAliases: ["LID"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["listingId", "identifier.LISTING_ID"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "TITLE", mappingKey: "productTitle", label: "Product Title", targetHeader: "Product Title", required: false, exactHumanHeaders: ["Product Title"], approvedAliases: ["Title"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["productTitle"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "PRODUCT_TYPE", mappingKey: "subCategory", label: "Sub-category", targetHeader: "Sub-category", required: false, exactHumanHeaders: ["Sub-category"], approvedAliases: ["Sub Category", "Product Type"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["subCategory"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "MRP", mappingKey: "mrp", label: "MRP", targetHeader: "MRP", required: false, exactHumanHeaders: ["MRP"], approvedAliases: ["Live MRP"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["mrp"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "SELLING_PRICE", mappingKey: "sellingPrice", label: "Selling Price", targetHeader: "Your Selling Price", required: false, exactHumanHeaders: ["Your Selling Price"], approvedAliases: ["Selling Price", "Selling Price Per Item"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["sellingPrice"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "BRAND", mappingKey: "brand", label: "Brand", targetHeader: "Brand", required: false, exactHumanHeaders: ["Brand"], approvedAliases: ["Live Brand"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["brand"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "DESCRIPTION", mappingKey: "description", label: "Description", targetHeader: "Description", required: false, exactHumanHeaders: ["Description"], approvedAliases: ["Product Description"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["description"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "LISTING_STATUS", mappingKey: "listingStatus", label: "Listing Status", targetHeader: "Listing Status", required: false, exactHumanHeaders: ["Listing Status"], approvedAliases: [], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["listingStatus"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "PRODUCT_RATING", mappingKey: "productRating", label: "Product Rating", targetHeader: "Product Rating", required: false, exactHumanHeaders: ["Product Rating"], approvedAliases: ["Rating"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["flipkart.productRating"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "MAIN_IMAGE_URL", mappingKey: "mainImageUrl", label: "Main Image URL", targetHeader: "Image URL 1", required: false, exactHumanHeaders: ["Image URL 1"], approvedAliases: ["Main Image URL", "Image 1 1366 URL"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["mainImageUrl", "imageUrl1"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    ...([1,2,3,4,5,6,7,8] as const).map(ordinal=>marketplaceImage("FLIPKART",ordinal)),
  ],
};

export const MEESHO_PRODUCT_CATALOG_REGISTRY: ProductCatalogRegistry = {
  marketplace: "MEESHO",
  label: "Meesho Product Catalog",
  fields: [
    field({ key: "SELLER_SKU", mappingKey: "sellerSku", label: "Seller SKU", targetHeader: "Style ID/Sku", required: true, exactHumanHeaders: ["Style ID/Sku"], approvedAliases: ["Style ID / SKU", "Supplier SKU", "SKU", "Seller SKU"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["sellerSkuId", "sku"], blankBehavior: "BLOCK_ROW" }),
    field({ key: "PRODUCT_ID", mappingKey: "productId", label: "Product ID", targetHeader: "Product ID", required: false, exactHumanHeaders: ["Product ID"], approvedAliases: ["Product Id"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["identifier.EXTERNAL_ID", "meesho_product_id"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "CATALOG_ID", mappingKey: "catalogId", label: "Catalog ID", targetHeader: "Catalog ID", required: false, exactHumanHeaders: ["Catalog ID"], approvedAliases: [], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["meesho_catalog_id"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "TITLE", mappingKey: "productTitle", label: "Catalog Name", targetHeader: "Catalog Name", required: false, exactHumanHeaders: ["Catalog Name"], approvedAliases: ["Product Name", "Title"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["productTitle"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "PRODUCT_TYPE", mappingKey: "productType", label: "Category", targetHeader: "Category", required: false, exactHumanHeaders: ["Category"], approvedAliases: ["Product Type"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["subCategory"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "COLOR", mappingKey: "color", label: "Color", targetHeader: "Color", required: false, exactHumanHeaders: ["Color"], approvedAliases: ["Colour"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["meesho.color"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "DESCRIPTION", mappingKey: "description", label: "Description", targetHeader: "Description", required: false, exactHumanHeaders: ["Description"], approvedAliases: ["Product Description"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["description"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "SELLING_PRICE", mappingKey: "meeshoPrice", label: "Meesho Price", targetHeader: "Meesho Price", required: false, exactHumanHeaders: ["Meesho Price"], approvedAliases: ["Price"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["sellingPrice"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    field({ key: "MAIN_IMAGE_URL", mappingKey: "mainImageUrl", label: "Image 1", targetHeader: "Image 1", required: false, exactHumanHeaders: ["Image 1"], approvedAliases: ["Image URL", "Image URL 1", "Image 1 URL", "Main Image URL"], technicalPatterns: [], multiplicity: "ONE", storageTargets: ["mainImageUrl", "imageUrl1"], blankBehavior: "PRESERVE_STORED_VALUE" }),
    ...([1,2,3,4,5,6,7,8] as const).map(ordinal=>marketplaceImage("MEESHO",ordinal)),
  ],
};

export const PRODUCT_CATALOG_REGISTRIES: readonly ProductCatalogRegistry[] = [
  FLIPKART_PRODUCT_CATALOG_REGISTRY,
  AMAZON_PRODUCT_CATALOG_REGISTRY,
  MEESHO_PRODUCT_CATALOG_REGISTRY,
];

export function productCatalogRegistry(marketplace: Marketplace) {
  return PRODUCT_CATALOG_REGISTRIES.find((registry) => registry.marketplace === marketplace) ?? null;
}
