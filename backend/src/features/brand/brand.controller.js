import * as authService from "../auth/auth.service.js";
import * as brandService from "./brand.service.js";

const SESSION_COOKIE_NAME = "icl_session";

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

async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

function isAdmin(user) {
  const grade = String(user?.userGrade || "").toLowerCase();
  if (grade === "admin0" || grade === "admin1") return true;
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || user?.isAdmin === true || user?.isAdmin === 1;
}

export async function getInstructors(req, res, next) {
  try {
    res.json({ instructors: await brandService.listInstructors() });
  } catch (error) { next(error); }
}

export async function saveInstructor(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const result = await brandService.upsertInstructor(req.body || {});
    res.json(result);
  } catch (error) { next(error); }
}

export async function removeInstructor(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await brandService.deleteInstructor(req.params.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function getBranches(req, res, next) {
  try {
    res.json({ branches: await brandService.listBranches() });
  } catch (error) { next(error); }
}

export async function saveBranch(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const result = await brandService.upsertBranch(req.body || {});
    res.json(result);
  } catch (error) { next(error); }
}

export async function removeBranch(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await brandService.deleteBranch(req.params.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
}
