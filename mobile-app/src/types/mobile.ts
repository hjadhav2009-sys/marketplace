export type MobileAccount = {
  id: string;
  companyName: string | null;
  marketplace: string;
  name: string;
  code: string | null;
  active: boolean;
};

export type MobileUser = {
  id: string;
  username: string;
  name: string | null;
  role: "OWNER" | "PICKER" | "PACKER";
  mustChangePassword: boolean;
  accounts: MobileAccount[];
};

export type MobilePickerGroup = {
  sku: string;
  title: string | null;
  qty: number;
  pendingCount: number;
  pickedCount: number;
  problemCount: number;
  color: string | null;
  size: string | null;
  mainImageUrl: string | null;
  cacheStatus: string | null;
  status: "READY" | "PICKED" | "PROBLEM";
};

export type MobilePackingSearchResult = {
  orderId: string;
  awb: string | null;
  trackingId: string | null;
  marketplace: string;
  sku: string;
  title: string | null;
  qty: number;
  color: string | null;
  size: string | null;
  courier: string | null;
  packStatus: string;
  canPack: boolean;
  mainImageUrl: string | null;
  cacheStatus: string | null;
};

export type MobileProductImages = {
  sku: string;
  mainImageUrl: string | null;
  gallery: string[];
};

export type MobileProductDetails = {
  sku: string;
  title: string | null;
  brand: string | null;
  category: string | null;
  fsn: string | null;
  listingId: string | null;
  color: string | null;
  size: string | null;
  mrp: string | number | null;
  sellingPrice: string | number | null;
  rating: string | number | null;
  reviewCount: string | number | null;
  highlights: string | null;
  description: string | null;
  specifications: string | null;
  mainImageUrl: string | null;
  gallery: string[];
  cacheStatus: string | null;
  imageHealth: string | null;
};

export type ApiState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};
