import type { Account, SkuImageMapping, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";

export type RawImportRow = Record<string, string>;

export type NormalizedSkuImageRow = {
  rowNumber: number;
  accountName?: string;
  sku: string;
  imageUrl: string;
  productName?: string;
  notes?: string;
  active: boolean;
  rawData: RawImportRow;
};

export type ImportIssue = {
  rowNumber?: number;
  issueType: string;
  message: string;
  rawData?: RawImportRow;
};

export type SkuMappingImportPlan = {
  created: NormalizedSkuImageRow[];
  updated: NormalizedSkuImageRow[];
  unchanged: NormalizedSkuImageRow[];
  errors: ImportIssue[];
};

const skuAliases = ["sku", "skucode", "suppliersku"];
const imageAliases = ["image", "imageurl", "image_url", "meeshoimageurl", "productimageurl"];
const nameAliases = ["name", "productname", "producttitle"];
const accountAliases = ["account", "accountname"];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getAliasedValue(row: RawImportRow, aliases: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(key))) {
      return value.trim();
    }
  }

  return "";
}

export function isValidImportImageUrl(value: string) {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function parseActive(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return !["false", "0", "no", "n", "inactive"].includes(normalized);
}

export function normalizeSkuImageRows(rows: RawImportRow[]) {
  const normalized: NormalizedSkuImageRow[] = [];
  const errors: ImportIssue[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const sku = getAliasedValue(row, skuAliases);
    const imageUrl = getAliasedValue(row, imageAliases);

    if (!sku) {
      errors.push({
        rowNumber,
        issueType: "MISSING_SKU",
        message: "SKU is required.",
        rawData: row
      });
      return;
    }

    if (!imageUrl) {
      errors.push({
        rowNumber,
        issueType: "MISSING_IMAGE_URL",
        message: "Image URL is required.",
        rawData: row
      });
      return;
    }

    if (!isValidImportImageUrl(imageUrl)) {
      errors.push({
        rowNumber,
        issueType: "INVALID_IMAGE_URL",
        message: "Image URL must be a valid http:// or https:// URL.",
        rawData: row
      });
      return;
    }

    normalized.push({
      rowNumber,
      accountName: getAliasedValue(row, accountAliases) || undefined,
      sku,
      imageUrl,
      productName: getAliasedValue(row, nameAliases) || undefined,
      notes: getAliasedValue(row, ["notes"]) || undefined,
      active: parseActive(getAliasedValue(row, ["active"])),
      rawData: row
    });
  });

  return { normalized, errors };
}

function sameMapping(mapping: Pick<SkuImageMapping, "imageUrl" | "productName" | "notes" | "active">, row: NormalizedSkuImageRow) {
  return (
    mapping.imageUrl === row.imageUrl &&
    (mapping.productName ?? "") === (row.productName ?? "") &&
    (mapping.notes ?? "") === (row.notes ?? "") &&
    mapping.active === row.active
  );
}

export function planSkuMappingImport(
  existingMappings: Array<Pick<SkuImageMapping, "sku" | "imageUrl" | "productName" | "notes" | "active">>,
  rows: RawImportRow[]
): SkuMappingImportPlan {
  const { normalized, errors } = normalizeSkuImageRows(rows);
  const existingBySku = new Map(existingMappings.map((mapping) => [mapping.sku, mapping]));

  return normalized.reduce<SkuMappingImportPlan>(
    (plan, row) => {
      const existing = existingBySku.get(row.sku);

      if (!existing) {
        plan.created.push(row);
      } else if (sameMapping(existing, row)) {
        plan.unchanged.push(row);
      } else {
        plan.updated.push(row);
      }

      return plan;
    },
    { created: [], updated: [], unchanged: [], errors }
  );
}

function findAccountForRow(accounts: Account[], selectedAccount: Account, row: NormalizedSkuImageRow) {
  if (!row.accountName) {
    return selectedAccount;
  }

  const requested = row.accountName.toLowerCase();
  return accounts.find((account) => account.name.toLowerCase() === requested || account.code.toLowerCase() === requested) ?? null;
}

export async function importSkuMappingsFromRows(input: {
  rows: RawImportRow[];
  fileName: string;
  selectedAccount: Account;
  user: User;
  request?: RequestMeta;
}) {
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.selectedAccount.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "SKU_IMAGE",
      status: "UPLOADED",
      totalRows: input.rows.length
    }
  });

  const accounts = await prisma.account.findMany();
  const { normalized, errors } = normalizeSkuImageRows(input.rows);
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;

  for (const issue of errors) {
    await prisma.importRowIssue.create({
      data: {
        batchId: batch.id,
        rowNumber: issue.rowNumber,
        issueType: issue.issueType,
        message: issue.message,
        rawData: issue.rawData ? JSON.stringify(issue.rawData) : null
      }
    });
  }

  for (const row of normalized) {
    const account = findAccountForRow(accounts, input.selectedAccount, row);

    if (!account) {
      await prisma.importRowIssue.create({
        data: {
          batchId: batch.id,
          rowNumber: row.rowNumber,
          issueType: "UNKNOWN_ACCOUNT",
          message: `No account matched "${row.accountName}".`,
          rawData: JSON.stringify(row.rawData)
        }
      });
      continue;
    }

    const existing = await prisma.skuImageMapping.findUnique({
      where: {
        accountId_sku: {
          accountId: account.id,
          sku: row.sku
        }
      }
    });

    if (!existing) {
      await prisma.skuImageMapping.create({
        data: {
          accountId: account.id,
          sku: row.sku,
          imageUrl: row.imageUrl,
          productName: row.productName,
          active: row.active,
          notes: row.notes,
          source: input.fileName,
          lastImportedAt: new Date(),
          imageHealth: "MAPPED"
        }
      });
      createdRows += 1;
      continue;
    }

    if (sameMapping(existing, row)) {
      skippedRows += 1;
      continue;
    }

    await prisma.skuImageMapping.update({
      where: { id: existing.id },
      data: {
        imageUrl: row.imageUrl,
        productName: row.productName,
        active: row.active,
        notes: row.notes,
        source: input.fileName,
        lastImportedAt: new Date(),
        imageHealth: "MAPPED"
      }
    });
    updatedRows += 1;
  }

  const errorRows = errors.length + (await prisma.importRowIssue.count({ where: { batchId: batch.id, issueType: "UNKNOWN_ACCOUNT" } }));

  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: errorRows > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      skippedRows,
      errorRows
    }
  });

  await recordAuditLog({
    userId: input.user.id,
    accountId: input.selectedAccount.id,
    action: "SKU_MAPPING_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows,
      updatedRows,
      skippedRows,
      errorRows
    },
    request: input.request
  });

  return updatedBatch;
}
