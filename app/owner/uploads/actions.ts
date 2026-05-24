"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { uploadBatchSchema } from "@/lib/validators";

export async function createUploadBatchAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const file = formData.get("labelPdf");
  const filename = file instanceof File ? file.name : "";

  const parsed = uploadBatchSchema.safeParse({ filename });

  if (!parsed.success) {
    redirect("/owner/uploads/new?error=invalid-file");
  }

  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: account.id,
      createdByUserId: user.id,
      fileName: parsed.data.filename,
      importType: "ORDER_LABEL",
      status: "UPLOADED",
      notes: "PDF parser placeholder: file is not stored yet. Future parser will extract labels into review rows."
    }
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "BATCH_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: { fileName: parsed.data.filename, source: "placeholder-upload" },
    request
  });

  revalidatePath("/owner");
  redirect(`/owner/uploads/${batch.id}/review`);
}
