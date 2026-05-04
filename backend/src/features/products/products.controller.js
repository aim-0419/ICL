// 파일 역할: 상품 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as authService from "../auth/auth.service.js";
import * as productsService from "./products.service.js";

const SESSION_COOKIE_NAME = "icl_session";

function getCookieValue(req, name) {
  const cookieHeader = String(req.headers.cookie || "");
  if (!cookieHeader) return "";
  const item = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  if (!item) return "";
  return decodeURIComponent(item.slice(name.length + 1));
}

async function getAuthUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

function isAdminUser(user) {
  if (!user) return false;
  const grade = String(user.userGrade || "").toLowerCase();
  if (grade === "admin0" || grade === "admin1") return true;
  const role = String(user.role || "").toLowerCase();
  const adminFlag = user.isAdmin === true || user.isAdmin === 1 || user.isAdmin === "1";
  return role === "admin" || role === "admin1" || adminFlag || user.email === "admin@iclpilates.com";
}

// 함수 역할: 상품 데이터를 조회해 호출자에게 반환합니다.
export async function getProducts(req, res, next) {
  try {
    res.json(await productsService.listProducts());
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 상품 데이터를 새로 생성합니다.
export async function createProduct(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "관리자만 상품을 등록할 수 있습니다." });
      return;
    }
    const product = await productsService.createProduct(req.body);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 상품 데이터를 수정합니다.
export async function updateProduct(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "관리자만 상품을 수정할 수 있습니다." });
      return;
    }
    const product = await productsService.updateProduct(req.params.productId, req.body);
    res.json(product);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 상품 데이터를 삭제합니다.
export async function deleteProduct(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "관리자만 상품을 삭제할 수 있습니다." });
      return;
    }
    const result = await productsService.deleteProduct(req.params.productId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
