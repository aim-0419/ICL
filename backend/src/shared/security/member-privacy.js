// 파일 역할: 회원 개인정보를 요청자 권한에 따라 가려서 응답하도록 돕습니다.
//
// 강사(instructor) 권한에는 member.read 가 포함되어 있어 회원 목록·예약·미수금·상담을
// 조회할 수 있습니다. 수업 운영에는 회원을 식별할 최소 정보만 있으면 되는데,
// 주소·생년월일·연락처 원문까지 함께 나가고 있어 최소권한 원칙에 어긋납니다.
//
// 그래서 운영 책임자(owner·manager·관리자)가 아닌 요청자에게는
// 주소와 생년월일을 비우고 전화·이메일을 부분만 보여줍니다.
// 응답의 키 구조는 그대로 두어 화면 수정 없이 적용됩니다.
import { isAdminUser } from "../middlewares/auth.js";

// 전체 열람이 허용되는 스튜디오 역할입니다. 나머지 역할은 가려진 값을 받습니다.
const FULL_ACCESS_ROLES = new Set(["owner", "manager", "admin", "admin0", "admin1"]);

// 함수 역할: 전화번호를 뒷 4자리만 남기고 가립니다. (01012341234 → 010-****-1234)
export function maskPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return raw;

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "***";

  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

// 함수 역할: 이메일 아이디의 앞 두 글자만 남기고 가립니다. (abcd@x.com → ab***@x.com)
export function maskEmail(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return raw;

  const at = raw.lastIndexOf("@");
  if (at <= 0) return "***";

  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  const head = local.slice(0, 2);
  return `${head}***${domain}`;
}

// 함수 역할: 요청자가 회원 개인정보를 원문 그대로 볼 수 있는지 판단합니다.
// studio 역할 조회가 필요하므로 비동기입니다.
export async function canViewMemberPii(user, resolveStudioRole) {
  if (isAdminUser(user)) return true;
  if (typeof resolveStudioRole !== "function") return false;

  const roleCode = String((await resolveStudioRole(user)) || "").trim().toLowerCase();
  return FULL_ACCESS_ROLES.has(roleCode);
}

// 함수 역할: 회원 정보 한 건에서 가려야 할 필드를 처리합니다.
// 키는 원래 있던 것만 남기고, 없던 키를 새로 만들지는 않습니다.
export function maskMemberRow(row) {
  if (!row || typeof row !== "object") return row;

  const masked = { ...row };

  // 주소·생년월일은 수업 운영에 필요하지 않으므로 값을 비웁니다.
  for (const key of ["address", "addressDetail", "address_detail", "birthDate", "birth_date", "birthYear"]) {
    if (key in masked && masked[key]) masked[key] = "";
  }

  for (const key of ["phone", "customerPhone", "contact"]) {
    if (key in masked && masked[key]) masked[key] = maskPhone(masked[key]);
  }

  for (const key of ["email", "customerEmail"]) {
    if (key in masked && masked[key]) masked[key] = maskEmail(masked[key]);
  }

  return masked;
}

// 함수 역할: 회원 정보 목록에 maskMemberRow 를 적용합니다.
export function maskMemberRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => maskMemberRow(row));
}
