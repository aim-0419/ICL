import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";

const ENCRYPTION_PREFIX = "enc:v1:";
const HASH_PREFIX = "pii:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let warnedAboutDevKey = false;

function getDevelopmentFallbackKeyMaterial() {
  return `dev:${env.dbName}:${env.dbPassword || "local"}`;
}

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

function getLegacyKeyMaterials() {
  const current = getKeyMaterial();
  const configuredLegacyKeys = String(env.piiEncryptionLegacyKeys || "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates = [...configuredLegacyKeys, getDevelopmentFallbackKeyMaterial()];
  return [...new Set(candidates)].filter((value) => value && value !== current);
}

function getEncryptionKey(keyMaterial = getKeyMaterial()) {
  return createHash("sha256").update(keyMaterial).digest();
}

function getHashKey() {
  return createHash("sha256").update(`hash:${getKeyMaterial()}`).digest();
}

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

export function isEncryptedPii(value) {
  return String(value || "").startsWith(ENCRYPTION_PREFIX);
}

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

export function shouldReencryptPii(value) {
  const text = String(value || "");
  if (!text) return false;
  if (!isEncryptedPii(text)) return true;
  return decryptPiiWithKeyMaterial(text, getKeyMaterial()) === null && decryptPii(text) !== "";
}

export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

export function normalizeName(value) {
  return String(value || "").trim();
}

export function normalizeBirthYear(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const year = Number.parseInt(text, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) return "";
  return String(year);
}

export function hashPii(value, namespace = "default") {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const digest = createHmac("sha256", getHashKey())
    .update(`${namespace}:${normalized}`)
    .digest("hex");
  return `${HASH_PREFIX}${digest}`;
}

export function emailHash(value) {
  return hashPii(normalizeEmail(value), "email");
}

export function phoneHash(value) {
  return hashPii(normalizePhone(value), "phone");
}

export function nameHash(value) {
  return hashPii(normalizeName(value), "name");
}

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

export function decryptOrderRow(row) {
  if (!row) return null;
  return {
    ...row,
    customerEmail: normalizeEmail(decryptPii(row.customerEmail ?? row.customer_email)),
  };
}

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
