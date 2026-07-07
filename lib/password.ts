import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

export function legacySha256PasswordHash(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS).toString("base64url");
  return `${SCRYPT_PREFIX}$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt}$${key}`;
}

export function isLegacyPasswordHash(passwordHash: string) {
  return /^[a-f0-9]{64}$/i.test(passwordHash);
}

export function passwordHashNeedsUpgrade(passwordHash: string) {
  return isLegacyPasswordHash(passwordHash) || !passwordHash.startsWith(`${SCRYPT_PREFIX}$`);
}

function verifyScryptPassword(password: string, passwordHash: string) {
  const [prefix, nText, rText, pText, salt, expectedKey] = passwordHash.split("$");

  if (prefix !== SCRYPT_PREFIX || !salt || !expectedKey) {
    return false;
  }

  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 16_384 || r <= 0 || p <= 0) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, SCRYPT_KEY_LENGTH, { N, r, p, maxmem: 64 * 1024 * 1024 }).toString("base64url"));
  const expected = Buffer.from(expectedKey);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyPassword(password: string, passwordHash: string) {
  if (isLegacyPasswordHash(passwordHash)) {
    return legacySha256PasswordHash(password) === passwordHash;
  }

  return verifyScryptPassword(password, passwordHash);
}
