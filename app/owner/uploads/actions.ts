"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadBatchSchema } from "@/lib/validators";

export async function createUploadBatchAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const file = formData.get("labelPdf");
  const filename = file instanceof File ? file.name : "";

  const parsed = uploadBatchSchema.safeParse({ filename });

  if (!parsed.success) {
    redirect("/owner/uploads/new?error=invalid-file");
  }

  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: account.id,
      uploadedById: user.id,
      filename: parsed.data.filename,
      status: "UPLOADED",
      notes: "PDF parser placeholder: file is not stored yet. Future parser will extract labels into review rows."
    }
  });

  revalidatePath("/owner");
  redirect(`/owner/uploads/${batch.id}/review`);
}
