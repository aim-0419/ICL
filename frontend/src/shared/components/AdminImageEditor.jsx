/**
 * 관리자 페이지 편집 도구(AdminImageEditor) 기능
 * - 관리자가 코드 수정 없이 브라우저에서 직접 페이지 콘텐츠를 수정할 수 있는 오버레이 도구
 * - App.jsx에서 모든 페이지 위에 렌더링되며, 관리자 + 편집 모드 ON 상태에서만 활성화
 *
 * 수정 가능한 항목:
 * - 이미지(image)   : img·배경 이미지를 파일 업로드 또는 URL로 교체
 * - 텍스트(text)    : h1·h2·p 등 텍스트 요소를 클릭 후 인라인 편집
 * - 영상(video)     : 요소 위에 영상 오버레이 삽입
 * - 위치(position)  : 카드 요소를 드래그해서 같은 부모 내의 다른 카드와 위치 스왑
 * - 크기(size)      : 리사이즈 핸들로 이미지·카드 크기 조절
 * - 클래스(class)   : 카드 스왑 시 tall/short/wide 등 레이아웃 modifier 클래스도 함께 교환
 *
 * 저장 방식:
 * - 변경 즉시 localStorage에 캐시 저장 (오프라인 대응)
 * - 동시에 POST /api/admin/page-overrides로 DB에 동기화
 * - 페이지 로드 시 DB 데이터를 우선으로 localStorage와 병합해 DOM에 재적용
 * - 위치 초기화 시 해당 경로의 position/class 오버라이드 일괄 삭제
 *
 * 카드 드래그 규칙:
 * - DRAGGABLE_CARD_SELECTOR에 등록된 요소만 드래그 가능
 * - 같은 parentElement를 가진 카드끼리만 스왑 (섹션↔내부카드 스왑 불가)
 * - 스왑 대상 없이 드롭하면 원래 위치로 스냅백 (자유 위치 저장 없음)
 * - 카드 내부 img의 native 드래그는 비활성화 (draggable=false)
 */
// 파일 역할: 관리자에게 페이지 이미지, 배경, 텍스트, 크기를 화면에서 직접 수정하는 편집 도구를 제공합니다.
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAppStore } from "../store/AppContext.jsx";
import { canEditPage } from "../auth/userRoles.js";

// 관리자0의 페이지 수정 기능은 localStorage를 캐시로 사용하고 DB를 원본으로 동기화한다.
const IMAGE_STORAGE_KEY = "icl_admin_image_overrides_v1";
const TEXT_STORAGE_KEY = "icl_admin_text_overrides_v1";
const VIDEO_STORAGE_KEY = "icl_admin_video_overrides_v1";
const POSITION_STORAGE_KEY = "icl_admin_position_overrides_v1";
const SIZE_STORAGE_KEY = "icl_admin_size_overrides_v1";
const CLASS_STORAGE_KEY = "icl_admin_class_overrides_v1";
const CARD_MODIFIER_CLASSES = new Set(["tall", "short", "wide", "offset-up", "offset-down"]);
const RESET_POSITION_EVENT = "admin-editor-reset-positions";
const EDITABLE_IMAGE_SELECTOR = "img, [role='img'], .staff-image-slot, [data-admin-bg-editable]";
// img 태그가 아닌 배경이미지 기반 편집 가능 요소 여부 (role='img' div, staff-image-slot 등)
function isBackgroundImageElement(element) {
  return element instanceof HTMLElement && element.tagName !== "IMG" && element.matches(EDITABLE_IMAGE_SELECTOR);
}
const EDITABLE_TEXT_SELECTOR = "h1, h2, h3, p, ul, ol, span, strong, em, small, li, label, time, dt, dd";
const EDITABLE_TEXT_GROUP_SELECTOR = ".staff-text-panel, [data-admin-text-group]";
const DRAGGABLE_CARD_SELECTOR = [
  "[data-admin-draggable-card]",
  ".home-section-card",
  ".section-block",
  ".hero-panel",
  ".dashboard-hero",
  ".tour-gallery-item",
  ".reason-item",
  ".staff-split",
  "[class*='card']",
].join(", ");
const CARD_SWAP_OVERLAP_RATIO = 0.2;
const CARD_DRAG_AUTO_SCROLL_EDGE_PX = 180;
const CARD_DRAG_AUTO_SCROLL_MIN_VELOCITY = 10;
const CARD_DRAG_AUTO_SCROLL_MAX_VELOCITY = 113;
const LazyAdminRichTextInlineEditor = lazy(() =>
  import("./AdminRichTextInlineEditor.jsx").then((module) => ({ default: module.AdminRichTextInlineEditor }))
);
const DEFAULT_IMAGE_POSITION = "50% 50%";
const DEFAULT_IMAGE_ZOOM = 100;
const MIN_IMAGE_ZOOM = 100;
const MAX_IMAGE_ZOOM = 260;
const IMAGE_ZOOM_STEP = 10;
const CARD_ROOT_CLASS_NAMES = new Set([
  "section-block",
  "hero-panel",
  "dashboard-hero",
  "tour-gallery-item",
  "reason-item",
  "staff-split",
]);

// 함수 역할: 영역 겹침 area 데이터를 조회해 호출자에게 반환합니다.
function getRectOverlapArea(sourceRect, targetRect) {
  const left = Math.max(sourceRect.left, targetRect.left);
  const top = Math.max(sourceRect.top, targetRect.top);
  const right = Math.min(sourceRect.right, targetRect.right);
  const bottom = Math.min(sourceRect.bottom, targetRect.bottom);

  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

// 함수 역할: 부동소수점 오차를 줄이기 위해 소수점 4자리까지 반올림합니다.
function roundCardNumber(value) {
  return Math.round(value * 10000) / 10000;
}

// 함수 역할: 유한한 숫자이면 그 값을, 아니면 fallback 값을 반환합니다.
function readFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// 함수 역할: 카드 변환(이동·스케일) 값을 안전한 표준 객체로 정규화합니다.
function normalizeCardTransform(value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const scaleFallback = readFiniteNumber(source.scale, fallback.scale || 1);
  const scaleX = readFiniteNumber(source.scaleX, fallback.scaleX || scaleFallback);
  const scaleY = readFiniteNumber(source.scaleY, fallback.scaleY || scaleFallback);

  return {
    x: readFiniteNumber(source.x, fallback.x || 0),
    y: readFiniteNumber(source.y, fallback.y || 0),
    scaleX: scaleX > 0 ? scaleX : 1,
    scaleY: scaleY > 0 ? scaleY : 1,
  };
}

// 함수 역할: 카드 변환 값을 CSS transform 문자열로 변환합니다.
function formatCardTransform(transformValue) {
  const value = normalizeCardTransform(transformValue);
  return `translate(${roundCardNumber(value.x)}px, ${roundCardNumber(value.y)}px) scale(${roundCardNumber(value.scaleX)}, ${roundCardNumber(value.scaleY)})`;
}

// 함수 역할: 카드 요소에 transform·position·z-index 스타일을 적용합니다.
function applyCardTransformValue(element, transformValue, zIndex = "") {
  element.style.transform = formatCardTransform(transformValue);
  element.style.transformOrigin = "top left";
  element.style.position = "relative";
  if (zIndex) {
    element.style.zIndex = zIndex;
  } else {
    element.style.removeProperty("z-index");
  }
  element.dataset.adminPositionCustomized = "true";
}

// 함수 역할: 두 카드가 위치를 스왑할 때 원본 저장 값 기준으로 대상 위치의 transform을 계산합니다.
function createCardSwapTransform(savedTransform, sourceRect, targetRect, noScale = false) {
  const saved = normalizeCardTransform(savedTransform);

  if (noScale) {
    return {
      x: roundCardNumber(saved.x + (targetRect.left - sourceRect.left)),
      y: roundCardNumber(saved.y + (targetRect.top - sourceRect.top)),
      scaleX: saved.scaleX,
      scaleY: saved.scaleY,
    };
  }

  const sourceWidth = Math.max(1, sourceRect.width);
  const sourceHeight = Math.max(1, sourceRect.height);
  const sourceBaseWidth = sourceWidth / Math.max(0.0001, saved.scaleX);
  const sourceBaseHeight = sourceHeight / Math.max(0.0001, saved.scaleY);
  const targetWidth = Math.max(1, targetRect.width);
  const targetHeight = Math.max(1, targetRect.height);
  const fitScale = Math.min(targetWidth / sourceBaseWidth, targetHeight / sourceBaseHeight);
  const fittedWidth = sourceBaseWidth * fitScale;
  const fittedHeight = sourceBaseHeight * fitScale;

  return {
    x: roundCardNumber(saved.x + (targetRect.left - sourceRect.left) + ((targetWidth - fittedWidth) / 2)),
    y: roundCardNumber(saved.y + (targetRect.top - sourceRect.top) + ((targetHeight - fittedHeight) / 2)),
    scaleX: roundCardNumber(fitScale),
    scaleY: roundCardNumber(fitScale),
  };
}

// 함수 역할: 요소가 드래그 가능한 카드 클래스를 가지고 있는지 판별합니다.
function hasDraggableCardClass(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.dataset.adminDraggableCard === "true") return true;

  return Array.from(element.classList).some((className) => (
    CARD_ROOT_CLASS_NAMES.has(className) ||
    className === "card" ||
    className === "panel" ||
    className.endsWith("-card")
  ));
}

// 함수 역할: 요소가 홈 메인(.home-main)의 직속 섹션 카드인지 판별합니다.
function isHomeMainSectionCard(element) {
  return Boolean(
    element instanceof HTMLElement &&
    element.classList.contains("home-section-card") &&
    element.parentElement?.classList.contains("home-main")
  );
}

// 함수 역할: 요소로부터 가장 가까운 홈 메인 섹션 카드를 탐색해 반환합니다.
function findHomeMainSectionCardFromElement(element) {
  if (!(element instanceof Element)) return null;

  let current = element;
  while (current && current instanceof Element && current.tagName !== "BODY") {
    if (isHomeMainSectionCard(current)) return current;
    current = current.parentElement;
  }

  return null;
}

// 함수 역할: 특정 화면 좌표에서 홈 메인 섹션 카드를 탐색해 반환합니다.
function findHomeMainSectionCardAtPoint(clientX, clientY, activeElement = null) {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  const cards = document
    .elementsFromPoint(clientX, clientY)
    .map((element) => findHomeMainSectionCardFromElement(element))
    .filter((card, index, list) => card && list.indexOf(card) === index);

  if (!cards.length) return null;

  const activeCard = activeElement instanceof HTMLElement ? activeElement : null;
  if (activeCard && cards.length > 1) {
    const behindActive = cards.find((card) => card !== activeCard);
    if (behindActive) return behindActive;
  }

  return cards[0];
}

// 함수 역할: 요소가 드래그 가능한 카드 조건을 충족하는지 판별합니다.
function isDraggableCardElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest(".admin-image-editor-panel")) return false;
  if (element.dataset.adminDraggableCard === "false") return false;
  if (element.closest("[data-admin-draggable-card='false']")) return false;
  if (element.matches("html, body, main, #root, .site-shell, .topbar, .site-footer")) return false;
  if (element.closest(".home-main")) return isHomeMainSectionCard(element);
  return hasDraggableCardClass(element);
}

// 함수 역할: 요소로부터 드래그 가능한 카드 후보 목록을 DOM 트리를 타고 올라가며 수집합니다.
function getDraggableCardCandidatesFromElement(element) {
  if (!(element instanceof Element)) return [];
  if (element.closest(".admin-image-editor-panel")) return [];

  const homeMainCard = findHomeMainSectionCardFromElement(element);
  if (homeMainCard) return [homeMainCard];

  const candidates = [];
  let current = element;

  while (current && current instanceof Element && current.tagName !== "BODY") {
    if (current.matches(DRAGGABLE_CARD_SELECTOR) && isDraggableCardElement(current)) {
      candidates.push(current);
    }
    current = current.parentElement;
  }

  return candidates;
}

// 함수 역할: 후보 목록에서 홈 메인 섹션 카드를 우선 탐색해 반환합니다.
function getMainPageSectionCandidate(candidates) {
  return candidates.find((candidate) => (
    candidate.parentElement?.classList.contains("home-main") &&
    (
      candidate.classList.contains("hero-panel") ||
      candidate.classList.contains("section-block")
    )
  )) || null;
}

// 함수 역할: 후보 목록에서 가장 적합한 드래그 대상 카드를 선택해 반환합니다.
function pickPreferredDraggableCard(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return getMainPageSectionCandidate(candidates) || candidates[0];
}

// 함수 역할: 드롭 대상이 드래그 중인 카드와 스왑 가능한 조건을 충족하는지 판별합니다.
function isCompatibleCardDropTarget(candidate, draggingElement) {
  if (!(candidate instanceof HTMLElement)) return false;
  if (!(draggingElement instanceof HTMLElement)) return false;
  if (candidate === draggingElement) return false;
  if (candidate.contains(draggingElement) || draggingElement.contains(candidate)) return false;
  const rect = candidate.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// 함수 역할: 드래그 대상 card from element 대상을 탐색해 반환합니다.
function findDraggableCardFromElement(element) {
  return pickPreferredDraggableCard(getDraggableCardCandidatesFromElement(element));
}

// 함수 역할: 드롭 대상 at point 대상을 탐색해 반환합니다.
function findDropTargetAtPoint(clientX, clientY, draggingElement) {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  const sourceParent = draggingElement instanceof Element ? draggingElement.parentElement : null;
  const elements = document.elementsFromPoint(clientX, clientY);
  let fallbackCandidate = null;
  for (const element of elements) {
    const candidates = getDraggableCardCandidatesFromElement(element).filter((candidate) =>
      isCompatibleCardDropTarget(candidate, draggingElement)
    );
    if (!candidates.length) continue;

    if (!fallbackCandidate) {
      fallbackCandidate = pickPreferredDraggableCard(candidates);
    }

    const sameLevelCandidate = sourceParent
      ? candidates.find((candidate) => candidate.parentElement === sourceParent)
      : null;
    if (sameLevelCandidate) return sameLevelCandidate;
  }

  return fallbackCandidate;
}

// 함수 역할: 대시보드 card element 조건에 해당하는지 참/거짓으로 판별합니다.
function isDashboardCardElement(element) {
  if (!(element instanceof Element)) return false;
  return Boolean(element.matches(".admin-dashboard-page .dashboard-card, .admin-dashboard-page .dashboard-hero"));
}

// 함수 역할: 세로 자동 스크롤 속도 상황에 맞는 값을 계산하거나 선택합니다.
function resolveVerticalAutoScrollVelocity(clientY) {
  if (typeof window === "undefined") return 0;
  const viewportHeight = window.innerHeight || 0;
  if (viewportHeight <= 0) return 0;

  if (clientY <= CARD_DRAG_AUTO_SCROLL_EDGE_PX) {
    const ratio = Math.max(0, (CARD_DRAG_AUTO_SCROLL_EDGE_PX - clientY) / CARD_DRAG_AUTO_SCROLL_EDGE_PX);
    const speed =
      CARD_DRAG_AUTO_SCROLL_MIN_VELOCITY +
      Math.sqrt(ratio) * (CARD_DRAG_AUTO_SCROLL_MAX_VELOCITY - CARD_DRAG_AUTO_SCROLL_MIN_VELOCITY);
    return -Math.round(speed);
  }

  if (clientY >= viewportHeight - CARD_DRAG_AUTO_SCROLL_EDGE_PX) {
    const ratio = Math.max(
      0,
      (clientY - (viewportHeight - CARD_DRAG_AUTO_SCROLL_EDGE_PX)) / CARD_DRAG_AUTO_SCROLL_EDGE_PX
    );
    const speed =
      CARD_DRAG_AUTO_SCROLL_MIN_VELOCITY +
      Math.sqrt(ratio) * (CARD_DRAG_AUTO_SCROLL_MAX_VELOCITY - CARD_DRAG_AUTO_SCROLL_MIN_VELOCITY);
    return Math.round(speed);
  }

  return 0;
}

// 함수 역할: 강의 영상 URL 조건에 해당하는지 참/거짓으로 판별합니다.
function isVideoUrl(url) {
  const lower = String(url).toLowerCase().split("?")[0];
  return [".mp4", ".webm", ".mov", ".m4v", ".ogg"].some((ext) => lower.endsWith(ext));
}

// 함수 역할: 강의 영상 overlay 변경값을 실제 대상에 적용합니다.
function applyVideoOverlay(element, videoUrl) {
  removeVideoOverlay(element);
  const computed = window.getComputedStyle(element);
  if (computed.position === "static") {
    element.style.position = "relative";
    element.dataset.adminVideoAddedPosition = "true";
  }
  element.style.overflow = "hidden";
  element.style.backgroundImage = "none";
  element.style.backgroundColor = "transparent";
  Array.from(element.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.classList.contains("admin-video-overlay")) return;
    if (child.dataset.adminVideoOriginalDisplay === undefined) {
      child.dataset.adminVideoOriginalDisplay = child.style.display || "";
    }
    child.style.display = "none";
  });
  const video = document.createElement("video");
  video.className = "admin-video-overlay";
  video.src = videoUrl;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;z-index:0;background:transparent;";
  element.appendChild(video);
  video.play().catch(() => {});
  element.dataset.adminVideoCustomized = "true";
}

// 함수 역할: 강의 영상 overlay 값을 제거하고 관련 상태를 정리합니다.
function removeVideoOverlay(element) {
  element.querySelectorAll(".admin-video-overlay").forEach((v) => v.remove());
  if (element.dataset.adminVideoAddedPosition === "true") {
    element.style.removeProperty("position");
    delete element.dataset.adminVideoAddedPosition;
  }
  const originalOverflow = element.dataset.adminImageOriginalOverflow || "";
  if (originalOverflow) {
    element.style.overflow = originalOverflow;
  } else {
    element.style.removeProperty("overflow");
  }
  const originalBackground = element.dataset.adminImageOriginalValue || "";
  if (originalBackground) {
    element.style.backgroundImage = originalBackground;
  } else {
    element.style.removeProperty("background-image");
  }
  element.style.removeProperty("background-color");
  Array.from(element.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.classList.contains("admin-video-overlay")) return;
    const originalDisplay = child.dataset.adminVideoOriginalDisplay;
    if (originalDisplay !== undefined) {
      if (originalDisplay) child.style.display = originalDisplay;
      else child.style.removeProperty("display");
      delete child.dataset.adminVideoOriginalDisplay;
    }
  });
  element.dataset.adminVideoCustomized = "false";
}

function applyVideoFitValue(element, fitValue) {
  if (!fitValue) return;
  element.querySelectorAll(".admin-video-overlay").forEach((video) => {
    if (video instanceof HTMLVideoElement) {
      video.style.objectFit = fitValue;
    }
  });
}

// 함수 역할: 수정값 저장값을 읽어옵니다.
function readOverrides(storageKey) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const cleaned = Object.fromEntries(
      Object.entries(parsed).filter(([, val]) => !String(val).startsWith("blob:"))
    );
    if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
      window.localStorage.setItem(storageKey, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

// 함수 역할: 수정값 데이터를 저장하거나 기존 값을 갱신합니다.
function saveOverrides(storageKey, nextOverrides) {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(nextOverrides));
    return true;
  } catch (error) {
    console.error("[admin-editor] failed to save overrides", error);
    return false;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHtmlTextValue(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function getRichTextPlainText(value) {
  const text = String(value || "");
  if (!isHtmlTextValue(text)) return text.trim();
  if (typeof document === "undefined") return text.replace(/<[^>]*>/g, "").trim();
  const template = document.createElement("template");
  template.innerHTML = text;
  return (template.content.textContent || "").replace(/\u00a0/g, " ").trim();
}

function textToEditorHtml(value) {
  if (isHtmlTextValue(value)) return String(value || "");
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  return lines.map((line) => `<p>${escapeHtml(line || " ")}</p>`).join("");
}

function textToEditorHtmlForTarget(value, target) {
  const html = textToEditorHtml(value);
  if (target instanceof HTMLElement && target.matches("ul, ol") && !/<\/?(ul|ol)\b/i.test(html)) {
    return `<${target.tagName.toLowerCase()}>${html}</${target.tagName.toLowerCase()}>`;
  }
  return html;
}

function unwrapSingleParagraphHtml(html) {
  const trimmed = String(html || "").trim();
  const match = trimmed.match(/^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/i);
  return match ? match[1] : trimmed;
}

function listHtmlToInlineBlocks(raw) {
  if (typeof document === "undefined") return raw;
  const template = document.createElement("template");
  template.innerHTML = raw;
  const rows = Array.from(template.content.querySelectorAll("li"))
    .map((item) => {
      const content = unwrapSingleParagraphHtml(item.innerHTML);
      return content ? `<span style="display:block;">• ${content}</span>` : "";
    })
    .filter(Boolean);
  return rows.join("");
}

function normalizeEditorHtmlForTarget(html, target) {
  const raw = String(html || "").trim();
  if (!raw) return "";
  if (target instanceof HTMLElement && target.matches(EDITABLE_TEXT_GROUP_SELECTOR)) {
    return raw;
  }
  if (target instanceof HTMLElement && !target.matches("ul, ol") && /<\/?(ul|ol)\b/i.test(raw)) {
    return listHtmlToInlineBlocks(raw);
  }

  return raw
    .replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (_, attrs = "", content = "") => {
      const styleMatch = String(attrs).match(/style="([^"]*)"/i);
      const style = styleMatch?.[1] ? `${styleMatch[1]};` : "";
      return `<span style="display:block;${style}">${content || "<br>"}</span>`;
    });
}

// 함수 역할: override to DB 값을 서로 일치하도록 동기화합니다.
async function syncOverrideToDb(type, key, value) {
  try {
    await fetch("/api/admin/page-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type, key, value }),
    });
  } catch {
    // best-effort; localStorage는 캐시로 유지된다
  }
}

// 함수 역할: override from DB 데이터를 삭제합니다.
async function deleteOverrideFromDb(type, key) {
  try {
    await fetch("/api/admin/page-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type, key }),
    });
  } catch {
    // best-effort
  }
}

// 함수 역할: 수정값 from DB 데이터를 외부/서버에서 가져옵니다.
async function fetchOverridesFromDb() {
  try {
    const res = await fetch("/api/admin/page-overrides", { credentials: "include" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// DOM 위치를 기준으로 요소를 식별해 페이지별 수정 내용을 다시 적용한다.
// 함수 역할: DOM 경로 signature 데이터를 조회해 호출자에게 반환합니다.
function getDomPathSignature(element) {
  const path = [];
  let current = element;

  while (current && current.parentElement) {
    const siblings = Array.from(current.parentElement.children).filter(
      (child) => child.tagName === current.tagName
    );
    const nth = Math.max(1, siblings.indexOf(current) + 1);
    path.unshift(`${current.tagName.toLowerCase()}:${nth}`);
    current = current.parentElement;
    if (current.tagName === "BODY") break;
  }

  return path.join(">");
}

// 함수 역할: 편집 대상 element 키 데이터를 조회해 호출자에게 반환합니다.
function getEditableElementKey(element, pathname) {
  if (!element.dataset.adminEditKey) {
    element.dataset.adminEditKey = `${pathname}::${getDomPathSignature(element)}`;
  }
  return element.dataset.adminEditKey;
}

// 원본 이미지를 기억해 두면 관리자 초기화 버튼으로 쉽게 복원할 수 있다.
// 함수 역할: original 이미지 값 원본 값을 나중에 복원할 수 있도록 저장합니다.
function rememberOriginalImageValue(element) {
  if (element.dataset.adminImageOriginalSaved === "true") return;

  element.dataset.adminImageOriginalObjectFit = element.style.objectFit || "";
  element.dataset.adminImageOriginalObjectPosition = element.style.objectPosition || "";
  element.dataset.adminImageOriginalBackgroundSize = element.style.backgroundSize || "";
  element.dataset.adminImageOriginalBackgroundPosition = element.style.backgroundPosition || "";
  element.dataset.adminImageOriginalBackgroundRepeat = element.style.backgroundRepeat || "";
  element.dataset.adminImageOriginalOverflow = element.style.overflow || "";

  if (element.tagName === "IMG") {
    element.dataset.adminImageOriginalValue = element.getAttribute("src") || "";
  } else {
    element.dataset.adminImageOriginalValue = element.style.backgroundImage || "";
  }

  element.dataset.adminImageOriginalSaved = "true";
}

// 함수 역할: 이미지 값 변경값을 실제 대상에 적용합니다.
function applyImageValue(element, value) {
  if (element.tagName === "IMG") {
    element.setAttribute("src", value);
    element.style.objectFit = "contain";
    element.style.objectPosition = element.style.objectPosition || "center";
    element.dataset.adminImageCustomized = "true";
    return;
  }

  const safeUrl = String(value).replace(/"/g, '\\"');
  element.style.backgroundImage = `url("${safeUrl}")`;
  element.style.backgroundSize = "cover";
  element.style.backgroundPosition = element.style.backgroundPosition || DEFAULT_IMAGE_POSITION;
  element.style.backgroundRepeat = "no-repeat";
  element.dataset.adminImageCustomized = "true";
}

// 함수 역할: original 이미지 값 값을 원래 상태로 되돌립니다.
function restoreOriginalImageValue(element) {
  const originalValue = element.dataset.adminImageOriginalValue || "";
  const originalObjectFit = element.dataset.adminImageOriginalObjectFit || "";
  const originalObjectPosition = element.dataset.adminImageOriginalObjectPosition || "";
  const originalBackgroundSize = element.dataset.adminImageOriginalBackgroundSize || "";
  const originalBackgroundPosition = element.dataset.adminImageOriginalBackgroundPosition || "";
  const originalBackgroundRepeat = element.dataset.adminImageOriginalBackgroundRepeat || "";
  const originalOverflow = element.dataset.adminImageOriginalOverflow || "";

  if (element.tagName === "IMG") {
    if (originalValue) {
      element.setAttribute("src", originalValue);
    } else {
      element.removeAttribute("src");
    }
    if (originalObjectFit) {
      element.style.objectFit = originalObjectFit;
    } else {
      element.style.removeProperty("object-fit");
    }
    if (originalObjectPosition) {
      element.style.objectPosition = originalObjectPosition;
    } else {
      element.style.removeProperty("object-position");
    }
    element.dataset.adminImageCustomized = "false";
    return;
  }

  element.style.backgroundImage = originalValue;
  if (originalBackgroundSize) {
    element.style.backgroundSize = originalBackgroundSize;
  } else {
    element.style.removeProperty("background-size");
  }
  if (originalBackgroundPosition) {
    element.style.backgroundPosition = originalBackgroundPosition;
  } else {
    element.style.removeProperty("background-position");
  }
  if (originalBackgroundRepeat) {
    element.style.backgroundRepeat = originalBackgroundRepeat;
  } else {
    element.style.removeProperty("background-repeat");
  }
  if (originalOverflow) {
    element.style.overflow = originalOverflow;
  } else {
    element.style.removeProperty("overflow");
  }
  element.dataset.adminImageCustomized = "false";
}

// 텍스트 편집도 같은 방식으로 원본 값과 줄바꿈 스타일을 보존한다.
// 함수 역할: original 텍스트 값 원본 값을 나중에 복원할 수 있도록 저장합니다.
function rememberOriginalTextValue(element) {
  if (element.dataset.adminTextOriginalSaved === "true") return;
  element.dataset.adminTextOriginalValue = element.innerHTML || element.textContent || "";
  element.dataset.adminTextOriginalWhiteSpace = element.style.whiteSpace || "";
  element.dataset.adminTextOriginalSaved = "true";
}

// 함수 역할: 텍스트 값 변경값을 실제 대상에 적용합니다.
function applyTextValue(element, value) {
  if (element.matches(EDITABLE_TEXT_GROUP_SELECTOR) && !getRichTextPlainText(value)) {
    return;
  }
  let htmlValue = isHtmlTextValue(value) ? normalizeEditorHtmlForTarget(value, element) : "";
  if (htmlValue && element.matches("ul, ol")) {
    const template = document.createElement("template");
    template.innerHTML = htmlValue;
    const sameList = template.content.querySelector(element.tagName.toLowerCase());
    if (sameList instanceof HTMLElement) {
      htmlValue = sameList.innerHTML;
    }
  }
  if (htmlValue) {
    element.innerHTML = htmlValue;
  } else {
    element.textContent = value;
  }
  const text = String(value || "");
  const hasFormattingSpace = /\n| {2,}|\t/.test(text);
  if (htmlValue || hasFormattingSpace) {
    element.style.whiteSpace = "pre-wrap";
  } else {
    const originalWhiteSpace = element.dataset.adminTextOriginalWhiteSpace || "";
    if (originalWhiteSpace) {
      element.style.whiteSpace = originalWhiteSpace;
    } else {
      element.style.removeProperty("white-space");
    }
  }
  element.dataset.adminTextCustomized = "true";
}

// 함수 역할: original 텍스트 값 값을 원래 상태로 되돌립니다.
function restoreOriginalTextValue(element) {
  const originalValue = element.dataset.adminTextOriginalValue || "";
  const originalWhiteSpace = element.dataset.adminTextOriginalWhiteSpace || "";
  element.innerHTML = originalValue;
  if (originalWhiteSpace) {
    element.style.whiteSpace = originalWhiteSpace;
  } else {
    element.style.removeProperty("white-space");
  }
  element.dataset.adminTextCustomized = "false";
}

// 함수 역할: original 크기 값 원본 값을 나중에 복원할 수 있도록 저장합니다.
function rememberOriginalSizeValue(element) {
  if (element.dataset.adminSizeOriginalSaved === "true") return;
  element.dataset.adminSizeOriginalWidth = element.style.width || "";
  element.dataset.adminSizeOriginalHeight = element.style.height || "";
  element.dataset.adminSizeOriginalMinHeight = element.style.minHeight || "";
  element.dataset.adminSizeOriginalAspectRatio = element.style.aspectRatio || "";
  element.dataset.adminSizeOriginalObjectFit = element.style.objectFit || "";
  element.dataset.adminSizeOriginalOverflow = element.style.overflow || "";
  element.dataset.adminSizeOriginalSaved = "true";
}

// 함수 역할: 크기 값 변경값을 실제 대상에 적용합니다.
function applySizeValue(element, sizeValue) {
  if (!sizeValue) return;
  if (element.matches(".staff-split")) {
    restoreOriginalSizeValue(element);
    element.style.removeProperty("height");
    element.style.removeProperty("min-height");
    element.style.removeProperty("overflow");
    return;
  }
  rememberOriginalSizeValue(element);
  if (sizeValue.width) element.style.width = sizeValue.width;
  else element.style.removeProperty("width");
  if (sizeValue.height) element.style.height = sizeValue.height;
  else element.style.removeProperty("height");
  if (sizeValue.minHeight) element.style.minHeight = sizeValue.minHeight;
  else element.style.removeProperty("min-height");
  if (sizeValue.aspectRatio && !element.matches(".intro-cover-media")) element.style.aspectRatio = sizeValue.aspectRatio;
  else element.style.removeProperty("aspect-ratio");
  if (sizeValue.objectFit) element.style.objectFit = sizeValue.objectFit;
  else element.style.removeProperty("object-fit");
  applyVideoFitValue(element, sizeValue.objectFit || "cover");
  if (sizeValue.objectPosition) element.style.objectPosition = sizeValue.objectPosition;
  if (element.matches(".intro-cover-media")) {
    element.style.backgroundSize = "cover";
    element.style.backgroundRepeat = "no-repeat";
  } else if (isBackgroundImageElement(element)) {
    // role='img' div, staff-image-slot 등 배경이미지 기반 요소 전체에 적용
    element.style.backgroundSize = sizeValue.backgroundSize || getBackgroundSizeForFit(sizeValue.objectFit) || "cover";
    element.style.backgroundPosition = sizeValue.backgroundPosition || element.style.backgroundPosition || DEFAULT_IMAGE_POSITION;
    element.style.backgroundRepeat = "no-repeat";
  }
  if (element.matches(EDITABLE_TEXT_GROUP_SELECTOR)) element.style.overflow = sizeValue.overflow || "auto";
  else if (sizeValue.overflow) element.style.overflow = sizeValue.overflow;
  else element.style.removeProperty("overflow");
  element.dataset.adminSizeCustomized = "true";
}

// 함수 역할: original 크기 값 값을 원래 상태로 되돌립니다.
function restoreOriginalSizeValue(element) {
  const w = element.dataset.adminSizeOriginalWidth || "";
  const h = element.dataset.adminSizeOriginalHeight || "";
  const minH = element.dataset.adminSizeOriginalMinHeight || "";
  const ratio = element.dataset.adminSizeOriginalAspectRatio || "";
  const fit = element.dataset.adminSizeOriginalObjectFit || "";
  const ov = element.dataset.adminSizeOriginalOverflow || "";
  if (w) element.style.width = w; else element.style.removeProperty("width");
  if (h) element.style.height = h; else element.style.removeProperty("height");
  if (minH) element.style.minHeight = minH; else element.style.removeProperty("min-height");
  if (ratio) element.style.aspectRatio = ratio; else element.style.removeProperty("aspect-ratio");
  if (fit) element.style.objectFit = fit; else element.style.removeProperty("object-fit");
  element.style.removeProperty("object-position");
  if (ov) element.style.overflow = ov; else element.style.removeProperty("overflow");
  element.dataset.adminSizeCustomized = "false";
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
}

function parsePositionPercent(value) {
  const raw = String(value || DEFAULT_IMAGE_POSITION).trim().toLowerCase();
  if (raw === "center") return { x: 50, y: 50 };
  const parts = raw.split(/\s+/);
  const read = (part, fallback) => {
    if (!part || part === "center") return fallback;
    if (part === "left" || part === "top") return 0;
    if (part === "right" || part === "bottom") return 100;
    const numeric = Number.parseFloat(part);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  return {
    x: clampPercent(read(parts[0], 50)),
    y: clampPercent(read(parts[1], 50)),
  };
}

function clampImageZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_IMAGE_ZOOM;
  return Math.max(MIN_IMAGE_ZOOM, Math.min(MAX_IMAGE_ZOOM, numeric));
}

function parseImageZoom(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "cover" || raw === "contain" || raw === "auto") return DEFAULT_IMAGE_ZOOM;
  const numeric = Number.parseFloat(raw);
  return clampImageZoom(Number.isFinite(numeric) ? numeric : DEFAULT_IMAGE_ZOOM);
}

function getImageZoomSizeValue(zoom) {
  const nextZoom = clampImageZoom(zoom);
  return nextZoom <= DEFAULT_IMAGE_ZOOM ? "cover" : `${nextZoom}%`;
}

function getBackgroundSizeForFit(fit) {
  if (fit === "cover") return "cover";
  if (fit === "contain") return "contain";
  if (fit === "none") return "auto";
  if (fit === "fill") return "100% 100%";
  return undefined;
}

function getStaffSplitParts(element) {
  if (!(element instanceof HTMLElement)) return null;
  const staffSplit = element.matches(".staff-split") ? element : element.closest(".staff-split");
  if (!(staffSplit instanceof HTMLElement)) return null;
  const image = staffSplit.querySelector(".staff-image-slot");
  const text = staffSplit.querySelector(EDITABLE_TEXT_GROUP_SELECTOR);
  if (!(image instanceof HTMLElement) || !(text instanceof HTMLElement)) return null;
  return { staffSplit, image, text };
}

function applyStaffPairHeight(image, text, heightValue) {
  if (!(image instanceof HTMLElement) || !(text instanceof HTMLElement) || !heightValue) return;
  image.style.height = heightValue;
  image.style.minHeight = "0px";
  image.style.overflow = "hidden";
  image.style.backgroundSize = image.style.backgroundSize || "cover";
  image.style.backgroundPosition = image.style.backgroundPosition || DEFAULT_IMAGE_POSITION;
  image.style.backgroundRepeat = "no-repeat";
  text.style.height = heightValue;
  text.style.overflow = "auto";
}

function getStaffImageSizeValue(image) {
  return {
    width: image?.style.width || "100%",
    height: image?.style.height || undefined,
    minHeight: image?.style.minHeight || "0px",
    overflow: image?.style.overflow || "hidden",
    objectFit: "cover",
    backgroundSize: image?.style.backgroundSize || "cover",
    backgroundPosition: image?.style.backgroundPosition || DEFAULT_IMAGE_POSITION,
  };
}

function getStaffTextSizeValue(text) {
  return {
    height: text?.style.height || undefined,
    overflow: "auto",
  };
}

// 텍스트는 선택 후 클릭, 이미지는 더블클릭으로 편집 대상을 찾는다.
// 함수 역할: 편집 대상 이미지 대상 대상을 탐색해 반환합니다.
function findEditableImageTarget(eventTarget) {
  if (!(eventTarget instanceof Element)) return null;
  if (eventTarget.closest(".admin-rich-text-modal")) return null;
  if (eventTarget.closest(".admin-image-editor-panel")) return null;

  const editable = eventTarget.closest(EDITABLE_IMAGE_SELECTOR);
  return editable instanceof HTMLElement ? editable : null;
}

// 함수 역할: 편집 대상 텍스트 대상 대상을 탐색해 반환합니다.
const BLOCK_TEXT_SELECTOR = "h1, h2, h3, p, ul, ol, li, label, time, dt, dd";

function findEditableTextTarget(eventTarget) {
  if (!(eventTarget instanceof Element)) return null;
  if (eventTarget.closest(".admin-rich-text-modal")) return null;
  if (eventTarget.closest(".admin-image-editor-panel")) return null;

  const textGroup = eventTarget.closest(EDITABLE_TEXT_GROUP_SELECTOR);
  if (
    textGroup instanceof HTMLElement &&
    textGroup.dataset.adminTextEditable !== "false" &&
    !textGroup.closest("[data-admin-text-editable='false']")
  ) {
    return textGroup;
  }

  const editable = eventTarget.closest(EDITABLE_TEXT_SELECTOR);
  if (!(editable instanceof HTMLElement)) return null;
  if (
    editable.dataset.adminTextEditable === "false" ||
    editable.closest("[data-admin-text-editable='false']")
  ) {
    return null;
  }

  if (editable.matches("li")) {
    const listParent = editable.closest("ul, ol");
    if (
      listParent instanceof HTMLElement &&
      listParent.dataset.adminTextEditable !== "false" &&
      !listParent.closest("[data-admin-text-editable='false']")
    ) {
      return listParent;
    }
  }

  // inline 요소(span/strong/em 등)가 선택된 경우 바깥 block 요소를 우선한다.
  // TipTap 저장 후 p > span 구조에서 span이 target이 되면 p의 override key와 달라지는 버그 방지.
  if (!editable.matches(BLOCK_TEXT_SELECTOR) && editable.parentElement) {
    const blockParent = editable.parentElement.closest(BLOCK_TEXT_SELECTOR);
    if (
      blockParent instanceof HTMLElement &&
      blockParent.dataset.adminTextEditable !== "false" &&
      !blockParent.closest("[data-admin-text-editable='false']")
    ) {
      return blockParent;
    }
  }

  return editable;
}

// 함수 역할: 선택된 텍스트 대상 데이터를 조회해 호출자에게 반환합니다.
function getSelectedTextTarget() {
  const selection = window.getSelection();
  if (!selection) return null;

  const selectedText = selection.toString().trim();
  if (!selectedText) return null;

  const anchorNode = selection.anchorNode;
  if (!anchorNode) return null;

  const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
  if (!anchorElement) return null;

  return findEditableTextTarget(anchorElement);
}

// 함수 역할: placeCaretAtEnd 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function placeCaretAtEnd(element) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

// 함수 역할: insertLineBreakAtCaret 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function insertLineBreakAtCaret(container) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return;

  range.deleteContents();
  const lineBreakNode = document.createTextNode("\n");
  range.insertNode(lineBreakNode);

  range.setStartAfter(lineBreakNode);
  range.setEndAfter(lineBreakNode);
  selection.removeAllRanges();
  selection.addRange(range);
}

// 이 컴포넌트는 모든 페이지에 떠 있지만, 관리자0 + 페이지 수정 활성화 상태에서만 동작한다.
// 컴포넌트 역할: 관리자 편집 모드에서 이미지/텍스트/크기 변경 UI와 저장 흐름을 렌더링합니다.
export function AdminImageEditor() {
  const { currentUser, adminPageEditMode, setAdminPageEditMode } = useAppStore();
  const location = useLocation();
  const isAdmin = useMemo(() => canEditPage(currentUser), [currentUser]);

  const [imageOverrides, setImageOverrides] = useState(() => readOverrides(IMAGE_STORAGE_KEY));
  const [textOverrides, setTextOverrides] = useState(() => readOverrides(TEXT_STORAGE_KEY));
  const [videoOverrides, setVideoOverrides] = useState(() => readOverrides(VIDEO_STORAGE_KEY));
  const [positionOverrides, setPositionOverrides] = useState(() => readOverrides(POSITION_STORAGE_KEY));
  const [sizeOverrides, setSizeOverrides] = useState(() => readOverrides(SIZE_STORAGE_KEY));
  const [classOverrides, setClassOverrides] = useState(() => readOverrides(CLASS_STORAGE_KEY));
  const [panelPosition, setPanelPosition] = useState(null);
  const [activeType, setActiveType] = useState(null);
  const [isInlineTextEditing, setIsInlineTextEditing] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [imgRatioInput, setImgRatioInput] = useState("");
  const [imgObjectFit, setImgObjectFit] = useState("contain");
  const [cardRect, setCardRect] = useState(null);
  const [richTextRect, setRichTextRect] = useState(null);
  const [richTextSurfaceStyle, setRichTextSurfaceStyle] = useState({});
  const [richTextInitialContent, setRichTextInitialContent] = useState("");

  const imageOverridesRef = useRef(imageOverrides);
  const textOverridesRef = useRef(textOverrides);
  const videoOverridesRef = useRef(videoOverrides);
  const positionOverridesRef = useRef(positionOverrides);
  const sizeOverridesRef = useRef(sizeOverrides);
  const classOverridesRef = useRef(classOverrides);
  const activeElementRef = useRef(null);
  const activeTypeRef = useRef(activeType);
  const isInlineTextEditingRef = useRef(false);
  const panelRef = useRef(null);
  const fileInputRef = useRef(null);
  const rafRef = useRef(0);
  const observerRef = useRef(null);
  const textSessionRef = useRef(null);
  const dragRef = useRef(null);
  const resizeDragRef = useRef(null);
  const imagePositionDragRef = useRef(null);
  const applyOverridesToPageRef = useRef(null);
  const dragAutoScrollRef = useRef({
    rafId: 0,
    lastFrameTime: 0,
    velocityY: 0,
    lastClientX: 0,
    lastClientY: 0,
  });

  useEffect(() => {
    imageOverridesRef.current = imageOverrides;
  }, [imageOverrides]);

  useEffect(() => {
    textOverridesRef.current = textOverrides;
  }, [textOverrides]);

  useEffect(() => {
    videoOverridesRef.current = videoOverrides;
  }, [videoOverrides]);

  useEffect(() => {
    positionOverridesRef.current = positionOverrides;
  }, [positionOverrides]);

  useEffect(() => {
    sizeOverridesRef.current = sizeOverrides;
  }, [sizeOverrides]);

  useEffect(() => {
    classOverridesRef.current = classOverrides;
  }, [classOverrides]);

  useEffect(() => {
    activeTypeRef.current = activeType;
  }, [activeType]);

  useEffect(() => {
    isInlineTextEditingRef.current = isInlineTextEditing;
  }, [isInlineTextEditing]);

  useEffect(() => {
    if (!isAdmin || !adminPageEditMode) return;
    import("./AdminRichTextInlineEditor.jsx");
  }, [adminPageEditMode, isAdmin]);

  // DB에서 override를 불러와 localStorage와 병합한다 (DB가 원본).
  useEffect(() => {
    if (!isAdmin) return;
    // 백엔드 응답 형식: { overrides: { image: {...}, text: {...}, ... } }
    fetchOverridesFromDb().then((data) => {
      const grouped = data?.overrides;
      if (!grouped || typeof grouped !== "object") return;
      const mergeAndApply = (storageKey, type, setter, ref) => {
        const local = readOverrides(storageKey);
        const merged = { ...local, ...(grouped[type] || {}) };
        saveOverrides(storageKey, merged);
        ref.current = merged;
        setter(merged);
      };
      mergeAndApply(IMAGE_STORAGE_KEY, "image", setImageOverrides, imageOverridesRef);
      mergeAndApply(TEXT_STORAGE_KEY, "text", setTextOverrides, textOverridesRef);
      mergeAndApply(VIDEO_STORAGE_KEY, "video", setVideoOverrides, videoOverridesRef);
      mergeAndApply(POSITION_STORAGE_KEY, "position", setPositionOverrides, positionOverridesRef);
      mergeAndApply(SIZE_STORAGE_KEY, "size", setSizeOverrides, sizeOverridesRef);
      mergeAndApply(CLASS_STORAGE_KEY, "class", setClassOverrides, classOverridesRef);
      // ref가 모두 갱신된 뒤 DOM에 재적용한다
      requestAnimationFrame(() => applyOverridesToPageRef.current?.());
    });
  }, [isAdmin]);

  // 인라인 편집 종료 시 현재 DOM 값과 저장소 값을 함께 정리한다.
  const finishInlineTextEditing = useCallback(
    (save = true, htmlValue = "") => {
      const session = textSessionRef.current;
      if (!session) {
        setIsInlineTextEditing(false);
        isInlineTextEditingRef.current = false;
        return;
      }

      const { target, snapshot, previousWhiteSpace } = session;

      target.classList.remove("admin-inline-text-editing");
      target.removeAttribute("data-admin-inline-editing");

      // htmlValue가 명시적으로 전달된 경우에만 저장한다.
      // save=true여도 htmlValue가 없으면 (외부 클릭, 버튼 오클릭 등) 스냅샷으로 복원한다.
      const hasExplicitHtml = save && Boolean(htmlValue);

      if (!hasExplicitHtml) {
        applyTextValue(target, snapshot);
        if (previousWhiteSpace) {
          target.style.whiteSpace = previousWhiteSpace;
        } else {
          target.style.removeProperty("white-space");
        }
      }

      if (hasExplicitHtml) {
        const key = getEditableElementKey(target, location.pathname);
        const normalizedValue = htmlValue.trim();
        if (target.matches(EDITABLE_TEXT_GROUP_SELECTOR) && !getRichTextPlainText(normalizedValue)) {
          applyTextValue(target, snapshot);
          window.alert("텍스트 전체가 비어 있어 저장하지 않았습니다. 기존 내용을 유지합니다.");
        } else {
        applyTextValue(target, normalizedValue);
        const nextOverrides = { ...textOverridesRef.current, [key]: normalizedValue };
        textOverridesRef.current = nextOverrides;
        setTextOverrides(nextOverrides);
        saveOverrides(TEXT_STORAGE_KEY, nextOverrides);
        syncOverrideToDb("text", key, normalizedValue);
        }
      }

      textSessionRef.current = null;
      setRichTextRect(null);
      setRichTextSurfaceStyle({});
      setRichTextInitialContent("");
      setIsInlineTextEditing(false);
      isInlineTextEditingRef.current = false;
      // 편집 중 panelPosition은 TipTap 툴바 기준 좌표(panelWidth=460)로 계산된 값이라
      // 저장/취소 직후 일반 패널(panelWidth=230)과 위치가 달라 깜빡임이 생긴다.
      // null로 초기화하면 패널이 잠깐 숨겨졌다가 RAF에서 올바른 위치로 나타난다.
      setPanelPosition(null);
    },
    [location.pathname]
  );

  const clearActiveTarget = useCallback(() => {
    if (isInlineTextEditingRef.current) {
      return;
    }

    finishInlineTextEditing(true);

    if (activeElementRef.current) {
      activeElementRef.current.classList.remove("admin-editing-selected");
    }

    activeElementRef.current = null;
    activeTypeRef.current = null;
    setActiveType(null);
    setPanelPosition(null);
    setCardRect(null);
    setRichTextRect(null);
    setRichTextSurfaceStyle({});
  }, [finishInlineTextEditing]);

  // 편집 패널이 대상 요소를 가리지 않도록 타입별로 위치를 계산한다.
  const updatePanelPosition = useCallback(() => {
    const target = activeElementRef.current;
    if (!target || !document.body.contains(target)) {
      clearActiveTarget();
      return;
    }

    const rect = target.getBoundingClientRect();
    const panelWidth = activeTypeRef.current === "text" && isInlineTextEditingRef.current ? 460 : 230;
    const panelHeight = 52;

    if (activeTypeRef.current === "text") {
      if (isInlineTextEditingRef.current) {
        const computed = window.getComputedStyle(target);
        setRichTextRect({
          top: rect.top,
          left: rect.left,
          width: Math.max(160, rect.width),
          minHeight: Math.max(44, rect.height),
        });
        setRichTextSurfaceStyle({
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          letterSpacing: computed.letterSpacing,
          color: computed.color,
          textAlign: computed.textAlign,
        });
      }
      if (target.matches(EDITABLE_TEXT_GROUP_SELECTOR) && !isInlineTextEditingRef.current) {
        setCardRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      } else {
        setCardRect(null);
      }
      const preferredTop = rect.top - panelHeight - 10;
      const fallbackTop = rect.bottom + 10;
      const top = Math.max(
        8,
        Math.min(
          window.innerHeight - panelHeight - 8,
          preferredTop >= 8 ? preferredTop : fallbackTop
        )
      );
      const centeredLeft = rect.left + rect.width / 2 - panelWidth / 2;
      const left = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, centeredLeft));
      setPanelPosition({ top, left });
      return;
    }

    if (activeTypeRef.current === "card") {
      const top = Math.min(rect.top + 10, rect.bottom - panelHeight - 4);
      const left = Math.max(rect.left + 4, rect.right - panelWidth - 4);
      setPanelPosition({ top, left });
      setCardRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      return;
    }

    const top = Math.max(8, rect.top + 10);
    const left = Math.min(window.innerWidth - panelWidth - 8, Math.max(8, rect.right - panelWidth));
    setPanelPosition({ top, left });
  }, [clearActiveTarget]);

  // 텍스트는 contentEditable 기반으로 즉시 수정하고, Ctrl/Cmd + Enter로 저장한다.
  const startInlineTextEditing = useCallback(
    (target) => {
      if (!(target instanceof HTMLElement)) return;
      if (activeTypeRef.current !== "text") return;

      finishInlineTextEditing(true);

      const snapshot = target.innerHTML || target.textContent || "";
      const previousWhiteSpace = target.style.whiteSpace || "";
      target.dataset.adminInlineEditing = "true";
      target.classList.add("admin-inline-text-editing");

      const key = getEditableElementKey(target, location.pathname);
      const savedValue = textOverridesRef.current[key];
      const editorHtml = textToEditorHtmlForTarget(typeof savedValue === "string" ? savedValue : snapshot, target);
      setRichTextInitialContent(editorHtml);

      textSessionRef.current = {
        target,
        snapshot,
        previousWhiteSpace,
      };

      setIsInlineTextEditing(true);
      isInlineTextEditingRef.current = true;

      requestAnimationFrame(() => {
        updatePanelPosition();
      });
    },
    [finishInlineTextEditing, location.pathname, updatePanelPosition]
  );

  // 화면이 다시 렌더링되거나 라우트가 바뀌어도 저장된 덮어쓰기 값을 재적용한다.
  const applyOverridesToPage = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;

      // override 적용이 MO를 재트리거해 RAF → MO → RAF 무한 루프가 되지 않도록
      // override를 일괄 적용하는 동안 MO를 잠시 해제한다.
      observerRef.current?.disconnect();

      try {

      const editableImages = Array.from(document.querySelectorAll(EDITABLE_IMAGE_SELECTOR)).filter(
        (element) => element instanceof HTMLElement
      );

      editableImages.forEach((element) => {
        rememberOriginalImageValue(element);
        const key = getEditableElementKey(element, location.pathname);

        if (isAdmin && adminPageEditMode) {
          element.classList.add("admin-editable-image");
        } else {
          element.classList.remove("admin-editable-image");
        }

        const overrideValue = imageOverridesRef.current[key];
        if (overrideValue && !String(overrideValue).startsWith("blob:")) {
          applyImageValue(element, overrideValue);
        } else if (overrideValue && String(overrideValue).startsWith("blob:")) {
          const { [key]: _removed, ...rest } = imageOverridesRef.current;
          imageOverridesRef.current = rest;
          saveOverrides(IMAGE_STORAGE_KEY, rest);
        }

        const videoOverrideValue = videoOverridesRef.current[key];
        if (videoOverrideValue) {
          applyVideoOverlay(element, videoOverrideValue);
        }

        const sizeOverrideValue = sizeOverridesRef.current[key];
        if (sizeOverrideValue) {
          applySizeValue(element, sizeOverrideValue);
        }
      });

      const editableTextGroups = Array.from(document.querySelectorAll(EDITABLE_TEXT_GROUP_SELECTOR)).filter(
        (element) => element instanceof HTMLElement
      );

      editableTextGroups.forEach((element) => {
        if (element.closest(".admin-image-editor-panel")) return;
        if (element.closest(".admin-rich-text-modal")) return;
        rememberOriginalTextValue(element);
        const key = getEditableElementKey(element, location.pathname);

        if (isAdmin && adminPageEditMode) {
          element.classList.add("admin-editable-text");
        } else {
          element.classList.remove("admin-editable-text");
        }

        if (element.dataset.adminInlineEditing === "true") return;

        const overrideValue = textOverridesRef.current[key];
        if (typeof overrideValue === "string") {
          if (!getRichTextPlainText(overrideValue)) {
            const nextOverrides = { ...textOverridesRef.current };
            delete nextOverrides[key];
            textOverridesRef.current = nextOverrides;
            setTextOverrides(nextOverrides);
            saveOverrides(TEXT_STORAGE_KEY, nextOverrides);
            deleteOverrideFromDb("text", key);
            restoreOriginalTextValue(element);
            return;
          }
          applyTextValue(element, overrideValue);
        }

        const sizeSaved = sizeOverridesRef.current[key];
        if (element.matches(".staff-split")) {
          if (element.dataset.adminSizeCustomized === "true") {
            restoreOriginalSizeValue(element);
          }
          element.style.removeProperty("height");
          element.style.removeProperty("min-height");
          element.style.removeProperty("overflow");
          if (sizeSaved) {
            const nextOverrides = { ...sizeOverridesRef.current };
            delete nextOverrides[key];
            sizeOverridesRef.current = nextOverrides;
            setSizeOverrides(nextOverrides);
            saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
            deleteOverrideFromDb("size", key);
          }
        } else if (sizeSaved) {
          applySizeValue(element, sizeSaved);
        } else if (element.dataset.adminSizeCustomized === "true") {
          restoreOriginalSizeValue(element);
        }
      });

      const editableTexts = Array.from(document.querySelectorAll(EDITABLE_TEXT_SELECTOR)).filter(
        (element) => element instanceof HTMLElement
      );

      editableTexts.forEach((element) => {
        if (element.closest(".admin-image-editor-panel")) return;
        if (element.closest(".admin-rich-text-modal")) return;
        if (element.closest(".admin-rich-text-inline-surface")) return;
        if (element.closest(EDITABLE_TEXT_GROUP_SELECTOR)) {
          element.classList.remove("admin-editable-text");
          return;
        }
        if (
          element.dataset.adminTextEditable === "false" ||
          element.closest("[data-admin-text-editable='false']")
        ) {
          element.classList.remove("admin-editable-text");
          return;
        }

        // 원본값은 빈 요소도 포함해 반드시 먼저 저장한다 (override 적용 전 원본 보존).
        rememberOriginalTextValue(element);
        const key = getEditableElementKey(element, location.pathname);

        if (isAdmin && adminPageEditMode) {
          element.classList.add("admin-editable-text");
        } else {
          element.classList.remove("admin-editable-text");
        }

        if (element.dataset.adminInlineEditing === "true") return;

        const overrideValue = textOverridesRef.current[key];
        if (typeof overrideValue === "string") {
          if (!getRichTextPlainText(overrideValue)) {
            const nextOverrides = { ...textOverridesRef.current };
            delete nextOverrides[key];
            textOverridesRef.current = nextOverrides;
            setTextOverrides(nextOverrides);
            saveOverrides(TEXT_STORAGE_KEY, nextOverrides);
            deleteOverrideFromDb("text", key);
            restoreOriginalTextValue(element);
            return;
          }
          applyTextValue(element, overrideValue);
        }
      });

      const editableCards = Array.from(document.querySelectorAll(DRAGGABLE_CARD_SELECTOR)).filter(
        (el) => isDraggableCardElement(el)
      );

      editableCards.forEach((element) => {
        if (isAdmin && adminPageEditMode) {
          element.classList.add("admin-draggable-card");
          // 카드 내부 img의 브라우저 native 드래그를 막아 카드 단위 드래그만 동작하게 한다
          element.querySelectorAll("img").forEach(img => img.setAttribute("draggable", "false"));
        } else {
          element.classList.remove("admin-draggable-card");
          element.querySelectorAll("img").forEach(img => img.removeAttribute("draggable"));
          return;
        }

        const key = getEditableElementKey(element, location.pathname);

        if (!isHomeMainSectionCard(element)) {
          const saved = positionOverridesRef.current[key];
          if (saved) {
            applyCardTransformValue(element, saved);
          } else if (element.dataset.adminPositionCustomized === "true") {
            element.style.removeProperty("transform");
            element.style.removeProperty("transform-origin");
            element.style.removeProperty("position");
            element.style.removeProperty("z-index");
            element.dataset.adminPositionCustomized = "false";
          }
        }

        const sizeSaved = sizeOverridesRef.current[key];
        if (sizeSaved) {
          applySizeValue(element, sizeSaved);
        } else if (element.dataset.adminSizeCustomized === "true") {
          restoreOriginalSizeValue(element);
        }

        const classSaved = classOverridesRef.current[key];
        if (Array.isArray(classSaved)) {
          CARD_MODIFIER_CLASSES.forEach(cls => element.classList.remove(cls));
          classSaved.forEach(cls => element.classList.add(cls));
        }
      });

      if (activeElementRef.current && !document.body.contains(activeElementRef.current)) {
        clearActiveTarget();
      } else if (activeElementRef.current) {
        updatePanelPosition();
      }

      } finally {
        // override 적용 완료 후 MO 재개 — 이후 React 재렌더로 발생하는 DOM 변경만 감지한다.
        observerRef.current?.observe(document.body, { childList: true, subtree: true });
      }
    });
  }, [clearActiveTarget, isAdmin, adminPageEditMode, location.pathname, updatePanelPosition]);

  // ref를 항상 최신 함수로 유지해 비동기 컨텍스트에서 안전하게 호출한다
  useEffect(() => {
    applyOverridesToPageRef.current = applyOverridesToPage;
  }, [applyOverridesToPage]);

  // 관리자라면 편집 모드와 무관하게 MutationObserver를 항상 실행해
  // 동적으로 렌더링된 요소에도 저장된 override를 재적용한다
  useEffect(() => {
    if (!isAdmin) return undefined;
    const observer = new MutationObserver(() => {
      applyOverridesToPageRef.current?.();
    });
    observerRef.current = observer;
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observerRef.current = null;
      observer.disconnect();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && adminPageEditMode) {
      document.body.classList.add("admin-image-editor-on");
    } else {
      document.body.classList.remove("admin-image-editor-on");
      if (isInlineTextEditingRef.current) {
        finishInlineTextEditing(false);
      }
      clearActiveTarget();
    }

    applyOverridesToPage();

    return () => {
      document.body.classList.remove("admin-image-editor-on");
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [applyOverridesToPage, clearActiveTarget, finishInlineTextEditing, isAdmin, adminPageEditMode]);

  const resetPositionOverridesForPath = useCallback(
    (pathname = location.pathname) => {
      const prefix = `${pathname}::`;
      const current = positionOverridesRef.current || {};
      const nextOverrides = {};
      const removedKeys = [];

      Object.entries(current).forEach(([key, value]) => {
        if (String(key).startsWith(prefix)) {
          removedKeys.push(key);
          return;
        }
        nextOverrides[key] = value;
      });

      if (!removedKeys.length) return false;

      positionOverridesRef.current = nextOverrides;
      setPositionOverrides(nextOverrides);
      saveOverrides(POSITION_STORAGE_KEY, nextOverrides);
      removedKeys.forEach((key) => deleteOverrideFromDb("position", key));

      // 위치 초기화 시 클래스 오버라이드도 함께 초기화한다
      const currentClass = classOverridesRef.current || {};
      const nextClassOverrides = {};
      Object.entries(currentClass).forEach(([key, value]) => {
        if (String(key).startsWith(prefix)) {
          deleteOverrideFromDb("class", key);
          return;
        }
        nextClassOverrides[key] = value;
      });
      classOverridesRef.current = nextClassOverrides;
      setClassOverrides(nextClassOverrides);
      saveOverrides(CLASS_STORAGE_KEY, nextClassOverrides);

      if (activeTypeRef.current === "card") {
        clearActiveTarget();
      }

      applyOverridesToPage();
      return true;
    },
    [applyOverridesToPage, clearActiveTarget, location.pathname]
  );

  useEffect(() => {
    if (!isAdmin || !adminPageEditMode) return undefined;

    const onResetPositions = (event) => {
      const eventPathname = String(event?.detail?.pathname || location.pathname);
      if (eventPathname !== location.pathname) return;
      resetPositionOverridesForPath(eventPathname);
    };

    window.addEventListener(RESET_POSITION_EVENT, onResetPositions);
    return () => {
      window.removeEventListener(RESET_POSITION_EVENT, onResetPositions);
    };
  }, [adminPageEditMode, isAdmin, location.pathname, resetPositionOverridesForPath]);

  useEffect(() => {
    if (!isAdmin && adminPageEditMode) {
      setAdminPageEditMode(false);
    }
  }, [isAdmin, adminPageEditMode, setAdminPageEditMode]);

  const startResizeDrag = useCallback((e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    const target = activeElementRef.current;
    if (!target) return;
    const isStaffSplit = target instanceof HTMLElement && target.matches(".staff-split");
    const staffParts = target instanceof HTMLElement ? getStaffSplitParts(target) : null;
    const staffImage = staffParts?.image || null;
    const staffText = staffParts?.text || null;
    resizeDragRef.current = {
      element: target,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: target.offsetWidth,
      startHeight: target.offsetHeight,
      isStaffSplit,
      isStaffImageOrText: Boolean(
        target instanceof HTMLElement &&
        staffParts &&
        (target === staffParts.image || target === staffParts.text)
      ),
      staffImage,
      staffText,
      staffImageStartHeight: staffImage instanceof HTMLElement ? staffImage.offsetHeight : 0,
      staffTextStartHeight: staffText instanceof HTMLElement ? staffText.offsetHeight : 0,
    };
  }, []);

  useEffect(() => {
    if (!isAdmin || !adminPageEditMode) return undefined;

    const onResizeMouseMove = (e) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const isStaffSplit = drag.isStaffSplit || drag.element.matches(".staff-split");
      if (isStaffSplit) {
        if (drag.direction === "e" || drag.direction === "se") {
          drag.element.style.width = `${Math.max(320, drag.startWidth + dx)}px`;
        }
        if (drag.direction === "s" || drag.direction === "se") {
          const nextHeight = `${Math.max(120, Math.max(drag.staffImageStartHeight, drag.staffTextStartHeight) + dy)}px`;
          applyStaffPairHeight(drag.staffImage, drag.staffText, nextHeight);
        }
        const r = drag.element.getBoundingClientRect();
        setCardRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
        return;
      }
      drag.element.style.overflow = drag.element.matches(EDITABLE_TEXT_GROUP_SELECTOR) ? "auto" : "hidden";
      if (drag.direction === "e" || drag.direction === "se") {
        drag.element.style.width = `${Math.max(80, drag.startWidth + dx)}px`;
      }
      if (drag.direction === "s" || drag.direction === "se") {
        drag.element.style.height = `${Math.max(40, drag.startHeight + dy)}px`;
        if (drag.isStaffImageOrText) {
          applyStaffPairHeight(drag.staffImage, drag.staffText, drag.element.style.height);
        }
      }
      const r = drag.element.getBoundingClientRect();
      setCardRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    };

    const onResizeMouseUp = () => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      if (drag.isStaffSplit || drag.element.matches(".staff-split")) {
        const nextOverrides = { ...sizeOverridesRef.current };
        const saveChildSize = (child, value) => {
          if (!(child instanceof HTMLElement)) return;
          const key = getEditableElementKey(child, location.pathname);
          nextOverrides[key] = value;
          syncOverrideToDb("size", key, value);
        };
        saveChildSize(drag.staffImage, getStaffImageSizeValue(drag.staffImage));
        saveChildSize(drag.staffText, getStaffTextSizeValue(drag.staffText));
        const key = getEditableElementKey(drag.element, location.pathname);
        if (drag.element.style.width) {
          nextOverrides[key] = { width: drag.element.style.width };
          syncOverrideToDb("size", key, nextOverrides[key]);
        } else {
          delete nextOverrides[key];
          deleteOverrideFromDb("size", key);
        }
        sizeOverridesRef.current = nextOverrides;
        setSizeOverrides(nextOverrides);
        saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
        resizeDragRef.current = null;
        updatePanelPosition();
        return;
      }
      if (drag.isStaffImageOrText) {
        const nextOverrides = { ...sizeOverridesRef.current };
        const saveChildSize = (child, value) => {
          if (!(child instanceof HTMLElement)) return;
          const key = getEditableElementKey(child, location.pathname);
          nextOverrides[key] = value;
          syncOverrideToDb("size", key, value);
        };
        saveChildSize(drag.staffImage, getStaffImageSizeValue(drag.staffImage));
        saveChildSize(drag.staffText, getStaffTextSizeValue(drag.staffText));
        sizeOverridesRef.current = nextOverrides;
        setSizeOverrides(nextOverrides);
        saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
        resizeDragRef.current = null;
        updatePanelPosition();
        return;
      }
      const key = getEditableElementKey(drag.element, location.pathname);
      const sizeValue = {
        width: drag.element.style.width || undefined,
        height: drag.element.style.height || undefined,
        overflow: drag.element.style.overflow || undefined,
      };
      const nextOverrides = { ...sizeOverridesRef.current, [key]: sizeValue };
      sizeOverridesRef.current = nextOverrides;
      setSizeOverrides(nextOverrides);
      saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
      syncOverrideToDb("size", key, sizeValue);
      resizeDragRef.current = null;
    };

    document.addEventListener("mousemove", onResizeMouseMove);
    document.addEventListener("mouseup", onResizeMouseUp);
    return () => {
      document.removeEventListener("mousemove", onResizeMouseMove);
      document.removeEventListener("mouseup", onResizeMouseUp);
    };
  }, [isAdmin, adminPageEditMode, location.pathname, updatePanelPosition]);

  useEffect(() => {
    if (!isAdmin || !adminPageEditMode) return undefined;

    const activateTarget = (target, type) => {
      if (type === "image") {
        rememberOriginalImageValue(target);
        // 더블클릭으로 이미지를 활성화할 때 이미지 내부 텍스트가 선택 상태로 남는 경우
        // 이후 패널 버튼 클릭 시 getSelectedTextTarget이 그 선택을 잡아 타입이 텍스트로 바뀐다.
        window.getSelection()?.removeAllRanges();
      } else {
        rememberOriginalTextValue(target);
      }

      getEditableElementKey(target, location.pathname);

      if (activeElementRef.current && activeElementRef.current !== target) {
        activeElementRef.current.classList.remove("admin-editing-selected");
      }

      activeElementRef.current = target;
      activeTypeRef.current = type;
      setActiveType(type);
      target.classList.add("admin-editing-selected");
      setPanelPosition({ top: 0, left: 0 });
      requestAnimationFrame(updatePanelPosition);
    };

    const onMouseUpCapture = () => {
      if (isInlineTextEditingRef.current) return;
      const selectedTextTarget = getSelectedTextTarget();
      if (!selectedTextTarget) return;
      activateTarget(selectedTextTarget, "text");
    };

    const onImagePositionMouseDown = (event) => {
      if (isInlineTextEditingRef.current) return;
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(".admin-image-editor-panel, .admin-rich-text-modal, .admin-resize-handle")) return;
      const target = activeElementRef.current;
      if (!(target instanceof HTMLElement) || activeTypeRef.current !== "image") return;
      if (!(event.target instanceof Node) || !target.contains(event.target)) return;
      if (!target.matches(EDITABLE_IMAGE_SELECTOR)) return;

      const rect = target.getBoundingClientRect();
      const computed = window.getComputedStyle(target);
      const currentPosition = target.tagName === "IMG"
        ? parsePositionPercent(target.style.objectPosition || computed.objectPosition || DEFAULT_IMAGE_POSITION)
        : parsePositionPercent(target.style.backgroundPosition || computed.backgroundPosition || DEFAULT_IMAGE_POSITION);
      imagePositionDragRef.current = {
        target,
        startX: event.clientX,
        startY: event.clientY,
        rectWidth: Math.max(1, rect.width),
        rectHeight: Math.max(1, rect.height),
        startPositionX: currentPosition.x,
        startPositionY: currentPosition.y,
      };
      dragRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onImagePositionMouseMove = (event) => {
      const drag = imagePositionDragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const nextX = clampPercent(drag.startPositionX - (dx / drag.rectWidth) * 100);
      const nextY = clampPercent(drag.startPositionY - (dy / drag.rectHeight) * 100);
      const nextPosition = `${nextX.toFixed(1)}% ${nextY.toFixed(1)}%`;
      if (drag.target.tagName === "IMG") {
        drag.target.style.objectPosition = nextPosition;
      } else {
        drag.target.style.backgroundPosition = nextPosition;
      }
      event.preventDefault();
    };

    const onImagePositionMouseUp = () => {
      const drag = imagePositionDragRef.current;
      if (!drag) return;
      const key = getEditableElementKey(drag.target, location.pathname);
      const currentSize = sizeOverridesRef.current[key] || {};
      const positionValue = drag.target.tagName === "IMG"
        ? { objectPosition: drag.target.style.objectPosition || DEFAULT_IMAGE_POSITION }
        : { backgroundPosition: drag.target.style.backgroundPosition || DEFAULT_IMAGE_POSITION };
      const nextSizeValue = {
        ...currentSize,
        ...positionValue,
      };
      const nextOverrides = { ...sizeOverridesRef.current, [key]: nextSizeValue };
      sizeOverridesRef.current = nextOverrides;
      setSizeOverrides(nextOverrides);
      saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
      syncOverrideToDb("size", key, nextSizeValue);
      imagePositionDragRef.current = null;
      updatePanelPosition();
    };

    const onImageZoomWheel = (event) => {
      if (!event.ctrlKey) return;
      if (isInlineTextEditingRef.current) return;
      const target = activeElementRef.current;
      if (!(target instanceof HTMLElement) || activeTypeRef.current !== "image") return;
      if (!(event.target instanceof Node) || !target.contains(event.target)) return;
      if (!isBackgroundImageElement(target)) return;

      event.preventDefault();
      event.stopPropagation();

      const key = getEditableElementKey(target, location.pathname);
      const currentSize = sizeOverridesRef.current[key] || {};
      const computed = window.getComputedStyle(target);
      const currentZoom = parseImageZoom(
        target.style.backgroundSize ||
        currentSize.backgroundSize ||
        computed.backgroundSize
      );
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextZoom = clampImageZoom(currentZoom + direction * IMAGE_ZOOM_STEP);
      const nextBackgroundSize = getImageZoomSizeValue(nextZoom);
      const nextPosition = target.style.backgroundPosition || currentSize.backgroundPosition || computed.backgroundPosition || DEFAULT_IMAGE_POSITION;

      target.style.backgroundSize = nextBackgroundSize;
      target.style.backgroundPosition = nextPosition;
      target.style.backgroundRepeat = "no-repeat";

      const nextSizeValue = {
        ...currentSize,
        width: currentSize.width || target.style.width || "100%",
        height: currentSize.height || target.style.height || undefined,
        minHeight: currentSize.minHeight || target.style.minHeight || "0px",
        overflow: currentSize.overflow || target.style.overflow || "hidden",
        objectFit: "cover",
        backgroundSize: nextBackgroundSize,
        backgroundPosition: nextPosition,
      };
      const nextOverrides = { ...sizeOverridesRef.current, [key]: nextSizeValue };
      sizeOverridesRef.current = nextOverrides;
      setSizeOverrides(nextOverrides);
      saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
      syncOverrideToDb("size", key, nextSizeValue);
      updatePanelPosition();
    };

    const onClickCapture = (event) => {
      if (isInlineTextEditingRef.current) return;
      // 패널 내부 클릭이면 잔류 텍스트 선택으로 인한 오작동을 막기 위해 즉시 리턴한다.
      // (더블클릭으로 이미지 활성화 시 이미지 내부 span 텍스트가 선택될 수 있고,
      //  이후 파일선택 버튼 클릭 시 getSelectedTextTarget이 그 선택을 잡아 텍스트 타입으로 전환됨)
      if (event.target instanceof Element && event.target.closest(".admin-image-editor-panel")) return;
      const selectedTextTarget = getSelectedTextTarget();
      if (selectedTextTarget) {
        event.preventDefault();
        event.stopPropagation();
        activateTarget(selectedTextTarget, "text");
        return;
      }

      const clickedTextTarget = findEditableTextTarget(event.target);
      if (clickedTextTarget) {
        event.preventDefault();
        event.stopPropagation();
        activateTarget(clickedTextTarget, "text");
      }
    };

    const onDoubleClickCapture = (event) => {
      if (event.target instanceof Element && event.target.closest(".admin-rich-text-modal")) return;
      if (isInlineTextEditingRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const imageTarget = findEditableImageTarget(event.target);
      if (imageTarget) {
        event.preventDefault();
        event.stopPropagation();
        activateTarget(imageTarget, "image");
        return;
      }

      const textTarget = findEditableTextTarget(event.target);
      if (textTarget) {
        event.preventDefault();
        event.stopPropagation();
        activateTarget(textTarget, "text");
        window.setTimeout(() => {
          if (!document.body.contains(textTarget)) return;
          if (isInlineTextEditingRef.current) return;
          if (activeElementRef.current !== textTarget) {
            activeElementRef.current?.classList.remove("admin-editing-selected");
            activeElementRef.current = textTarget;
            textTarget.classList.add("admin-editing-selected");
          }
          activeTypeRef.current = "text";
          setActiveType("text");
          startInlineTextEditing(textTarget);
        }, 0);
      }
    };

    const onPointerDown = (event) => {
      if (isInlineTextEditingRef.current) return;

      const target = event.target;
      const activeElement = activeElementRef.current;
      if (!activeElement || !(target instanceof Node)) return;
      if (target instanceof Element && activeTypeRef.current === "card") {
        const textTarget = findEditableTextTarget(target);
        if (textTarget && activeElement.contains(textTarget)) {
          event.stopPropagation();
          activateTarget(textTarget, "text");
          return;
        }
      }
      if (panelRef.current?.contains(target) || activeElement.contains(target)) return;
      // TipTap 툴바(AdminRichTextInlineEditor의 panel 포함)와 편집 서피스 내부 클릭 허용
      if (target instanceof Element && target.closest(".admin-image-editor-panel")) return;
      if (target instanceof Element && target.closest(".admin-rich-text-inline-surface")) return;
      if (target instanceof Element && target.closest(".admin-rich-text-modal")) return;
      if (event.ctrlKey) return;
      // 리사이즈 핸들 클릭 시 선택 해제 방지
      if (target instanceof Element && target.classList.contains("admin-resize-handle")) return;
      clearActiveTarget();
    };

    const activateCardTarget = (card) => {
      if (!(card instanceof HTMLElement)) return;

      getEditableElementKey(card, location.pathname);

      if (activeElementRef.current && activeElementRef.current !== card) {
        activeElementRef.current.classList.remove("admin-editing-selected");
      }

      activeElementRef.current = card;
      activeTypeRef.current = "card";
      setActiveType("card");
      card.classList.add("admin-editing-selected");
      setPanelPosition({ top: 0, left: 0 });
      requestAnimationFrame(() => {
        updatePanelPosition();
        const r = card.getBoundingClientRect();
        setCardRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
      });
    };

    const stopDragAutoScroll = () => {
      const state = dragAutoScrollRef.current;
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
      }
      state.rafId = 0;
      state.lastFrameTime = 0;
      state.velocityY = 0;
    };

    const runDragAutoScroll = (timestamp) => {
      const state = dragAutoScrollRef.current;
      const drag = dragRef.current;
      if (!drag || !drag.isDragging || state.velocityY === 0) {
        stopDragAutoScroll();
        return;
      }

      const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScrollTop <= 0) {
        stopDragAutoScroll();
        return;
      }

      const currentScrollTop = window.scrollY;
      const elapsed = state.lastFrameTime ? Math.min(64, timestamp - state.lastFrameTime) : 16;
      state.lastFrameTime = timestamp;
      const deltaY = (state.velocityY * elapsed) / 16;
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, currentScrollTop + deltaY));

      if (Math.abs(nextScrollTop - currentScrollTop) > 0.1) {
        window.scrollTo({ top: nextScrollTop, behavior: "auto" });
      } else {
        stopDragAutoScroll();
        return;
      }

      const dx = state.lastClientX - drag.startMouseX;
      const dy = state.lastClientY + window.scrollY - drag.startPageY;
      const newX = drag.startOffsetX + dx;
      const newY = drag.startOffsetY + dy;

      applyCardTransformValue(
        drag.element,
        { x: newX, y: newY, scaleX: drag.startScaleX, scaleY: drag.startScaleY },
        "100"
      );

      state.rafId = requestAnimationFrame(runDragAutoScroll);
    };

    const onCtrlMouseDown = (event) => {
      if (event.button !== 0) return;
      if (!isAdmin || !adminPageEditMode) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".admin-image-editor-panel")) return;
      if (isInlineTextEditingRef.current) return;

      const activeElement = activeElementRef.current;
      if (
        activeTypeRef.current === "image" &&
        activeElement instanceof HTMLElement &&
        activeElement.contains(event.target)
      ) {
        return;
      }

      // 버튼, 링크, 입력 요소 클릭은 드래그로 가로채지 않는다
      if (event.target.closest("button, a, input, select, textarea, label")) return;

      // Ctrl 없이 텍스트 편집 요소를 직접 클릭할 때는 카드 드래그보다 텍스트 편집을 우선한다
      if (!event.ctrlKey && !event.metaKey && findEditableTextTarget(event.target)) return;

      // 이미지 편집 대상 클릭 시 이미지 에디터 우선 — 단, 드래그 가능 카드 내부라면 카드 드래그 우선
      const card =
        findHomeMainSectionCardAtPoint(event.clientX, event.clientY, activeElementRef.current) ||
        findDraggableCardFromElement(event.target);
      const isEditableImageTarget = event.target.matches(EDITABLE_IMAGE_SELECTOR) || Boolean(event.target.closest(".staff-image-slot, [role='img']"));
      if (isEditableImageTarget && !card) return;
      if (!card) return;
      activateCardTarget(card);

      // 브라우저 native drag ghost(이미지 복사본 유령) 방지
      event.preventDefault();

      const key = getEditableElementKey(card, location.pathname);
      const saved = normalizeCardTransform(positionOverridesRef.current[key]);

      dragRef.current = {
        element: card,
        key,
        startMouseX: event.clientX,
        startPageY: event.clientY + window.scrollY,
        startOffsetX: saved.x,
        startOffsetY: saved.y,
        startScaleX: saved.scaleX,
        startScaleY: saved.scaleY,
        startRect: card.getBoundingClientRect(),
        isDashboardCard: isDashboardCardElement(card),
        layoutByKey: new Map(),
        hoverTarget: null,
        isDragging: false,
      };

      const draggableCards = Array.from(document.querySelectorAll(DRAGGABLE_CARD_SELECTOR)).filter(
        (candidate) => isDraggableCardElement(candidate)
      );
      draggableCards.forEach((candidate) => {
        const candidateKey = getEditableElementKey(candidate, location.pathname);
        const candidateSaved = normalizeCardTransform(positionOverridesRef.current[candidateKey]);
        dragRef.current.layoutByKey.set(candidateKey, {
          rect: candidate.getBoundingClientRect(),
          saved: candidateSaved,
        });
      });

      const autoScrollState = dragAutoScrollRef.current;
      autoScrollState.lastClientX = event.clientX;
      autoScrollState.lastClientY = event.clientY;
      autoScrollState.velocityY = 0;
      autoScrollState.lastFrameTime = 0;

      event.preventDefault();
      event.stopPropagation();
    };

    const onMouseMoveForDrag = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const autoScrollState = dragAutoScrollRef.current;
      autoScrollState.lastClientX = event.clientX;
      autoScrollState.lastClientY = event.clientY;

      const dx = event.clientX - drag.startMouseX;
      const dy = event.clientY + window.scrollY - drag.startPageY;

      if (!drag.isDragging && Math.sqrt(dx * dx + dy * dy) > 5) {
        drag.isDragging = true;
        if (activeElementRef.current && activeElementRef.current !== drag.element) {
          activeElementRef.current.classList.remove("admin-editing-selected");
          activeElementRef.current = null;
          activeTypeRef.current = null;
          setActiveType(null);
          setPanelPosition(null);
          setCardRect(null);
        }
        drag.element.classList.add("admin-card-dragging");
        drag.element.style.pointerEvents = "none";
        drag.element.style.willChange = "transform";
        document.body.style.userSelect = "none";
      }

      if (!drag.isDragging) return;

      const newX = drag.startOffsetX + dx;
      const newY = drag.startOffsetY + dy;

      applyCardTransformValue(
        drag.element,
        { x: newX, y: newY, scaleX: drag.startScaleX, scaleY: drag.startScaleY },
        "100"
      );

      const hoverTarget = findDropTargetAtPoint(event.clientX, event.clientY, drag.element);
      if (drag.hoverTarget && drag.hoverTarget !== hoverTarget) {
        drag.hoverTarget.classList.remove("admin-card-drop-target");
      }
      if (hoverTarget && hoverTarget !== drag.hoverTarget) {
        hoverTarget.classList.add("admin-card-drop-target");
      }
      drag.hoverTarget = hoverTarget;

      autoScrollState.velocityY = resolveVerticalAutoScrollVelocity(event.clientY);
      if (autoScrollState.velocityY !== 0) {
        if (!autoScrollState.rafId) {
          autoScrollState.lastFrameTime = 0;
          autoScrollState.rafId = requestAnimationFrame(runDragAutoScroll);
        }
      } else if (autoScrollState.rafId) {
        stopDragAutoScroll();
      }
    };

    const onMouseUpForDrag = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const autoScrollState = dragAutoScrollRef.current;

      stopDragAutoScroll();

      drag.element.classList.remove("admin-card-dragging");
      drag.element.style.pointerEvents = "";
      drag.element.style.willChange = "";
      document.body.style.userSelect = "";
      if (drag.hoverTarget) {
        drag.hoverTarget.classList.remove("admin-card-drop-target");
      }

      // transition: none이 해제된 뒤 transform 변경이 애니메이션되려면 강제 리플로우 필요
      void drag.element.offsetHeight;

      if (drag.isDragging) {
        let swapTarget = findDropTargetAtPoint(
          autoScrollState.lastClientX,
          autoScrollState.lastClientY,
          drag.element
        );
        if (!swapTarget) {
          const draggedRect = drag.element.getBoundingClientRect();
          const draggedArea = Math.max(1, draggedRect.width * draggedRect.height);

          const sourceParent = drag.element.parentElement;
          const allCardElements = Array.from(document.querySelectorAll(DRAGGABLE_CARD_SELECTOR)).filter(
            (candidate) => isDraggableCardElement(candidate)
              && isCompatibleCardDropTarget(candidate, drag.element)
          );
          const sameLevelCards = sourceParent
            ? allCardElements.filter((candidate) => candidate.parentElement === sourceParent)
            : [];

          const findBestOverlapTarget = (cardElements) => {
            let bestTarget = null;
            let maxOverlapArea = 0;

            cardElements.forEach((candidate) => {
              const candidateRect = candidate.getBoundingClientRect();
              const overlapArea = getRectOverlapArea(draggedRect, candidateRect);
              if (overlapArea <= 0) return;

              const candidateArea = Math.max(1, candidateRect.width * candidateRect.height);
              const overlapRatio = overlapArea / Math.min(draggedArea, candidateArea);
              if (overlapRatio < CARD_SWAP_OVERLAP_RATIO) return;

              if (overlapArea <= maxOverlapArea) return;
              maxOverlapArea = overlapArea;
              bestTarget = candidate;
            });

            return bestTarget;
          };

          swapTarget = findBestOverlapTarget(sameLevelCards) || findBestOverlapTarget(allCardElements);
        }

        drag.element.style.removeProperty("z-index");
        drag.element.dataset.adminPositionCustomized = "true";

        if (swapTarget) {
          const targetKey = getEditableElementKey(swapTarget, location.pathname);
          const isHomeSectionSwap = isHomeMainSectionCard(drag.element) && isHomeMainSectionCard(swapTarget);

          if (isHomeSectionSwap) {
            // 홈 섹션은 CSS flex order로 순서 변경 — transform 미사용
            drag.element.style.removeProperty("transform");
            drag.element.style.removeProperty("transform-origin");
            drag.element.style.removeProperty("position");
            drag.element.style.removeProperty("z-index");
            drag.element.dataset.adminPositionCustomized = "false";

            const id1 = drag.element.id || drag.element.dataset.sectionId || "";
            const id2 = swapTarget.id || swapTarget.dataset.sectionId || "";
            if (id1 && id2) {
              window.dispatchEvent(new CustomEvent("admin-home-section-reorder", { detail: { id1, id2 } }));
            }
          } else {
            const sourceLayout = drag.layoutByKey?.get(drag.key);
            const targetLayout = drag.layoutByKey?.get(targetKey);
            const sourceRect = sourceLayout?.rect || drag.startRect || drag.element.getBoundingClientRect();
            const targetRect = targetLayout?.rect || swapTarget.getBoundingClientRect();
            const sourceSaved = sourceLayout?.saved || {
              x: drag.startOffsetX,
              y: drag.startOffsetY,
              scaleX: drag.startScaleX,
              scaleY: drag.startScaleY,
            };
            const targetSaved = targetLayout?.saved || normalizeCardTransform(positionOverridesRef.current[targetKey]);

            const nextDragOffset = createCardSwapTransform(sourceSaved, sourceRect, targetRect);
            const nextTargetOffset = createCardSwapTransform(targetSaved, targetRect, sourceRect);

            applyCardTransformValue(drag.element, nextDragOffset);
            applyCardTransformValue(swapTarget, nextTargetOffset);

            const nextOverrides = {
              ...positionOverridesRef.current,
              [drag.key]: nextDragOffset,
              [targetKey]: nextTargetOffset,
            };
            positionOverridesRef.current = nextOverrides;
            setPositionOverrides(nextOverrides);
            saveOverrides(POSITION_STORAGE_KEY, nextOverrides);
            syncOverrideToDb("position", drag.key, nextDragOffset);
            syncOverrideToDb("position", targetKey, nextTargetOffset);

            // 두 카드의 레이아웃 modifier 클래스를 교환해 크기/비율도 위치에 맞게 변경한다
            const sourceModifiers = Array.from(drag.element.classList).filter(cls => CARD_MODIFIER_CLASSES.has(cls));
            const targetModifiers = Array.from(swapTarget.classList).filter(cls => CARD_MODIFIER_CLASSES.has(cls));
            if (sourceModifiers.join(",") !== targetModifiers.join(",")) {
              CARD_MODIFIER_CLASSES.forEach(cls => { drag.element.classList.remove(cls); swapTarget.classList.remove(cls); });
              targetModifiers.forEach(cls => drag.element.classList.add(cls));
              sourceModifiers.forEach(cls => swapTarget.classList.add(cls));
              const nextClassOverrides = {
                ...classOverridesRef.current,
                [drag.key]: targetModifiers,
                [targetKey]: sourceModifiers,
              };
              classOverridesRef.current = nextClassOverrides;
              setClassOverrides(nextClassOverrides);
              saveOverrides(CLASS_STORAGE_KEY, nextClassOverrides);
              syncOverrideToDb("class", drag.key, targetModifiers);
              syncOverrideToDb("class", targetKey, sourceModifiers);
            }
          }
        } else {
          // 스왑 대상을 찾지 못하면 원래 위치로 되돌린다
          if (isHomeMainSectionCard(drag.element)) {
            drag.element.style.transition = "transform 0.18s ease";
            drag.element.style.transform = "none";
            setTimeout(() => {
              drag.element.style.removeProperty("transition");
              drag.element.style.removeProperty("transform");
            }, 200);
          } else {
            const savedPos = positionOverridesRef.current[drag.key];
            const snapTransform = normalizeCardTransform(savedPos, {
              x: drag.startOffsetX,
              y: drag.startOffsetY,
              scaleX: drag.startScaleX,
              scaleY: drag.startScaleY,
            });
            drag.element.style.transition = "transform 0.18s ease";
            applyCardTransformValue(drag.element, snapTransform);
            setTimeout(() => { drag.element.style.removeProperty("transition"); }, 200);
          }
        }
      } else {
        activateCardTarget(drag.element);
      }

      dragRef.current = null;
    };

    const onViewportChange = () => {
      if (!activeElementRef.current) return;
      updatePanelPosition();
    };

    document.addEventListener("mouseup", onMouseUpCapture, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("dblclick", onDoubleClickCapture, true);
    document.addEventListener("mousedown", onImagePositionMouseDown, true);
    document.addEventListener("mousemove", onImagePositionMouseMove);
    document.addEventListener("mouseup", onImagePositionMouseUp);
    document.addEventListener("wheel", onImageZoomWheel, { passive: false });
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("mousedown", onCtrlMouseDown, true);
    document.addEventListener("mousemove", onMouseMoveForDrag);
    document.addEventListener("mouseup", onMouseUpForDrag);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);

    applyOverridesToPage();

    return () => {
      const drag = dragRef.current;
      if (drag?.element) {
        drag.element.style.pointerEvents = "";
        drag.element.style.willChange = "";
      }
      if (drag?.hoverTarget) {
        drag.hoverTarget.classList.remove("admin-card-drop-target");
      }
      dragRef.current = null;
      document.removeEventListener("mouseup", onMouseUpCapture, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("dblclick", onDoubleClickCapture, true);
      document.removeEventListener("mousedown", onImagePositionMouseDown, true);
      document.removeEventListener("mousemove", onImagePositionMouseMove);
      document.removeEventListener("mouseup", onImagePositionMouseUp);
      document.removeEventListener("wheel", onImageZoomWheel);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mousedown", onCtrlMouseDown, true);
      document.removeEventListener("mousemove", onMouseMoveForDrag);
      document.removeEventListener("mouseup", onMouseUpForDrag);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      stopDragAutoScroll();
    };
  }, [
    applyOverridesToPage,
    clearActiveTarget,
    isAdmin,
    adminPageEditMode,
    location.pathname,
    startInlineTextEditing,
    updatePanelPosition,
  ]);

  const handleEdit = useCallback(() => {
    const target = activeElementRef.current;
    if (!target) return;

    if (activeTypeRef.current === "image") {
      fileInputRef.current?.click();
      return;
    }

    // TipTap이 이미 열려 있으면 무시한다.
    // 버튼 영역에서 더블클릭 시 두 번째 클릭이 handleEdit을 재호출해
    // 바로 닫히는 깜빡임이 발생하므로 토글 동작을 제거한다.
    if (isInlineTextEditingRef.current) return;

    startInlineTextEditing(target);
  }, [startInlineTextEditing]);

  const handleFileChange = useCallback(
    async (event) => {
      const selectedFile = event.target.files?.[0];
      event.target.value = "";

      if (!selectedFile) return;

      const target = activeElementRef.current;
      if (!target || activeTypeRef.current !== "image") return;

      const key = getEditableElementKey(target, location.pathname);

      if (selectedFile.type.startsWith("video/")) {
        const objectUrl = URL.createObjectURL(selectedFile);
        applyVideoOverlay(target, objectUrl);
        const nextOverrides = { ...videoOverridesRef.current, [key]: objectUrl };
        videoOverridesRef.current = nextOverrides;
        setVideoOverrides(nextOverrides);
        saveOverrides(VIDEO_STORAGE_KEY, nextOverrides);
        // blob URL은 세션 한정이라 DB에 저장하지 않는다.
        updatePanelPosition();
        return;
      }

      if (!selectedFile.type.startsWith("image/")) {
        window.alert("이미지 또는 영상 파일만 업로드할 수 있습니다.");
        return;
      }

      // Base64 대신 서버에 실제 파일 업로드 후 URL 저장 (localStorage/DB 용량 초과 방지)
      try {
        const response = await fetch(`/api/community/uploads?kind=image`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-file-name": encodeURIComponent(selectedFile.name),
          },
          body: selectedFile,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.message || `서버 업로드 실패 (${response.status})`);
        }
        const { assetPath } = data;
        if (!assetPath) throw new Error("업로드 경로 없음");

        applyImageValue(target, assetPath);
        const nextOverrides = { ...imageOverridesRef.current, [key]: assetPath };
        imageOverridesRef.current = nextOverrides;
        setImageOverrides(nextOverrides);
        saveOverrides(IMAGE_STORAGE_KEY, nextOverrides);
        syncOverrideToDb("image", key, assetPath);
        updatePanelPosition();
      } catch (error) {
        window.alert(error?.message || "이미지 업로드에 실패했습니다. 다시 시도해 주세요.");
      }
    },
    [location.pathname, updatePanelPosition]
  );

  const handleUrlApply = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;

    const target = activeElementRef.current;
    if (!target || activeTypeRef.current !== "image") return;

    const key = getEditableElementKey(target, location.pathname);

    if (isVideoUrl(url)) {
      applyVideoOverlay(target, url);
      const nextOverrides = { ...videoOverridesRef.current, [key]: url };
      videoOverridesRef.current = nextOverrides;
      setVideoOverrides(nextOverrides);
      saveOverrides(VIDEO_STORAGE_KEY, nextOverrides);
      syncOverrideToDb("video", key, url);
    } else {
      applyImageValue(target, url);
      const nextOverrides = { ...imageOverridesRef.current, [key]: url };
      imageOverridesRef.current = nextOverrides;
      setImageOverrides(nextOverrides);
      saveOverrides(IMAGE_STORAGE_KEY, nextOverrides);
      syncOverrideToDb("image", key, url);
    }

    setUrlInput("");
    updatePanelPosition();
  }, [urlInput, location.pathname, updatePanelPosition]);

  const handleReset = useCallback(() => {
    const target = activeElementRef.current;
    if (!target) return;

    const key = getEditableElementKey(target, location.pathname);

    if (activeTypeRef.current === "card") {
      target.style.removeProperty("transform");
      target.style.removeProperty("transform-origin");
      target.style.removeProperty("position");
      target.style.removeProperty("z-index");
      target.style.removeProperty("width");
      target.style.removeProperty("height");
      target.style.removeProperty("overflow");
      target.dataset.adminPositionCustomized = "false";
      target.dataset.adminSizeCustomized = "false";

      const nextPositionOverrides = { ...positionOverridesRef.current };
      delete nextPositionOverrides[key];
      positionOverridesRef.current = nextPositionOverrides;
      setPositionOverrides(nextPositionOverrides);
      saveOverrides(POSITION_STORAGE_KEY, nextPositionOverrides);
      deleteOverrideFromDb("position", key);

      const nextSizeOverrides = { ...sizeOverridesRef.current };
      delete nextSizeOverrides[key];
      sizeOverridesRef.current = nextSizeOverrides;
      setSizeOverrides(nextSizeOverrides);
      saveOverrides(SIZE_STORAGE_KEY, nextSizeOverrides);
      deleteOverrideFromDb("size", key);

      clearActiveTarget();
      return;
    }

    if (activeTypeRef.current === "image") {
      restoreOriginalImageValue(target);
      removeVideoOverlay(target);

      const nextImageOverrides = { ...imageOverridesRef.current };
      delete nextImageOverrides[key];
      imageOverridesRef.current = nextImageOverrides;
      setImageOverrides(nextImageOverrides);
      saveOverrides(IMAGE_STORAGE_KEY, nextImageOverrides);
      deleteOverrideFromDb("image", key);

      const nextVideoOverrides = { ...videoOverridesRef.current };
      delete nextVideoOverrides[key];
      videoOverridesRef.current = nextVideoOverrides;
      setVideoOverrides(nextVideoOverrides);
      saveOverrides(VIDEO_STORAGE_KEY, nextVideoOverrides);
      deleteOverrideFromDb("video", key);

      restoreOriginalSizeValue(target);
      const nextSizeOverrides = { ...sizeOverridesRef.current };
      delete nextSizeOverrides[key];
      sizeOverridesRef.current = nextSizeOverrides;
      setSizeOverrides(nextSizeOverrides);
      saveOverrides(SIZE_STORAGE_KEY, nextSizeOverrides);
      deleteOverrideFromDb("size", key);

      updatePanelPosition();
      return;
    }

    finishInlineTextEditing(false);
    restoreOriginalTextValue(target);

    const nextOverrides = { ...textOverridesRef.current };
    delete nextOverrides[key];
    textOverridesRef.current = nextOverrides;
    setTextOverrides(nextOverrides);
    saveOverrides(TEXT_STORAGE_KEY, nextOverrides);
    deleteOverrideFromDb("text", key);
    updatePanelPosition();
  }, [finishInlineTextEditing, location.pathname, updatePanelPosition]);

  const handleSizeApply = useCallback((widthVal, heightVal, fitVal) => {
    const target = activeElementRef.current;
    if (!target) return;
  const key = getEditableElementKey(target, location.pathname);
  const isIntroCoverMedia = target instanceof HTMLElement && target.matches(".intro-cover-media");
  const staffParts = target instanceof HTMLElement ? getStaffSplitParts(target) : null;
  const sizeValue = {
    ...(sizeOverridesRef.current[key] || {}),
    width: widthVal || undefined,
    height: heightVal || undefined,
      aspectRatio: isIntroCoverMedia ? undefined : sizeOverridesRef.current[key]?.aspectRatio,
      objectFit: fitVal || undefined,
      ...(target instanceof HTMLElement && isBackgroundImageElement(target) && fitVal && !isIntroCoverMedia
        ? { backgroundSize: getBackgroundSizeForFit(fitVal) || sizeOverridesRef.current[key]?.backgroundSize }
        : {}),
      ...(isIntroCoverMedia && fitVal ? { backgroundSize: "cover" } : {}),
    };
    applySizeValue(target, sizeValue);
    if (
      heightVal &&
      target instanceof HTMLElement &&
      staffParts &&
      (target === staffParts.image || target === staffParts.text)
    ) {
      applyStaffPairHeight(staffParts.image, staffParts.text, heightVal);
      const imageKey = getEditableElementKey(staffParts.image, location.pathname);
      const textKey = getEditableElementKey(staffParts.text, location.pathname);
      const nextOverrides = {
        ...sizeOverridesRef.current,
        [imageKey]: getStaffImageSizeValue(staffParts.image),
        [textKey]: getStaffTextSizeValue(staffParts.text),
      };
      sizeOverridesRef.current = nextOverrides;
      setSizeOverrides(nextOverrides);
      saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
      syncOverrideToDb("size", imageKey, nextOverrides[imageKey]);
      syncOverrideToDb("size", textKey, nextOverrides[textKey]);
      updatePanelPosition();
      return;
    }
    const nextOverrides = { ...sizeOverridesRef.current, [key]: sizeValue };
    sizeOverridesRef.current = nextOverrides;
    setSizeOverrides(nextOverrides);
    saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
    syncOverrideToDb("size", key, sizeValue);
    updatePanelPosition();
  }, [location.pathname, updatePanelPosition]);

  const handleRatioApply = useCallback((ratioValue, fitVal = imgObjectFit) => {
    const target = activeElementRef.current;
    if (!target) return;

    const normalized = String(ratioValue || "").trim().replace(/\s+/g, "");
    const match = normalized.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) {
      window.alert("비율은 3:4 처럼 입력해 주세요.");
      return;
    }

    const widthRatio = Number(match[1]);
    const heightRatio = Number(match[2]);
    if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || widthRatio <= 0 || heightRatio <= 0) {
      window.alert("비율 값은 0보다 큰 숫자로 입력해 주세요.");
      return;
    }

    const key = getEditableElementKey(target, location.pathname);
    const isIntroCoverMedia = target instanceof HTMLElement && target.matches(".intro-cover-media");
    const sizeValue = isIntroCoverMedia
      ? {
          ...(sizeOverridesRef.current[key] || {}),
          width: "100%",
          objectFit: fitVal || "cover",
          backgroundSize: "cover",
          overflow: "hidden",
        }
      : {
          ...(sizeOverridesRef.current[key] || {}),
          width: "100%",
          height: "auto",
          aspectRatio: `${widthRatio} / ${heightRatio}`,
          objectFit: fitVal || undefined,
          ...(target instanceof HTMLElement && isBackgroundImageElement(target) && fitVal
            ? { backgroundSize: getBackgroundSizeForFit(fitVal) || sizeOverridesRef.current[key]?.backgroundSize }
            : {}),
          overflow: "hidden",
        };
    applySizeValue(target, sizeValue);
    const nextOverrides = { ...sizeOverridesRef.current, [key]: sizeValue };
    sizeOverridesRef.current = nextOverrides;
    setSizeOverrides(nextOverrides);
    saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
    syncOverrideToDb("size", key, sizeValue);
    setImgRatioInput(`${widthRatio}:${heightRatio}`);
    updatePanelPosition();
  }, [imgObjectFit, location.pathname, updatePanelPosition]);

  if (!isAdmin) {
    return null;
  }

  const shouldShowPanel = Boolean(adminPageEditMode && panelPosition && !(activeType === "text" && isInlineTextEditing));
  const activeTarget = activeElementRef.current;
  const canResizeSelectedText = Boolean(
    adminPageEditMode &&
    activeType === "text" &&
    !isInlineTextEditing &&
    activeTarget instanceof HTMLElement &&
    activeTarget.matches(EDITABLE_TEXT_GROUP_SELECTOR)
  );
  const canResizeSelectedCard = Boolean(
    adminPageEditMode &&
    activeType === "card" &&
    activeTarget instanceof HTMLElement
  );

  return (
    <>
      {shouldShowPanel ? (
        <div
          ref={panelRef}
          className={`admin-image-editor-panel${activeType === "text" && isInlineTextEditing ? " rich-text-open" : ""}`}
          style={{ top: `${panelPosition.top}px`, left: `${panelPosition.left}px` }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {activeType === "card" ? (
            <span className="admin-editor-card-label">드래그: 위치 이동 / 핸들: 크기 조절</span>
          ) : activeType === "text" && isInlineTextEditing ? null : (
            <button type="button" className="admin-image-editor-button" onClick={handleEdit}>
              {activeType === "text" ? "텍스트 입력" : "파일 선택"}
            </button>
          )}
          <button
            type="button"
            className="admin-image-editor-button secondary"
            onClick={handleReset}
          >
            {activeType === "card" ? "위치·크기 초기화" : "초기화"}
          </button>
          {activeType === "image" ? (
            <>
              <div className="admin-image-editor-url-row">
                <input
                  type="text"
                  className="admin-image-editor-url-input"
                  placeholder="영상/이미지 URL 붙여넣기 (.mp4 등)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlApply()}
                />
                <button type="button" className="admin-image-editor-button" onClick={handleUrlApply}>적용</button>
              </div>
              <div className="admin-size-section">
                <div className="admin-size-presets">
                  {[
                    { label: "원본", ratio: "" },
                    { label: "1:1", ratio: "1:1" },
                    { label: "4:3", ratio: "4:3" },
                    { label: "3:4", ratio: "3:4" },
                    { label: "16:9", ratio: "16:9" },
                    { label: "9:16", ratio: "9:16" },
                    { label: "21:9", ratio: "21:9" },
                  ].map(({ label, ratio }) => (
                    <button
                      key={label}
                      type="button"
                      className="admin-size-preset-btn"
                      onClick={() => {
                        if (!ratio) {
                          setImgRatioInput("");
                          handleSizeApply("", "", imgObjectFit);
                          return;
                        }
                        handleRatioApply(ratio, imgObjectFit);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="admin-size-custom-row">
                  <input
                    type="text"
                    className="admin-size-input ratio"
                    placeholder="직접 비율 (예: 3:4)"
                    value={imgRatioInput}
                    onChange={(e) => setImgRatioInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRatioApply(imgRatioInput, imgObjectFit)}
                  />
                  <button type="button" className="admin-image-editor-button" onClick={() => handleRatioApply(imgRatioInput, imgObjectFit)}>적용</button>
                </div>
                <div className="admin-size-fit-row">
                  {[
                    { value: "contain", label: "비율유지" },
                    { value: "cover", label: "꽉채움" },
                    { value: "fill", label: "늘리기" },
                    { value: "none", label: "원본크기" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`admin-size-fit-btn${imgObjectFit === value ? " active" : ""}`}
                      onClick={() => {
                        setImgObjectFit(value);
                        if (imgRatioInput.trim()) handleRatioApply(imgRatioInput, value);
                        else handleSizeApply("", "", value);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {activeType === "text" && isInlineTextEditing && richTextRect ? (
        <Suspense fallback={<div className="admin-rich-text-loading">텍스트 편집기를 불러오는 중입니다...</div>}>
          <LazyAdminRichTextInlineEditor
            initialContent={richTextInitialContent}
            panelPosition={panelPosition}
            surfaceRect={richTextRect}
            surfaceStyle={richTextSurfaceStyle}
            onCancel={() => finishInlineTextEditing(false)}
            onSave={(html) => finishInlineTextEditing(true, html)}
          />
        </Suspense>
      ) : null}

      {(canResizeSelectedCard || canResizeSelectedText) && cardRect ? (
        <>
          <div
            className="admin-resize-handle admin-resize-handle-e"
            style={{ top: cardRect.top + cardRect.height / 2, left: cardRect.right }}
            onMouseDown={(e) => startResizeDrag(e, "e")}
          />
          <div
            className="admin-resize-handle admin-resize-handle-s"
            style={{ top: cardRect.bottom, left: cardRect.left + cardRect.width / 2 }}
            onMouseDown={(e) => startResizeDrag(e, "s")}
          />
          <div
            className="admin-resize-handle admin-resize-handle-se"
            style={{ top: cardRect.bottom, left: cardRect.right }}
            onMouseDown={(e) => startResizeDrag(e, "se")}
          />
        </>
      ) : null}
    </>
  );
}
