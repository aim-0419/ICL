import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

import { ensureInitialized, query, queryOne, withTransaction } from "../src/shared/db/mysql.js";
import { encryptedUserValues, normalizeEmail, normalizePhone } from "../src/shared/security/pii.js";
import { hashPassword } from "../src/shared/security/password.js";

const DEFAULT_MEMBER_FILE = String.raw`C:\Users\eldorado\Downloads\회원목록_20260611_1451.xlsx`;
const DEFAULT_CLASS_FILE = String.raw`C:\Users\eldorado\Downloads\수업목록_2026-06-08.xlsx`;

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function decodeXml(text = "") {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function columnIndex(ref = "") {
  const letters = String(ref).match(/^[A-Z]+/)?.[0] || "";
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function extractXlsx(filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studiomate-xlsx-"));
  const script = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "[System.IO.Compression.ZipFile]::ExtractToDirectory($env:XLSX_PATH, $env:XLSX_TARGET)",
  ].join("; ");
  execFileSync("powershell", ["-NoProfile", "-Command", script], {
    env: { ...process.env, XLSX_PATH: filePath, XLSX_TARGET: dir },
    stdio: "pipe",
  });
  return dir;
}

function readSharedStrings(root) {
  const file = path.join(root, "xl", "sharedStrings.xml");
  if (!fs.existsSync(file)) return [];
  const xml = fs.readFileSync(file, "utf8");
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const parts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    return parts.join("");
  });
}

function readFirstSheetRows(filePath) {
  const root = extractXlsx(filePath);
  try {
    const sharedStrings = readSharedStrings(root);
    const sheetPath = path.join(root, "xl", "worksheets", "sheet1.xml");
    const xml = fs.readFileSync(sheetPath, "utf8");
    return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
      const row = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const ref = attrs.match(/\br="([^"]+)"/)?.[1] || "";
        const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
        const idx = columnIndex(ref);
        let value = "";
        if (type === "s") {
          const sharedIndex = Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? -1);
          value = sharedStrings[sharedIndex] || "";
        } else if (type === "inlineStr") {
          value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
        } else {
          value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "");
        }
        row[idx] = value === "" ? null : value;
      }
      return row;
    }).filter((row) => row.some((value) => value !== null && typeof value !== "undefined" && value !== ""));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function toObjects(rows) {
  const headers = rows[0] || [];
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function clean(value) {
  return String(value ?? "").trim();
}

function createImportKey(scope, row) {
  const normalizedRow = Object.entries(row || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${clean(value)}`)
    .join("|");
  return createHash("sha256").update(`${scope}|${normalizedRow}`).digest("hex");
}

function intValue(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function nullableInt(value) {
  const text = clean(value);
  if (!text || text === "무제한") return null;
  return intValue(text, null);
}

function dateOnly(value) {
  const text = clean(value);
  if (!text) return null;
  const normalized = text
    .replace(/[.]/g, "-")
    .replace(/년|월/g, "-")
    .replace(/일/g, "")
    .replace(/\s+/g, "")
    .replace(/--+/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function dateTime(value) {
  const text = clean(value).replace(/\s*까지\s*$/, "");
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const time = match[4] ? `${match[4].padStart(2, "0")}:${match[5]}:${match[6] || "00"}` : "00:00:00";
  return `${date} ${time}`;
}

function combineDateTime(dateValue, timeValue) {
  const date = dateOnly(dateValue);
  const time = clean(timeValue);
  if (!date || !/^\d{1,2}:\d{2}/.test(time)) return null;
  const [hh, mm, ss = "00"] = time.split(":");
  return `${date} ${hh.padStart(2, "0")}:${mm}:${ss}`;
}

function passType(value) {
  const text = clean(value);
  if (text.includes("개인") || text.includes("프라이빗")) return "personal";
  if (text.includes("듀엣")) return "duet";
  return "group";
}

function passStatus(value) {
  const text = clean(value);
  if (text.includes("정지")) return "paused";
  if (text.includes("환불")) return "refunded";
  if (text.includes("양도") || text.includes("업그레이드")) return "transferred";
  return "active";
}

function memberStatus(rows) {
  const withPass = rows.filter((row) => clean(row["수강권명"]));
  if (!withPass.length) return "inactive";
  const now = Date.now();
  const hasUsable = withPass.some((row) => {
    if (passStatus(row["수강권상태"]) !== "active") return false;
    const expires = dateOnly(row["수강권종료일"]);
    return intValue(row["잔여횟수"], 0) > 0 && (!expires || new Date(`${expires}T23:59:59+09:00`).getTime() >= now);
  });
  return hasUsable ? "active" : "expired";
}

function classType(value) {
  const text = clean(value);
  if (text.includes("프라이빗") || text.includes("개인")) return "private";
  if (text.includes("상담")) return "consulting";
  return "group";
}

function safeLoginId(base) {
  const slug = clean(base).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
  return `studio_${slug || randomBytes(4).toString("hex")}`;
}

async function uniqueLoginId(base) {
  const first = safeLoginId(base);
  let candidate = first;
  let i = 1;
  while (await queryOne(`SELECT id FROM users WHERE login_id = ? LIMIT 1`, [candidate])) {
    candidate = `${first}_${i}`;
    i += 1;
  }
  return candidate;
}

async function findOrCreateUser(row) {
  const name = clean(row["이름"]) || "이름없음";
  const phone = normalizePhone(row["전화번호"]);
  const actualEmail = normalizeEmail(row["이메일"]);
  const fallbackLoginId = safeLoginId(phone || actualEmail || name);
  const email = actualEmail || `${fallbackLoginId}-${randomUUID().slice(0, 8)}@local.invalid`;
  const pii = encryptedUserValues({
    name,
    email,
    phone,
    birthYear: dateOnly(row["생년월일"])?.slice(0, 4) || "",
  });

  const existing = phone
    ? await queryOne(`SELECT id FROM users WHERE phone_hash = ? LIMIT 1`, [pii.phoneHash])
    : actualEmail
      ? await queryOne(`SELECT id FROM users WHERE email_hash = ? LIMIT 1`, [pii.emailHash])
      : await queryOne(`SELECT id FROM users WHERE login_id = ? LIMIT 1`, [fallbackLoginId]);
  if (existing?.id) {
    const emailOwner = actualEmail
      ? await queryOne(`SELECT id FROM users WHERE email_hash = ? LIMIT 1`, [pii.emailHash])
      : null;
    const canUpdateEmail = Boolean(actualEmail && (!emailOwner?.id || String(emailOwner.id) === String(existing.id)));
    await query(
      `UPDATE users
       SET name = ?, phone = COALESCE(?, phone), phone_hash = COALESCE(?, phone_hash),
           email = IF(? = '', email, ?), email_hash = COALESCE(?, email_hash),
           name_hash = ?, points = GREATEST(points, ?)
       WHERE id = ?`,
      [
        pii.encryptedName,
        pii.encryptedPhone,
        pii.phoneHash,
        canUpdateEmail ? actualEmail : "",
        canUpdateEmail ? pii.encryptedEmail : null,
        canUpdateEmail ? pii.emailHash : null,
        pii.nameHash,
        intValue(row["잔여포인트"], 0),
        existing.id,
      ]
    );
    return { id: existing.id, created: false };
  }

  const id = `user-${randomUUID()}`;
  const loginId = await uniqueLoginId(phone || actualEmail || name);
  const password = await hashPassword(`studio-import-${randomUUID()}`);
  await query(
    `INSERT INTO users
      (id, login_id, name, email, email_hash, password, phone, phone_hash, name_hash,
       birth_year_encrypted, points, account_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      id,
      loginId,
      pii.encryptedName,
      pii.encryptedEmail,
      pii.emailHash,
      password,
      pii.encryptedPhone,
      pii.phoneHash,
      pii.nameHash,
      pii.encryptedBirthYear,
      intValue(row["잔여포인트"], 0),
      dateTime(row["등록일"]) || new Date(),
    ]
  );
  return { id, created: true };
}

async function upsertProfile(userId, rows) {
  const first = rows[0] || {};
  await query(
    `INSERT INTO studio_member_profiles
      (user_id, app_connection_status, member_status, gender, birth_date, address, address_detail,
       primary_instructor, registered_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       app_connection_status = VALUES(app_connection_status),
       member_status = VALUES(member_status),
       gender = VALUES(gender),
       birth_date = VALUES(birth_date),
       address = VALUES(address),
       address_detail = VALUES(address_detail),
       primary_instructor = VALUES(primary_instructor),
       registered_at = VALUES(registered_at),
       updated_at = NOW()`,
    [
      userId,
      clean(first["앱연결"]) === "연결" ? "connected" : "not_connected",
      memberStatus(rows),
      clean(first["성별"]) || null,
      dateOnly(first["생년월일"]),
      clean(first["주소"]) || null,
      clean(first["상세주소"]) || null,
      clean(first["담당강사"]) || null,
      dateTime(first["등록일"]),
    ]
  );
}

async function insertMemo(userId, row) {
  const memo = clean(row["메모"]);
  if (!memo) return false;
  const exists = await queryOne(
    `SELECT id FROM studio_member_memos WHERE user_id = ? AND memo = ? LIMIT 1`,
    [userId, memo]
  );
  if (exists) return false;
  await query(
    `INSERT INTO studio_member_memos (id, user_id, author_id, memo, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [randomUUID(), userId, "system", memo]
  );
  return true;
}

async function insertPass(userId, row) {
  const passName = clean(row["수강권명"]);
  if (!passName) return { inserted: false, payment: false };
  const externalImportKey = createImportKey(`studiomate-pass:${userId}`, row);
  const paidAt = dateTime(row["결제일시"]) || dateTime(row["수강권발급일"]) || dateTime(row["수강권시작일"]);
  const existing = await queryOne(
    `SELECT id, external_import_key AS externalImportKey FROM studio_passes
     WHERE external_import_key = ?
        OR (user_id = ? AND pass_name = ? AND total_count = ? AND created_at = ?)
     LIMIT 1`,
    [externalImportKey, userId, passName, intValue(row["전체횟수"], 0), paidAt || "1970-01-01 00:00:00"]
  );
  if (existing?.id) {
    if (!existing.externalImportKey) {
      await query(`UPDATE studio_passes SET external_import_key = ? WHERE id = ?`, [externalImportKey, existing.id]);
    }
    return { inserted: false, payment: false };
  }

  const passId = randomUUID();
  await query(
    `INSERT INTO studio_passes
      (id, user_id, pass_name, pass_type, remaining_count, reservable_count, cancellable_count,
       total_count, expires_at, is_family_pass, status, external_import_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      passId,
      userId,
      passName,
      passType(row["수강권종류"]),
      intValue(row["잔여횟수"], 0),
      intValue(row["예약가능횟수"], 0),
      intValue(row["취소가능횟수"], 0),
      intValue(row["전체횟수"], 0),
      dateTime(row["수강권종료일"]),
      clean(row["패밀리수강권"]).toUpperCase() === "Y" ? 1 : 0,
      passStatus(row["수강권상태"]),
      externalImportKey,
      paidAt || dateTime(row["수강권발급일"]) || new Date(),
      dateTime(row["수강권최종수정일"]) || new Date(),
    ]
  );

  const amount = intValue(row["결제금액"], 0);
  const hasPaymentInfo = clean(row["결제구분"]) || amount || clean(row["결제방법"]) || paidAt;
  if (hasPaymentInfo) {
    await query(
      `INSERT INTO studio_pass_payments
        (id, pass_id, user_id, payment_type, amount, paid_at, payment_method, installment_months, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        randomUUID(),
        passId,
        userId,
        clean(row["결제구분"]) || null,
        amount,
        paidAt,
        clean(row["결제방법"]) || null,
        clean(row["할부개월수"]) || null,
        "StudioMate 엑셀 이관",
      ]
    );
  }
  return { inserted: true, payment: Boolean(hasPaymentInfo) };
}

async function importMembers(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const phone = normalizePhone(row["전화번호"]);
    const email = normalizeEmail(row["이메일"]);
    const key = phone || email || `no-contact:${clean(row["이름"])}:${clean(row["등록일"])}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const stats = { totalRows: rows.length, usersCreated: 0, usersMatched: 0, profiles: 0, passes: 0, payments: 0, memos: 0 };
  for (const groupRows of grouped.values()) {
    const groupStats = await withTransaction(async () => {
      const current = { usersCreated: 0, usersMatched: 0, profiles: 0, passes: 0, payments: 0, memos: 0 };
      const { id: userId, created } = await findOrCreateUser(groupRows[0]);
      if (created) current.usersCreated += 1;
      else current.usersMatched += 1;
      await upsertProfile(userId, groupRows);
      current.profiles += 1;
      for (const row of groupRows) {
        if (await insertMemo(userId, row)) current.memos += 1;
        const pass = await insertPass(userId, row);
        if (pass.inserted) current.passes += 1;
        if (pass.payment) current.payments += 1;
      }
      return current;
    });
    for (const key of Object.keys(groupStats)) stats[key] += groupStats[key];
  }
  return stats;
}

async function ensureInstructor(name) {
  const cleanName = clean(name);
  if (!cleanName) return false;
  const exists = await queryOne(`SELECT id FROM studio_staff_profiles WHERE name = ? LIMIT 1`, [cleanName]);
  if (exists) return false;
  await query(
    `INSERT INTO studio_staff_profiles
      (id, name, role_code, employment_type, status, created_at, updated_at)
     VALUES (?, ?, 'instructor', 'full_time', 'active', NOW(), NOW())`,
    [randomUUID(), cleanName]
  );
  return true;
}

async function importClasses(rows) {
  const stats = { totalRows: rows.length, classes: 0, skippedClasses: 0, instructors: 0 };
  for (const row of rows) {
    const startAt = combineDateTime(row["수업일"], row["수업시작시간"]);
    const endAt = combineDateTime(row["수업일"], row["수업종료시간"]);
    if (!startAt || !endAt) {
      stats.skippedClasses += 1;
      continue;
    }
    const result = await withTransaction(async () => {
      const instructorCreated = await ensureInstructor(row["강사"]);
      const title = clean(row["수업명"]) || clean(row["수업"]) || "수업";
      const instructorName = clean(row["강사"]) || "미지정";
      const roomName = clean(row["룸"]) || clean(row["수업구분"]) || clean(row["수업"]) || "";
      const externalImportKey = createImportKey("studiomate-class", row);
      const exists = await queryOne(
        `SELECT id, external_import_key AS externalImportKey FROM studio_classes
         WHERE external_import_key = ?
            OR (start_at = ? AND end_at = ? AND instructor_name = ? AND title = ?)
         LIMIT 1`,
        [externalImportKey, startAt, endAt, instructorName, title]
      );
      if (exists?.id) {
        if (!exists.externalImportKey) {
          await query(`UPDATE studio_classes SET external_import_key = ? WHERE id = ?`, [externalImportKey, exists.id]);
        }
        return { inserted: false, instructorCreated };
      }
      await query(
        `INSERT INTO studio_classes
          (id, class_type, title, instructor_name, room_name, start_at, end_at, capacity,
           min_capacity, waitlist_capacity, booking_deadline_at, cancellation_deadline_at,
           cancellation_decision_at, status, external_import_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
        [
          randomUUID(),
          classType(row["수업"]),
          title,
          instructorName,
          roomName,
          startAt,
          endAt,
          Math.max(1, intValue(row["최대수강인원"], 1)),
          Math.max(0, intValue(row["최소수강인원"], 0)),
          nullableInt(row["예약대기가능인원"]),
          dateTime(row["예약가능시간"]),
          dateTime(row["취소가능시간"]),
          dateTime(row["폐강시간"]),
          externalImportKey,
        ]
      );
      return { inserted: true, instructorCreated };
    });
    if (result.instructorCreated) stats.instructors += 1;
    if (!result.inserted) {
      stats.skippedClasses += 1;
      continue;
    }
    stats.classes += 1;
  }
  return stats;
}

await ensureInitialized();

const memberFile = readArg("members", DEFAULT_MEMBER_FILE);
const classFile = readArg("classes", DEFAULT_CLASS_FILE);
if (!fs.existsSync(memberFile)) throw new Error(`회원 엑셀 파일을 찾을 수 없습니다: ${memberFile}`);
if (!fs.existsSync(classFile)) throw new Error(`수업 엑셀 파일을 찾을 수 없습니다: ${classFile}`);

const memberRows = toObjects(readFirstSheetRows(memberFile));
const classRows = toObjects(readFirstSheetRows(classFile));

const members = await importMembers(memberRows);
const classes = await importClasses(classRows);
const result = { members, classes };

console.log(JSON.stringify(result, null, 2));
process.exit(0);
