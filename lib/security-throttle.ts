import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type Client = PrismaClient | Prisma.TransactionClient;
const hash = (scope: string, identity: string) => createHash("sha256").update(`${scope}\0${identity.normalize("NFKC").toLowerCase()}`).digest("hex");

export async function consumeSecurityAttempt(input: { scope: string; identity: string; limit: number; windowMs: number; blockMs: number }, client: Client = prisma) {
  const keyHash = hash(input.scope, input.identity);
  for (let retry = 0; retry < 6; retry++) {
    const now = new Date();
    const existing = await client.securityThrottle.findUnique({ where: { keyHash } });
    if (existing?.blockedUntil && existing.blockedUntil > now) return { allowed: false, retryAt: existing.blockedUntil, keyHash };
    const expired = !existing || now.getTime() - existing.windowStart.getTime() >= input.windowMs;
    const attempts = expired ? 1 : (existing?.attempts ?? 0) + 1;
    const blockedUntil = attempts > input.limit ? new Date(now.getTime() + input.blockMs) : null;
    if (!existing) {
      try {
        await client.securityThrottle.create({ data: { keyHash, scope: input.scope, attempts, windowStart: now, blockedUntil, lastAttemptAt: now } });
        return { allowed: !blockedUntil, retryAt: blockedUntil, keyHash };
      } catch {
        continue;
      }
    }
    const updated = await client.securityThrottle.updateMany({
      where: { keyHash, attempts: existing.attempts, windowStart: existing.windowStart },
      data: { scope: input.scope, attempts, windowStart: expired ? now : existing.windowStart, blockedUntil, lastAttemptAt: now }
    });
    if (updated.count === 1) return { allowed: !blockedUntil, retryAt: blockedUntil, keyHash };
  }
  return { allowed: false, retryAt: new Date(Date.now() + Math.min(input.blockMs, 60_000)), keyHash };
}

export async function clearSecurityAttempt(scope: string, identity: string, client: Client = prisma) {
  await client.securityThrottle.deleteMany({ where: { keyHash: hash(scope, identity) } });
}

export async function consumeSecurityDimensions(input:{scope:string;username:string;ipAddress?:string;usernameLimit:number;ipLimit:number;windowMs:number;blockMs:number},client:Client=prisma){
 const username=await consumeSecurityAttempt({scope:`${input.scope}:username`,identity:input.username,limit:input.usernameLimit,windowMs:input.windowMs,blockMs:input.blockMs},client),ipAttempt=input.ipAddress?await consumeSecurityAttempt({scope:`${input.scope}:ip`,identity:input.ipAddress,limit:input.ipLimit,windowMs:input.windowMs,blockMs:input.blockMs},client):null;return{allowed:username.allowed&&(ipAttempt?.allowed??true),keyHashes:[username.keyHash,...(ipAttempt?[ipAttempt.keyHash]:[])],usernameIdentity:input.username,ipIdentity:input.ipAddress??null};
}

export async function clearSecurityDimensions(scope:string,username:string,client:Client=prisma){await clearSecurityAttempt(`${scope}:username`,username,client);}

export async function pruneSecurityThrottles(before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), client: Client = prisma) {
  return client.securityThrottle.deleteMany({ where: { lastAttemptAt: { lt: before }, OR: [{ blockedUntil: null }, { blockedUntil: { lt: new Date() } }] } });
}
