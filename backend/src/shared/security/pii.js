import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";

// 파일 역할: 이름, 이메일, 전화번호, 출생연도 같은 개인정보를 암호화하고 검색용 해시를 생성합니다.
// 운영 DB에는 원문 개인정보를 저장하지 않고, 화면 표시가 필요할 때만 서버에서 복호화합니다.

const ENCRYPTION_PREFIX = "enc:v1:";
const HASH_PREFIX = "pii:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let warnedAboutDevKey = false;

// 함수 역할: 개발 환경에서만 사용할 임시 암호화 키 재료를 만듭니다.
function getDevelopmentFallbackKeyMaterial() {
  return `dev:${env.dbName}:${env.dbPassword || "local"}`;
}

// 함수 역할: 운영 키를 우선 사용하고, 개발 환경에서는 임시 키로만 동작하게 제한합니다.
function getKeyMaterial() {
  const configured = String(env.piiEncryptionKey || "").trim();
  if (configured) return configured;

  if (env.nodeEnv === "production") {
    throw new Error("PII_ENCRYPTION_KEY 값이 설정되지 않았습니다.");
  }

  if (!warnedAboutDevKey) {
    console.warn("[security] PII_ENCRYPTION_KEY is not set. Using a development-only fallback key.");
    warnedAboutDevKey = true;
  }

  return getDevelopmentFallbackKeyMaterial();
}

// 함수 역할: 과거 키로 암호화된 기존 데이터를 읽기 위한 후보 키 목록을 구성합니다.
function getLegacyKeyMaterials() {
  const current = getKeyMaterial();
  const configuredLegacyKeys = String(env.piiEncryptionLegacyKeys || "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates = [...configuredLegacyKeys, getDevelopmentFallbackKeyMaterial()];
  return [...new Set(candidates)].filter((value) => value && value !== current);
}

// 함수 역할: AES-256-GCM에 사용할 32바이트 암호화 키를 생성합니다.
function getEncryptionKey(keyMaterial = getKeyMaterial()) {
  return createHash("sha256").update(keyMaterial).digest();
}

// 함수 역할: 이메일/전화번호/이름 검색용 HMAC 해시에 사용할 키를 생성합니다.
function getHashKey() {
  return createHash("sha256").update(`hash:${getKeyMaterial()}`).digest();
}

// 함수 역할: 지정한 키 재료로 암호문을 복호화하고, 실패 시 null을 반환합니다.
function decryptPiiWithKeyMaterial(text, keyMaterial) {
  const parts = text.split(":");
  if (parts.length !== 5) return null;

  try {
    const [, , ivText, tagText, ciphertextText] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(keyMaterial),
      Buffer.from(ivText, "base64url"),
      { authTagLength: AUTH_TAG_LENGTH }
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// 함수 역할: 값이 현재 개인정보 암호문 포맷인지 확인합니다.
export function isEncryptedPii(value) {
  return String(value || "").startsWith(ENCRYPTION_PREFIX);
}

// 함수 역할: 개인정보 문자열을 AES-256-GCM으로 암호화해 DB 저장용 문자열로 변환합니다.
export function encryptPii(value) {
  if (value === null || typeof value === "undefined") return null;
  const text = String(value);
  if (!text) return "";
  if (isEncryptedPii(text)) return text;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX.slice(0, -1),
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

// 함수 역할: 현재 키로 먼저 복호화하고, 실패하면 legacy 키 후보로 기존 암호문을 복구합니다.
export function decryptPii(value) {
  if (value === null || typeof value === "undefined") return "";
  const text = String(value);
  if (!text || !isEncryptedPii(text)) return text;

  const primaryValue = decryptPiiWithKeyMaterial(text, getKeyMaterial());
  if (primaryValue !== null) return primaryValue;

  for (const legacyKeyMaterial of getLegacyKeyMaterials()) {
    const legacyValue = decryptPiiWithKeyMaterial(text, legacyKeyMaterial);
    if (legacyValue !== null) return legacyValue;
  }

  return "";
}

// 함수 역할: 평문 또는 legacy 키로 암호화된 값을 현재 키 기준으로 재암호화해야 하는지 판단합니다.
export function shouldReencryptPii(value) {
  const text = String(value || "");
  if (!text) return false;
  if (!isEncryptedPii(text)) return true;
  return decryptPiiWithKeyMaterial(text, getKeyMaterial()) === null && decryptPii(text) !== "";
}

// 함수 역할: 이메일 비교/검색이 안정적으로 되도록 소문자와 공백 정리를 적용합니다.
export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// 함수 역할: 전화번호 비교/검색이 안정적으로 되도록 숫자만 남깁니다.
export function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

// 함수 역할: 이름 앞뒤 공백을 제거해 저장/검색 기준을 통일합니다.
export function normalizeName(value) {
  return String(value || "").trim();
}

// 함수 역할: 출생연도를 4자리 유효 연도 문자열로 정규화합니다.
export function normalizeBirthYear(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const year = Number.parseInt(text, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) return "";
  return String(year);
}

// 함수 역할: 복호화 없이 중복 확인과 조회가 가능하도록 개인정보 검색용 HMAC 해시를 만듭니다.
export function hashPii(value, namespace = "default") {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const digest = createHmac("sha256", getHashKey())
    .update(`${namespace}:${normalized}`)
    .digest("hex");
  return `${HASH_PREFIX}${digest}`;
}

// 함수 역할: 이메일 전용 검색 해시를 생성합니다.
export function emailHash(value) {
  return hashPii(normalizeEmail(value), "email");
}

// 함수 역할: 전화번호 전용 검색 해시를 생성합니다.
export function phoneHash(value) {
  return hashPii(normalizePhone(value), "phone");
}

// 함수 역할: 이름 전용 검색 해시를 생성합니다.
export function nameHash(value) {
  return hashPii(normalizeName(value), "name");
}

// 함수 역할: DB에서 읽은 회원 row의 개인정보 필드를 화면/API 응답용 값으로 복호화합니다.
export function decryptUserRow(row) {
  if (!row) return null;
  const birthYearValue = row.birthYearEncrypted ?? row.birth_year_encrypted ?? row.birthYear;
  const birthYear = normalizeBirthYear(decryptPii(birthYearValue) || birthYearValue) || null;
  const safeRow = { ...row };
  delete safeRow.birthYearEncrypted;
  delete safeRow.birth_year_encrypted;
  return {
    ...safeRow,
    name: decryptPii(row.name),
    email: normalizeEmail(decryptPii(row.email)),
    phone: normalizePhone(decryptPii(row.phone)),
    birthYear: birthYear ? Number(birthYear) : null,
  };
}

// 함수 역할: DB에서 읽은 주문 row의 주문자 이메일을 API 응답용 값으로 복호화합니다.
export function decryptOrderRow(row) {
  if (!row) return null;
  return {
    ...row,
    customerEmail: normalizeEmail(decryptPii(row.customerEmail ?? row.customer_email)),
  };
}

// 함수 역할: 회원 개인정보 저장 시 암호문과 검색용 해시를 한 번에 생성합니다.
export function encryptedUserValues({ name, email, phone, birthYear }) {
  const safeName = normalizeName(name);
  const safeEmail = normalizeEmail(email);
  const safePhone = normalizePhone(phone);
  const safeBirthYear = normalizeBirthYear(birthYear);

  return {
    encryptedName: encryptPii(safeName),
    encryptedEmail: encryptPii(safeEmail),
    encryptedPhone: safePhone ? encryptPii(safePhone) : null,
    encryptedBirthYear: safeBirthYear ? encryptPii(safeBirthYear) : null,
    emailHash: emailHash(safeEmail),
    phoneHash: phoneHash(safePhone),
    nameHash: nameHash(safeName),
  };
}

// 결제/환불 payload에서 PII 필드를 제거합니다.
export function scrubStoredPii(payload) {
  if (!payload || typeof payload !== "object") return {};
  const next = { ...payload };
  delete next.customerEmail;
  delete next.customerBirthYear;
  delete next.birthYear;
  if (next.customer && typeof next.customer === "object") {
    next.customer = { ...next.customer };
    delete next.customer.email;
    delete next.customer.birthYear;
  }
  return next;
}
