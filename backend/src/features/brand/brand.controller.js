// 파일 역할: 브랜드 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as authService from "../auth/auth.service.js";
import * as brandService from "./brand.service.js";

const SESSION_COOKIE_NAME = "icl_session";

// 함수 역할: 쿠키 값 데이터를 조회해 호출자에게 반환합니다.
function getCookieValue(req, name) {
  return (String(req.headers.cookie || "").split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`)) || "")
    .slice(name.length + 1)
    ? decodeURIComponent((String(req.headers.cookie || "").split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`${name}=`)) || "")
        .slice(name.length + 1))
    : "";
}

// 함수 역할: 인증된 회원 데이터를 조회해 호출자에게 반환합니다.
async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

// 함수 역할: 관리자 조건에 해당하는지 참/거짓으로 판별합니다.
function isAdmin(user) {
  const grade = String(user?.userGrade || "").toLowerCase();
  if (grade === "admin0" || grade === "admin1") return true;
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || user?.isAdmin === true || user?.isAdmin === 1;
}

// 함수 역할: 강사 데이터를 조회해 호출자에게 반환합니다.
export async function getInstructors(req, res, next) {
  try {
    res.json({ instructors: await brandService.listInstructors() });
  } catch (error) { next(error); }
}

// 함수 역할: 강사 데이터를 저장하거나 기존 값을 갱신합니다.
export async function saveInstructor(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const result = await brandService.upsertInstructor(req.body || {});
    res.json(result);
  } catch (error) { next(error); }
}

// 함수 역할: 강사 값을 제거하고 관련 상태를 정리합니다.
export async function removeInstructor(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await brandService.deleteInstructor(req.params.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

// 함수 역할: 지점 데이터를 조회해 호출자에게 반환합니다.
export async function getBranches(req, res, next) {
  try {
    res.json({ branches: await brandService.listBranches() });
  } catch (error) { next(error); }
}

// 함수 역할: 지점 데이터를 저장하거나 기존 값을 갱신합니다.
export async function saveBranch(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const result = await brandService.upsertBranch(req.body || {});
    res.json(result);
  } catch (error) { next(error); }
}

// 함수 역할: 지점 값을 제거하고 관련 상태를 정리합니다.
export async function removeBranch(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await brandService.deleteBranch(req.params.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
}
