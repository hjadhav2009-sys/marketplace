"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { importSkuMappingsFromRows } from "@/lib/import/sku-mappings";
import { parseSpreadsheetRows } from "@/lib/import/files";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { accountSelectionSchema, skuImageImportFileSchema } from "@/lib/validators";

export async function importSkuMappingFileAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const request = await getRequestMeta();
  const file = formData.get("mappingFile");
  const accountParsed = accountSelectionSchema.safeParse({
    accountId: formData.get("accountId")
  });

  if (!accountParsed.success || !(file instanceof File)) {
    redirect("/owner/sku-mappings/import?error=invalid");
  }

  const fileParsed = skuImageImportFileSchema.safeParse({
    filename: file.name
  });

  if (!fileParsed.success) {
    redirect("/owner/sku-mappings/import?error=file");
  }

  const selectedAccount = await prisma.account.findUnique({
    where: { id: accountParsed.data.accountId }
  });

  if (!selectedAccount) {
    redirect("/owner/sku-mappings/import?error=account");
  }

  try {
    const rows = await parseSpreadsheetRows(file);
    const batch = await importSkuMappingsFromRows({
      rows,
      fileName: file.name,
      selectedAccount,
      user,
      request
    });

    redirect(`/owner/sku-mappings/import?batchId=${batch.id}`);
  } catch {
    redirect("/owner/sku-mappings/import?error=parse");
  }
}
