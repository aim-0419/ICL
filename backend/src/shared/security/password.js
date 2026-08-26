/**
 * [비밀번호 보관 담당]
 *
 * 비밀번호를 원래 글자 그대로 저장하지 않고,
 * 되돌릴 수 없는 형태로 바꿔서 저장합니다.
 * 데이터베이스가 유출되더라도 비밀번호를 알아낼 수 없게 하기 위해서입니다.
 *
 * 로그인할 때는 입력한 비밀번호를 같은 방식으로 바꿔 저장된 값과 비교합니다.
 * 비교할 때 걸리는 시간이 항상 같도록 처리해, 시간 차이로 정답을 유추하는 공격을 막습니다.
 */
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
