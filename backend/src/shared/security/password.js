import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = "scrypt";
const HASH_VERSION = "v1";
const KEY_LENGTH = 64;

export function isPasswordHash(value) {
  const text = String(value || "");
  return text.startsWith(`${HASH_PREFIX}$${HASH_VERSION}$`);
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scrypt(String(password || ""), salt, KEY_LENGTH);
  return `${HASH_PREFIX}$${HASH_VERSION}$${salt}$${Buffer.from(derivedKey).toString("base64url")}`;
}

export async function verifyPassword(password, storedPassword) {
  const stored = String(storedPassword || "");
  const candidate = String(password || "");

  if (!isPasswordHash(stored)) {
    return stored === candidate;
  }

  const [, version, salt, expectedHash] = stored.split("$");
  if (version !== HASH_VERSION || !salt || !expectedHash) return false;

  let expected;
  try {
    expected = Buffer.from(expectedHash, "base64url");
  } catch {
    return false;
  }

  if (!expected.length) return false;

  const actual = await scrypt(candidate, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
