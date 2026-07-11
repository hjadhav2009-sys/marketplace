"use server";

import type { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { normalizeUsername } from "@/lib/auth-helpers";
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
  const username = normalizeUsername(formData.get("username"));
  const role = parseRole(formData.get("role"));
  const accountIds = formData
    .getAll("accountIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const legacyAccountId = String(formData.get("accountId") ?? "").trim();
  const uniqueAccountIds = [...new Set([...accountIds, legacyAccountId].filter(Boolean))];
  const active = formData.getAll("active").includes("on");
  const canPick = role === "OWNER" || role === "PICKER" || formData.getAll("canPick").includes("on");
  const canPack = role === "OWNER" || role === "PACKER" || formData.getAll("canPack").includes("on");
  const canReportProblem = role === "OWNER" || formData.getAll("canReportProblem").includes("on");
  const canMark = role === "OWNER" || formData.getAll("canMark").includes("on");
  const canAssemble = role === "OWNER" || formData.getAll("canAssemble").includes("on");
  const canManageMarkingLibrary = role === "OWNER" || formData.getAll("canManageMarkingLibrary").includes("on");
  const canManageProcessRules = role === "OWNER" || formData.getAll("canManageProcessRules").includes("on");
  const canViewAllWork = role === "OWNER" || formData.getAll("canViewAllWork").includes("on");
  const canViewConsignments = role === "OWNER" || formData.getAll("canViewConsignments").includes("on");
  const canImportConsignments = role === "OWNER" || formData.getAll("canImportConsignments").includes("on");
  const canManageConsignments = role === "OWNER" || formData.getAll("canManageConsignments").includes("on");

  if (!name || !username || !role || !/^[a-z0-9._-]{3,40}$/.test(username)) {
    return null;
  }

  if (role !== "OWNER" && active && uniqueAccountIds.length === 0) {
    return null;
  }

  return {
    name,
    username,
    role,
    active,
    canPick,
    canPack,
    canReportProblem,
    canMark,
    canAssemble,
    canManageMarkingLibrary,
    canManageProcessRules,
    canViewAllWork,
    canViewConsignments,
    canImportConsignments,
    canManageConsignments,
    accountIds: uniqueAccountIds,
    accountId: uniqueAccountIds[0] ?? null
  };
}

async function assertAccountsExist(accountIds: string[]) {
  if (accountIds.length === 0) {
    return;
  }

  const count = await prisma.account.count({
    where: {
      id: { in: accountIds },
      active: true
    }
  });

  if (count !== accountIds.length) {
    redirect("/owner/users?error=account");
  }
}

async function assertCanLeaveOwnerRole(target: { id: string; role: Role; active: boolean }, nextRole: Role, nextActive: boolean) {
  if (target.role !== "OWNER" || (nextRole === "OWNER" && nextActive)) {
    return;
  }

  const activeOwners = await prisma.user.count({
    where: {
      role: "OWNER",
      active: true,
      id: { not: target.id }
    }
  });

  if (activeOwners === 0) {
    redirect("/owner/users?error=last-owner");
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

  await assertAccountsExist(parsed.accountIds);

  let createdUser;

  try {
    createdUser = await prisma.user.create({
      data: {
        name: parsed.name,
        username: parsed.username,
        role: parsed.role,
        canPick: parsed.canPick,
        canPack: parsed.canPack,
        canReportProblem: parsed.canReportProblem,
        canMark: parsed.canMark,
        canAssemble: parsed.canAssemble,
        canManageMarkingLibrary: parsed.canManageMarkingLibrary,
        canManageProcessRules: parsed.canManageProcessRules,
        canViewAllWork: parsed.canViewAllWork,
        canViewConsignments: parsed.canViewConsignments,
        canImportConsignments: parsed.canImportConsignments,
        canManageConsignments: parsed.canManageConsignments,
        accountId: parsed.accountId,
        active: parsed.active,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        assignedAccounts: {
          connect: parsed.accountIds.map((id) => ({ id }))
        }
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

  await assertAccountsExist(parsed.accountIds);

  const target = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!target) {
    redirect("/owner/users?error=invalid");
  }

  if (!canChangeUserRole(owner.id, target.id, target.role, parsed.role)) {
    redirect("/owner/users?error=self-owner");
  }

  await assertCanLeaveOwnerRole(target, parsed.role, parsed.active);

  let updatedUser;

  try {
    updatedUser = await prisma.user.update({
      where: { id: target.id },
      data: {
        name: parsed.name,
        username: parsed.username,
        role: parsed.role,
        canPick: parsed.canPick,
        canPack: parsed.canPack,
        canReportProblem: parsed.canReportProblem,
        canMark: parsed.canMark,
        canAssemble: parsed.canAssemble,
        canManageMarkingLibrary: parsed.canManageMarkingLibrary,
        canManageProcessRules: parsed.canManageProcessRules,
        canViewAllWork: parsed.canViewAllWork,
        canViewConsignments: parsed.canViewConsignments,
        canImportConsignments: parsed.canImportConsignments,
        canManageConsignments: parsed.canManageConsignments,
        accountId: parsed.accountId,
        active: parsed.active,
        assignedAccounts: {
          set: parsed.accountIds.map((id) => ({ id }))
        }
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

  const permissionFields = ["canPick", "canMark", "canAssemble", "canPack", "canReportProblem", "canManageMarkingLibrary", "canManageProcessRules", "canViewAllWork", "canViewConsignments", "canImportConsignments", "canManageConsignments"] as const;
  const changedPermissions = permissionFields.filter((field) => target[field] !== updatedUser[field]);
  if (changedPermissions.length > 0) {
    await recordAuditLog({
      userId: owner.id,
      accountId: account.id,
      action: "USER_WORK_PERMISSION_CHANGED",
      entityType: "User",
      entityId: target.id,
      metadata: { changedPermissions, enabled: changedPermissions.filter((field) => updatedUser[field]) },
      request
    });
  }

  revalidatePath("/owner/users");
  redirect("/owner/users?updated=1");
}

export async function changeUserPasswordAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const password = String(formData.get("password") ?? "");
  const mustChangePassword = formData.get("mustChangePassword") === "on";
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
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(password),
          mustChangePassword,
          failedLoginCount: 0,
          lockedUntil: null,
          active: true
        }
      });
      await tx.userDeviceSession.updateMany({
        where: {
          userId: user.id,
          active: true
        },
        data: {
          active: false,
          lastSeenAt: new Date()
        }
      });
      if (requestId) {
        await tx.passwordResetRequest.updateMany({
          where: {
            id: requestId,
            OR: [{ userId: user.id }, { username: user.username }]
          },
          data: {
            status: "HANDLED",
            handledById: owner.id,
            handledAt: new Date(),
            note: "Password reset completed by owner."
          }
        });
      }
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(password),
          mustChangePassword,
          failedLoginCount: 0,
          lockedUntil: null,
          active: true
        }
      });
      if (requestId) {
        await tx.passwordResetRequest.updateMany({
          where: {
            id: requestId,
            OR: [{ userId: user.id }, { username: user.username }]
          },
          data: {
            status: "HANDLED",
            handledById: owner.id,
            handledAt: new Date(),
            note: "Password reset completed by owner."
          }
        });
      }
    });
  }

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "OWNER_PASSWORD_RESET",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username, changedByOwner: true, mustChangePassword, sessionsClosed, requestHandled: Boolean(requestId) },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?password=1");
}

export async function unlockUserAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    redirect("/owner/users?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    redirect("/owner/users?error=invalid");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      active: true
    }
  });

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "OWNER_USER_UNLOCKED",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?unlocked=1");
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

  await assertCanLeaveOwnerRole(user, user.role, false);

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
    action: "OWNER_USER_DEACTIVATED",
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
    action: "OWNER_USER_REACTIVATED",
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
    action: "OWNER_USER_SESSIONS_CLOSED",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?sessions=1");
}

export async function markPasswordResetRequestHandledAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const requestId = String(formData.get("requestId") ?? "");

  if (!requestId) {
    redirect("/owner/users?error=invalid");
  }

  const resetRequest = await prisma.passwordResetRequest.update({
    where: { id: requestId },
    data: {
      status: "HANDLED",
      handledById: owner.id,
      handledAt: new Date(),
      note: "Marked handled by owner."
    }
  });

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "PASSWORD_RESET_REQUEST_HANDLED",
    entityType: "PasswordResetRequest",
    entityId: resetRequest.id,
    metadata: { username: resetRequest.username },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?requestHandled=1");
}
