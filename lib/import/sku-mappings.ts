import type { Account, SkuImageMapping, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";

export type RawImportRow = Record<string, string>;

export type NormalizedSkuImageRow = {
  rowNumber: number;
  accountName?: string;
  sku: string;
  imageUrl: string;
  rawData: RawImportRow;
};

export type SkuMappingAccountRef = Pick<Account, "id" | "name" | "code">;

export type ResolvedSkuImageRow = NormalizedSkuImageRow & {
  accountId: string;
  resolvedAccountName: string;
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

export type AccountSkuMappingImportPlan = {
  created: ResolvedSkuImageRow[];
  updated: ResolvedSkuImageRow[];
  unchanged: ResolvedSkuImageRow[];
  errors: ImportIssue[];
};

const skuAliases = ["sku", "skucode", "suppliersku"];
const imageAliases = ["image", "imageurl", "image_url", "meeshoimageurl", "productimageurl"];
const accountAliases = ["account", "accountname", "accountcode"];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getAliasedValue(row: RawImportRow, aliases: string[]) {
  return getAliasedField(row, aliases).value;
}

function getAliasedField(row: RawImportRow, aliases: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(key))) {
      return {
        value: value.trim(),
        found: true
      };
    }
  }

  return {
    value: "",
    found: false
  };
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

export function normalizeSkuImageRows(rows: RawImportRow[]) {
  const normalized: NormalizedSkuImageRow[] = [];
  const errors: ImportIssue[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rawSku = getAliasedValue(row, skuAliases);
    const sku = normalizeSkuForMatching(rawSku);
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
      rawData: row
    });
  });

  return { normalized, errors };
}

function sameMapping(mapping: Pick<SkuImageMapping, "imageUrl">, row: NormalizedSkuImageRow) {
  return mapping.imageUrl === row.imageUrl;
}

export function planSkuMappingImport(
  existingMappings: Array<Pick<SkuImageMapping, "sku" | "imageUrl">>,
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

function findAccountForRow(accounts: SkuMappingAccountRef[], selectedAccount: SkuMappingAccountRef, row: NormalizedSkuImageRow, importAllAccounts: boolean) {
  if (!importAllAccounts) {
    return selectedAccount;
  }

  if (!row.accountName) {
    return selectedAccount;
  }

  const requested = row.accountName.toLowerCase();
  return accounts.find((account) => account.name.toLowerCase() === requested || account.code.toLowerCase() === requested) ?? null;
}

export function planAccountSkuMappingImport(
  existingMappings: Array<Pick<SkuImageMapping, "accountId" | "sku" | "imageUrl">>,
  rows: RawImportRow[],
  accounts: SkuMappingAccountRef[],
  selectedAccount: SkuMappingAccountRef,
  importAllAccounts: boolean
): AccountSkuMappingImportPlan {
  const { normalized, errors } = normalizeSkuImageRows(rows);
  const existingByKey = new Map(existingMappings.map((mapping) => [`${mapping.accountId}:${mapping.sku}`, mapping]));

  return normalized.reduce<AccountSkuMappingImportPlan>(
    (plan, row) => {
      const account = findAccountForRow(accounts, selectedAccount, row, importAllAccounts);

      if (!account) {
        plan.errors.push({
          rowNumber: row.rowNumber,
          issueType: "UNKNOWN_ACCOUNT",
          message: `No account matched "${row.accountName}".`,
          rawData: row.rawData
        });
        return plan;
      }

      const resolvedRow: ResolvedSkuImageRow = {
        ...row,
        accountId: account.id,
        resolvedAccountName: account.name
      };
      const existing = existingByKey.get(`${account.id}:${row.sku}`);

      if (!existing) {
        plan.created.push(resolvedRow);
      } else if (sameMapping(existing, resolvedRow)) {
        plan.unchanged.push(resolvedRow);
      } else {
        plan.updated.push(resolvedRow);
      }

      return plan;
    },
    { created: [], updated: [], unchanged: [], errors }
  );
}

export async function importSkuMappingsFromRows(input: {
  rows: RawImportRow[];
  fileName: string;
  selectedAccount: Account;
  importAllAccounts?: boolean;
  user: User;
  request?: RequestMeta;
}) {
  const importAllAccounts = input.importAllAccounts === true;
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.selectedAccount.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "SKU_IMAGE",
      status: "UPLOADED",
      totalRows: input.rows.length,
      notes: JSON.stringify({
        selectedAccount: {
          id: input.selectedAccount.id,
          name: input.selectedAccount.name,
          code: input.selectedAccount.code
        },
        importAllAccounts
      })
    }
  });

  const accounts = await prisma.account.findMany();
  const accountIds = importAllAccounts ? accounts.map((account) => account.id) : [input.selectedAccount.id];
  const existingMappings = await prisma.skuImageMapping.findMany({
    where: {
      accountId: { in: accountIds }
    }
  });
  const plan = planAccountSkuMappingImport(existingMappings, input.rows, accounts, input.selectedAccount, importAllAccounts);

  for (const issue of plan.errors) {
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

  for (const row of plan.created) {
    await prisma.skuImageMapping.create({
      data: {
        accountId: row.accountId,
        sku: row.sku,
        imageUrl: row.imageUrl,
        active: true,
        source: input.fileName,
        lastImportedAt: new Date(),
        imageHealth: "UNKNOWN",
        cacheStatus: "NOT_CACHED"
      }
    });
  }

  for (const row of plan.updated) {
    await prisma.skuImageMapping.update({
      where: {
        accountId_sku: {
          accountId: row.accountId,
          sku: row.sku
        }
      },
      data: {
        imageUrl: row.imageUrl,
        source: input.fileName,
        lastImportedAt: new Date(),
        imageHealth: "UNKNOWN",
        cacheStatus: "RECHECK_NEEDED",
        cacheOriginalImageUrl: null,
        cacheError: null
      }
    });
  }

  const errorRows = plan.errors.length;

  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: errorRows > 0 ? "REVIEWED" : "IMPORTED",
      createdRows: plan.created.length,
      updatedRows: plan.updated.length,
      skippedRows: plan.unchanged.length,
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
      selectedAccount: input.selectedAccount.name,
      importAllAccounts,
      createdRows: plan.created.length,
      updatedRows: plan.updated.length,
      skippedRows: plan.unchanged.length,
      errorRows
    },
    request: input.request
  });

  return updatedBatch;
}
