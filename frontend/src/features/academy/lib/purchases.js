import { ACADEMY_VIDEOS } from "../data/academyVideos.js";

function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

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

export function getPurchasedVideos(orders = [], customerEmail = "", videos = ACADEMY_VIDEOS) {
  const purchasedProductIds = collectPurchasedVideoProductIds(orders, customerEmail);
  return (Array.isArray(videos) ? videos : ACADEMY_VIDEOS).filter((video) =>
    purchasedProductIds.has(String(video.productId || video.id))
  );
}
