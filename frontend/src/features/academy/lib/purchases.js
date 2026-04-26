// 파일 역할: 주문 내역에서 강의 구매 여부와 접근 가능 영상을 계산하는 유틸을 제공합니다.
import { ACADEMY_VIDEOS } from "../data/academyVideos.js";

// 함수 역할: 요청 데이터 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

// 함수 역할: 주문 상품 ids에서 필요한 항목만 골라냅니다.
function pickOrderProductIds(order) {
  const ids = new Set();

  function addId(value) {
    const normalizedId = String(value || "").trim();
    if (normalizedId) ids.add(normalizedId);
  }

  function scan(source) {
    if (!source || typeof source !== "object") return;

    if (Array.isArray(source.selectedProductIds)) {
      source.selectedProductIds.forEach((value) => addId(value));
    }

    if (Array.isArray(source.items)) {
      source.items.forEach((item) => addId(item?.productId));
    }

    addId(source.productId);
  }

  scan(order);
  scan(parsePayload(order?.payload));

  return ids;
}

// 함수 역할: 주문 항목에서 필요한 항목만 골라냅니다.
function pickOrderItems(order) {
  const items = [];

  function addItem(productId, quantity = 1) {
    const normalizedId = String(productId || "").trim();
    if (!normalizedId) return;
    const parsedQuantity = Number(quantity);
    const safeQuantity =
      Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? Math.round(parsedQuantity) : 1;
    items.push({ productId: normalizedId, quantity: safeQuantity });
  }

  function scan(source) {
    if (!source || typeof source !== "object") return;

    if (Array.isArray(source.items) && source.items.length > 0) {
      source.items.forEach((item) => addItem(item?.productId, item?.quantity));
      return;
    }

    if (Array.isArray(source.selectedProductIds) && source.selectedProductIds.length > 0) {
      source.selectedProductIds.forEach((productId) => addItem(productId, 1));
      return;
    }

    addItem(source.productId, source.quantity);
  }

  const direct = order && typeof order === "object" ? order : {};
  const payload = parsePayload(order?.payload);

  const hasDirectItems = Array.isArray(direct.items) && direct.items.length > 0;
  const hasPayloadItems = Array.isArray(payload.items) && payload.items.length > 0;
  const hasDirectSelected =
    Array.isArray(direct.selectedProductIds) && direct.selectedProductIds.length > 0;
  const hasPayloadSelected =
    Array.isArray(payload.selectedProductIds) && payload.selectedProductIds.length > 0;

  if (hasDirectItems) {
    scan(direct);
  } else if (hasPayloadItems) {
    scan(payload);
  } else if (hasDirectSelected) {
    scan(direct);
  } else if (hasPayloadSelected) {
    scan(payload);
  } else if (String(direct.productId || "").trim()) {
    scan(direct);
  } else {
    scan(payload);
  }

  return items;
}

// 함수 역할: 구매한 강의 영상 상품 ids 항목을 모아 반환합니다.
export function collectPurchasedVideoProductIds(orders = [], customerEmail = "") {
  const normalizedEmail = String(customerEmail || "").trim().toLowerCase();
  const purchasedIds = new Set();

  for (const order of orders) {
    const orderEmail = String(order?.customerEmail || "")
      .trim()
      .toLowerCase();
    if (normalizedEmail && orderEmail && orderEmail !== normalizedEmail) {
      continue;
    }

    const orderProductIds = pickOrderProductIds(order);
    for (const productId of orderProductIds) purchasedIds.add(productId);
  }

  return purchasedIds;
}

// 함수 역할: 구매한 강의 영상 항목 개수를 계산합니다.
export function countPurchasedVideoItems(orders = [], customerEmail = "", videos = ACADEMY_VIDEOS) {
  const normalizedEmail = String(customerEmail || "").trim().toLowerCase();
  const videoProductIdSet = new Set(
    (Array.isArray(videos) ? videos : ACADEMY_VIDEOS).map((video) =>
      String(video?.productId || video?.id || "").trim()
    )
  );

  let total = 0;

  for (const order of orders) {
    const orderEmail = String(order?.customerEmail || "")
      .trim()
      .toLowerCase();
    if (normalizedEmail && orderEmail && orderEmail !== normalizedEmail) {
      continue;
    }

    const orderItems = pickOrderItems(order);
    for (const item of orderItems) {
      if (!videoProductIdSet.has(item.productId)) continue;
      total += Math.max(1, Number(item.quantity) || 1);
    }
  }

  return total;
}

// 함수 역할: 구매한 강의 영상 데이터를 조회해 호출자에게 반환합니다.
export function getPurchasedVideos(orders = [], customerEmail = "", videos = ACADEMY_VIDEOS) {
  const purchasedProductIds = collectPurchasedVideoProductIds(orders, customerEmail);
  return (Array.isArray(videos) ? videos : ACADEMY_VIDEOS).filter((video) =>
    purchasedProductIds.has(String(video.productId || video.id))
  );
}

// 함수 역할: 미리보기 차시 존재 여부를 참/거짓으로 판별합니다.
export function hasPreviewChapter(video) {
  if (!video || !Array.isArray(video.chapters)) return false;
  return video.chapters.some((chapter) => Boolean(chapter?.isPreview));
}

// 함수 역할: 미리보기 accessible 강의 영상 데이터를 조회해 호출자에게 반환합니다.
export function getPreviewAccessibleVideos(videos = ACADEMY_VIDEOS) {
  return (Array.isArray(videos) ? videos : ACADEMY_VIDEOS).filter((video) => hasPreviewChapter(video));
}
