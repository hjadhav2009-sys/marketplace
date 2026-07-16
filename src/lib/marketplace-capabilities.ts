import type { Marketplace } from "@prisma/client";

export type MarketplaceCapabilities = { productCatalog: boolean; dailyOrders: boolean; consignments: boolean };

const CAPABILITIES: Record<Marketplace, MarketplaceCapabilities> = {
  FLIPKART: { productCatalog: true, dailyOrders: true, consignments: true },
  AMAZON: { productCatalog: true, dailyOrders: false, consignments: true },
  MEESHO: { productCatalog: true, dailyOrders: true, consignments: false },
  MYNTRA: { productCatalog: false, dailyOrders: false, consignments: false },
  SHOPIFY: { productCatalog: false, dailyOrders: false, consignments: false },
  WOOCOMMERCE: { productCatalog: false, dailyOrders: false, consignments: false },
  OTHER: { productCatalog: false, dailyOrders: false, consignments: false }
};

export function marketplaceCapabilities(marketplace: Marketplace) { return CAPABILITIES[marketplace]; }
export function marketplaceCapabilityEnabled(marketplace: Marketplace, capability: keyof MarketplaceCapabilities) { return CAPABILITIES[marketplace][capability]; }
export function assertMarketplaceCapability(marketplace: Marketplace, capability: keyof MarketplaceCapabilities) {
  if (!marketplaceCapabilityEnabled(marketplace, capability)) throw new Error(`${capability === "dailyOrders" ? "Daily Orders" : capability === "productCatalog" ? "Product Catalog" : "Consignments"} is currently disabled for ${marketplace}.`);
}
