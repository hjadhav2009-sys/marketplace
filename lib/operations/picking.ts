import type { PackStatus, PickStatus } from "@prisma/client";
import { normalizeSkuForMatching } from "@/lib/sku";

export type PickerOrderInput = {
  id: string;
  awb: string;
  sku: string;
  qty: number;
  color: string | null;
  size: string | null;
  courier: string | null;
  orderNo: string;
  productDescription?: string | null;
  imageUrl?: string | null;
  pickStatus: PickStatus;
  packStatus: PackStatus;
};

export type PickerMappingInput = {
  id?: string;
  sku: string;
  imageUrl: string | null;
  cachedImageUrl?: string | null;
  productName: string | null;
  color?: string | null;
  size?: string | null;
  imageHealth?: string | null;
  cacheStatus?: string | null;
};

export type PickerSkuGroup = {
  sku: string;
  color: string | null;
  size: string | null;
  totalQuantity: number;
  orderCount: number;
  pickedCount: number;
  pendingCount: number;
  problemCount: number;
  status: PickStatus;
  missingImage: boolean;
  productName: string | null;
  imageUrl: string | null;
  mapping: PickerMappingInput | null;
};

export const DEFAULT_PICKER_GROUP_LIMIT = 24;
export const MAX_PICKER_GROUP_LIMIT = 96;

function cleanDimension(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function pickerGroupKey(sku: string, color?: string | null, size?: string | null) {
  return `${sku}::${cleanDimension(color) ?? ""}::${cleanDimension(size) ?? ""}`;
}

export function encodePickerDimension(value: string | null | undefined) {
  return encodeURIComponent(cleanDimension(value) ?? "__NONE__");
}

export function decodePickerDimension(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const decoded = decodeURIComponent(value);
  return decoded === "__NONE__" ? null : decoded;
}

export function pickerDetailPath(sku: string, color: string | null | undefined, size: string | null | undefined) {
  return `/picker/${encodeURIComponent(sku)}?color=${encodePickerDimension(color)}&size=${encodePickerDimension(size)}`;
}

export function buildPickerSkuGroups(orders: PickerOrderInput[], mappings: PickerMappingInput[]) {
  const mappingBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));
  const groups = new Map<string, PickerSkuGroup>();

  for (const order of orders) {
    const color = cleanDimension(order.color);
    const size = cleanDimension(order.size);
    const key = pickerGroupKey(order.sku, color, size);
    const mapping = mappingBySku.get(normalizeSkuForMatching(order.sku)) ?? null;
    const imageUrl = mapping?.cachedImageUrl ?? null;
    const existing =
      groups.get(key) ??
      ({
        sku: order.sku,
        color,
        size,
        totalQuantity: 0,
        orderCount: 0,
        pickedCount: 0,
        pendingCount: 0,
        problemCount: 0,
        status: "READY",
        missingImage: !imageUrl,
        productName: mapping?.productName ?? order.productDescription ?? null,
        imageUrl,
        mapping
      } satisfies PickerSkuGroup);

    existing.totalQuantity += order.qty;
    existing.orderCount += 1;

    if (order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM") {
      existing.problemCount += 1;
    } else if (order.pickStatus === "PICKED") {
      existing.pickedCount += 1;
    } else {
      existing.pendingCount += 1;
    }

    if (mapping?.cachedImageUrl && existing.imageUrl !== mapping.cachedImageUrl) {
      existing.imageUrl = mapping.cachedImageUrl;
      existing.mapping = mapping;
    }

    existing.missingImage = existing.missingImage && !imageUrl;
    groups.set(key, existing);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    status: (group.problemCount > 0 ? "PROBLEM" : group.pendingCount === 0 ? "PICKED" : "READY") as PickStatus
  }));
}

export function filterPickerSkuGroups(
  groups: PickerSkuGroup[],
  options: { query?: string; filter?: string } = {}
) {
  const query = options.query?.trim().toLowerCase();

  return groups
    .filter((group) => {
      if (!query) {
        return true;
      }

      return (
        group.sku.toLowerCase().includes(query) ||
        (group.productName?.toLowerCase().includes(query) ?? false)
      );
    })
    .filter((group) => {
      if (options.filter === "picked") {
        return group.status === "PICKED";
      }

      if (options.filter === "problem") {
        return group.status === "PROBLEM";
      }

      if (options.filter === "missing-image") {
        return group.missingImage;
      }

      return group.status === "READY";
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

export function normalizePickerLimit(value: string | number | null | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PICKER_GROUP_LIMIT;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), MAX_PICKER_GROUP_LIMIT);
}

export function normalizePickerPage(value: string | number | null | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.max(Math.floor(parsed), 1);
}

export function paginatePickerSkuGroups(
  groups: PickerSkuGroup[],
  options: { page?: string | number | null; limit?: string | number | null } = {}
) {
  const page = normalizePickerPage(options.page);
  const limit = normalizePickerLimit(options.limit);
  const visibleCount = page * limit;

  return {
    groups: groups.slice(0, visibleCount),
    page,
    limit,
    total: groups.length,
    visibleCount: Math.min(visibleCount, groups.length),
    hasMore: visibleCount < groups.length,
    nextPage: page + 1
  };
}
