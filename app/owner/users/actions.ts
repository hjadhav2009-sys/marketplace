"use server";

import type { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import {
  canChangeUserRole,
  canDeactivateUser,
  shouldCloseSessionsAfterPasswordReset,
  validateWorkerPassword
} from "@/lib/user-management";

function parseRole(value: FormDataEntryValue | null): Role | null {
  return value === "OWNER" || value === "PICKER" || value === "PACKER" ? value : null;
}

function parseUserForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const role = parseRole(formData.get("role"));
  const accountId = String(formData.get("accountId") ?? "").trim() || null;

  if (!name || !username || !role || !/^[a-z0-9._-]{3,40}$/.test(username)) {
    return null;
  }

  if (role !== "OWNER" && !accountId) {
    return null;
  }

  return {
    name,
    username,
    role,
    accountId
  };
}

async function assertAccountExists(accountId: string | null) {
  if (!accountId) {
    return;
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId }
  });

  if (!account) {
    redirect("/owner/users?error=account");
  }
}

export async function createUserAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const parsed = parseUserForm(formData);
  const password = String(formData.get("password") ?? "");

  if (!parsed) {
    redirect("/owner/users?error=invalid");
  }

  const passwordResult = validateWorkerPassword(password);

  if (!passwordResult.valid) {
    redirect("/owner/users?error=password");
  }

  await assertAccountExists(parsed.accountId);

  let createdUser;

  try {
    createdUser = await prisma.user.create({
      data: {
        name: parsed.name,
        username: parsed.username,
        role: parsed.role,
        accountId: parsed.accountId,
        passwordHash: hashPassword(password),
        mustChangePassword: true
      }
    });
  } catch {
    redirect("/owner/users?error=unique");
  }

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: createdUser.id,
    metadata: { username: createdUser.username, role: createdUser.role, accountId: createdUser.accountId },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?created=1");
}

export async function updateUserAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");
  const parsed = parseUserForm(formData);

  if (!userId || !parsed) {
    redirect("/owner/users?error=invalid");
  }

  await assertAccountExists(parsed.accountId);

  const target = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!target) {
    redirect("/owner/users?error=invalid");
  }

  if (!canChangeUserRole(owner.id, target.id, target.role, parsed.role)) {
    redirect("/owner/users?error=self-owner");
  }

  let updatedUser;

  try {
    updatedUser = await prisma.user.update({
      where: { id: target.id },
      data: {
        name: parsed.name,
        username: parsed.username,
        role: parsed.role,
        accountId: parsed.accountId
      }
    });
  } catch {
    redirect("/owner/users?error=unique");
  }

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: target.id,
    metadata: { username: updatedUser.username, role: updatedUser.role, accountId: updatedUser.accountId },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?updated=1");
}

export async function changeUserPasswordAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordResult = validateWorkerPassword(password);

  if (!userId || !passwordResult.valid) {
    redirect("/owner/users?error=password");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    redirect("/owner/users?error=invalid");
  }

  const sessionsClosed = shouldCloseSessionsAfterPasswordReset(owner.id, user.id);

  if (sessionsClosed) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(password),
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null
        }
      }),
      prisma.userDeviceSession.updateMany({
        where: {
          userId: user.id,
          active: true
        },
        data: {
          active: false,
          lastSeenAt: new Date()
        }
      })
    ]);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null
      }
    });
  }

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "USER_PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username, changedByOwner: true, mustChangePassword: sessionsClosed, sessionsClosed },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?password=1");
}

export async function deactivateUserAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");

  if (!userId || !canDeactivateUser(owner.id, userId)) {
    redirect("/owner/users?error=self-deactivate");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    redirect("/owner/users?error=invalid");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { active: false }
    }),
    prisma.userDeviceSession.updateMany({
      where: { userId: user.id },
      data: { active: false, lastSeenAt: new Date() }
    })
  ]);

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "USER_DEACTIVATED",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?deactivated=1");
}

export async function reactivateUserAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    redirect("/owner/users?error=invalid");
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!existingUser) {
    redirect("/owner/users?error=invalid");
  }

  const user = await prisma.user.update({
    where: { id: existingUser.id },
    data: { active: true }
  });

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "USER_REACTIVATED",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?reactivated=1");
}

export async function closeUserSessionsAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");

  if (!userId || userId === owner.id) {
    redirect("/owner/users?error=self-session");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    redirect("/owner/users?error=invalid");
  }

  await prisma.userDeviceSession.updateMany({
    where: { userId: user.id },
    data: {
      active: false,
      lastSeenAt: new Date()
    }
  });

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "USER_SESSIONS_CLOSED",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?sessions=1");
}
