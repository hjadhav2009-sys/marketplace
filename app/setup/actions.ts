"use server";

import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import {
  canUseFirstRunSetup,
  isValidSetupAccountCode,
  isValidSetupUsername,
  normalizeSetupAccountCode,
  normalizeSetupUsername,
  validateFirstRunSetupPassword
} from "@/lib/setup";

type SetupResult =
  | {
      status: "created";
      accountId: string;
      accountName: string;
      userId: string;
      username: string;
    }
  | {
      status: "blocked";
    };

function readSetupForm(formData: FormData) {
  const accountName = String(formData.get("accountName") ?? "").trim();
  const accountCode = normalizeSetupAccountCode(String(formData.get("accountCode") ?? ""));
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const username = normalizeSetupUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (
    !accountName ||
    !ownerName ||
    !isValidSetupAccountCode(accountCode) ||
    !isValidSetupUsername(username) ||
    !validateFirstRunSetupPassword(password, confirmPassword).valid
  ) {
    return null;
  }

  return {
    accountName,
    accountCode,
    ownerName,
    username,
    password
  };
}

export async function createFirstOwnerAction(formData: FormData) {
  const request = await getRequestMeta();
  const parsed = readSetupForm(formData);

  if (!parsed) {
    redirect("/setup?error=invalid");
  }

  let result: SetupResult;

  try {
    result = await prisma.$transaction(async (tx) => {
      const existingUserCount = await tx.user.count();

      if (!canUseFirstRunSetup(existingUserCount)) {
        return { status: "blocked" };
      }

      const account = await tx.account.create({
        data: {
          name: parsed.accountName,
          code: parsed.accountCode,
          companyName: "Sullery",
          marketplace: "FLIPKART",
          accountDisplayName: parsed.accountName,
          accountCode: parsed.accountCode
        }
      });

      const user = await tx.user.create({
        data: {
          name: parsed.ownerName,
          username: parsed.username,
          passwordHash: hashPassword(parsed.password),
          role: "OWNER",
          active: true,
          mustChangePassword: false,
          accountId: account.id
        }
      });

      return {
        status: "created",
        accountId: account.id,
        accountName: account.name,
        userId: user.id,
        username: user.username
      };
    });
  } catch {
    redirect("/setup?error=create");
  }

  if (result.status === "blocked") {
    redirect("/login");
  }

  try {
    await recordAuditLog({
      userId: result.userId,
      accountId: result.accountId,
      action: "FIRST_RUN_SETUP_COMPLETED",
      entityType: "User",
      entityId: result.userId,
      metadata: {
        username: result.username,
        accountName: result.accountName
      },
      request
    });
  } catch {
    // First-run setup must not fail if audit logging is temporarily unavailable.
  }

  redirect("/login?setup=1");
}
