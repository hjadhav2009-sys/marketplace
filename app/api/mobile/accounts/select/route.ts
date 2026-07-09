import { setSelectedAccount } from "@/lib/auth";
import { readMobileJsonBody, resolveMobileAccount, getMobileUser, mobileJson, serializeMobileUser } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await getMobileUser();

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const account = await resolveMobileAccount(auth.user, body.data.accountId);

  if (!account.ok) {
    return account.response;
  }

  const updatedUser = await prisma.user.update({
    where: { id: auth.user.id },
    data: { accountId: account.account.id }
  });
  await setSelectedAccount(account.account.id);

  return mobileJson({
    ok: true,
    accountId: account.account.id,
    user: await serializeMobileUser(updatedUser)
  });
}
