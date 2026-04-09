import { ACADEMY_VIDEOS } from "../data/academyVideos.js";

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

    const selectedProductIds = Array.isArray(order?.selectedProductIds)
      ? order.selectedProductIds
      : [];
    for (const productId of selectedProductIds) {
      const normalizedId = String(productId || "").trim();
      if (normalizedId) purchasedIds.add(normalizedId);
    }
  }

  return purchasedIds;
}

export function getPurchasedVideos(orders = [], customerEmail = "") {
  const purchasedProductIds = collectPurchasedVideoProductIds(orders, customerEmail);
  return ACADEMY_VIDEOS.filter((video) =>
    purchasedProductIds.has(String(video.productId || video.id))
  );
}
