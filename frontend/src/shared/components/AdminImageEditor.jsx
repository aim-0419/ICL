import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAppStore } from "../store/AppContext.jsx";
import { canEditPage } from "../auth/userRoles.js";

// 관리자0의 페이지 수정 기능은 localStorage를 캐시로 사용하고 DB를 원본으로 동기화한다.
const IMAGE_STORAGE_KEY = "icl_admin_image_overrides_v1";
const TEXT_STORAGE_KEY = "icl_admin_text_overrides_v1";
const VIDEO_STORAGE_KEY = "icl_admin_video_overrides_v1";
const POSITION_STORAGE_KEY = "icl_admin_position_overrides_v1";
const SIZE_STORAGE_KEY = "icl_admin_size_overrides_v1";
const RESET_POSITION_EVENT = "admin-editor-reset-positions";
const EDITABLE_IMAGE_SELECTOR = "img, [role='img'], .staff-image-slot, [data-admin-bg-editable]";
const EDITABLE_TEXT_SELECTOR = "h1, h2, h3, p, span, strong, em, small, li, label, time, dt, dd";
const DRAGGABLE_CARD_SELECTOR = [
  ".academy-video-card",
  ".review-card",
  ".status-card",
  ".social-feed-card",
  ".content-card",
  ".mosaic-card",
  ".tour-gallery-item",
  ".reason-item",
  ".staff-split",
  ".direction-branch-card",
  ".intro-speciality-card",
  ".intro-promise-card",
  ".admin-dashboard-page .dashboard-hero",
  ".admin-dashboard-page .dashboard-card",
].join(", ");
const CARD_SWAP_OVERLAP_RATIO = 0.2;
const CARD_DRAG_AUTO_SCROLL_EDGE_PX = 180;
const CARD_DRAG_AUTO_SCROLL_MIN_VELOCITY = 10;
const CARD_DRAG_AUTO_SCROLL_MAX_VELOCITY = 113;

function getRectOverlapArea(sourceRect, targetRect) {
  const left = Math.max(sourceRect.left, targetRect.left);
  const top = Math.max(sourceRect.top, targetRect.top);
  const right = Math.min(sourceRect.right, targetRect.right);
  const bottom = Math.min(sourceRect.bottom, targetRect.bottom);

  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function findDraggableCardFromElement(element) {
  if (!(element instanceof Element)) return null;
  if (element.closest(".admin-image-editor-panel")) return null;
  return element.closest(DRAGGABLE_CARD_SELECTOR);
}

function findDropTargetAtPoint(clientX, clientY, draggingElement) {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  const elements = document.elementsFromPoint(clientX, clientY);
  for (const element of elements) {
    const candidate = findDraggableCardFromElement(element);
    if (!candidate) continue;
    if (!(candidate instanceof HTMLElement)) continue;
    if (candidate === draggingElement) continue;
    return candidate;
  }

  return null;
}

function isDashboardCardElement(element) {
  if (!(element instanceof Element)) return false;
  return Boolean(element.matches(".admin-dashboard-page .dashboard-card, .admin-dashboard-page .dashboard-hero"));
}

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

function isVideoUrl(url) {
  const lower = String(url).toLowerCase().split("?")[0];
  return [".mp4", ".webm", ".mov", ".m4v", ".ogg"].some((ext) => lower.endsWith(ext));
}

function applyVideoOverlay(element, videoUrl) {
  removeVideoOverlay(element);
  const computed = window.getComputedStyle(element);
  if (computed.position === "static") {
    element.style.position = "relative";
    element.dataset.adminVideoAddedPosition = "true";
  }
  element.style.overflow = "hidden";
  const video = document.createElement("video");
  video.className = "admin-video-overlay";
  video.src = videoUrl;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:1;";
  element.appendChild(video);
  video.play().catch(() => {});
  element.dataset.adminVideoCustomized = "true";
}

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
  element.dataset.adminVideoCustomized = "false";
}

function readOverrides(storageKey) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

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

function getEditableElementKey(element, pathname) {
  if (!element.dataset.adminEditKey) {
    element.dataset.adminEditKey = `${pathname}::${getDomPathSignature(element)}`;
  }
  return element.dataset.adminEditKey;
}

// 원본 이미지를 기억해 두면 관리자 초기화 버튼으로 쉽게 복원할 수 있다.
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

function applyImageValue(element, value) {
  if (element.tagName === "IMG") {
    element.setAttribute("src", value);
    element.style.objectFit = "contain";
    element.style.objectPosition = "center";
    element.dataset.adminImageCustomized = "true";
    return;
  }

  const safeUrl = String(value).replace(/"/g, '\\"');
  element.style.backgroundImage = `url("${safeUrl}")`;
  element.style.backgroundSize = "contain";
  element.style.backgroundPosition = "center";
  element.style.backgroundRepeat = "no-repeat";
  element.dataset.adminImageCustomized = "true";
}

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
function rememberOriginalTextValue(element) {
  if (element.dataset.adminTextOriginalSaved === "true") return;
  element.dataset.adminTextOriginalValue = element.textContent || "";
  element.dataset.adminTextOriginalWhiteSpace = element.style.whiteSpace || "";
  element.dataset.adminTextOriginalSaved = "true";
}

function applyTextValue(element, value) {
  element.textContent = value;
  const hasLineBreak = String(value).includes("\n");
  if (hasLineBreak) {
    element.style.whiteSpace = "pre-line";
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

function restoreOriginalTextValue(element) {
  const originalValue = element.dataset.adminTextOriginalValue || "";
  const originalWhiteSpace = element.dataset.adminTextOriginalWhiteSpace || "";
  element.textContent = originalValue;
  if (originalWhiteSpace) {
    element.style.whiteSpace = originalWhiteSpace;
  } else {
    element.style.removeProperty("white-space");
  }
  element.dataset.adminTextCustomized = "false";
}

function rememberOriginalSizeValue(element) {
  if (element.dataset.adminSizeOriginalSaved === "true") return;
  element.dataset.adminSizeOriginalWidth = element.style.width || "";
  element.dataset.adminSizeOriginalHeight = element.style.height || "";
  element.dataset.adminSizeOriginalObjectFit = element.style.objectFit || "";
  element.dataset.adminSizeOriginalOverflow = element.style.overflow || "";
  element.dataset.adminSizeOriginalSaved = "true";
}

function applySizeValue(element, sizeValue) {
  if (!sizeValue) return;
  rememberOriginalSizeValue(element);
  if (sizeValue.width) element.style.width = sizeValue.width;
  else element.style.removeProperty("width");
  if (sizeValue.height) element.style.height = sizeValue.height;
  else element.style.removeProperty("height");
  if (sizeValue.objectFit) element.style.objectFit = sizeValue.objectFit;
  else element.style.removeProperty("object-fit");
  if (sizeValue.overflow) element.style.overflow = sizeValue.overflow;
  else element.style.removeProperty("overflow");
  element.dataset.adminSizeCustomized = "true";
}

function restoreOriginalSizeValue(element) {
  const w = element.dataset.adminSizeOriginalWidth || "";
  const h = element.dataset.adminSizeOriginalHeight || "";
  const fit = element.dataset.adminSizeOriginalObjectFit || "";
  const ov = element.dataset.adminSizeOriginalOverflow || "";
  if (w) element.style.width = w; else element.style.removeProperty("width");
  if (h) element.style.height = h; else element.style.removeProperty("height");
  if (fit) element.style.objectFit = fit; else element.style.removeProperty("object-fit");
  if (ov) element.style.overflow = ov; else element.style.removeProperty("overflow");
  element.dataset.adminSizeCustomized = "false";
}

// 텍스트는 선택 후 클릭, 이미지는 더블클릭으로 편집 대상을 찾는다.
function findEditableImageTarget(eventTarget) {
  if (!(eventTarget instanceof Element)) return null;
  if (eventTarget.closest(".admin-image-editor-panel")) return null;

  const editable = eventTarget.closest(EDITABLE_IMAGE_SELECTOR);
  return editable instanceof HTMLElement ? editable : null;
}

function findEditableTextTarget(eventTarget) {
  if (!(eventTarget instanceof Element)) return null;
  if (eventTarget.closest(".admin-image-editor-panel")) return null;

  const editable = eventTarget.closest(EDITABLE_TEXT_SELECTOR);
  if (!(editable instanceof HTMLElement)) return null;
  if (!editable.textContent || !editable.textContent.trim()) return null;
  return editable;
}

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

function placeCaretAtEnd(element) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

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
export function AdminImageEditor() {
  const { currentUser, adminPageEditMode, setAdminPageEditMode } = useAppStore();
  const location = useLocation();
  const isAdmin = useMemo(() => canEditPage(currentUser), [currentUser]);

  const [imageOverrides, setImageOverrides] = useState(() => readOverrides(IMAGE_STORAGE_KEY));
  const [textOverrides, setTextOverrides] = useState(() => readOverrides(TEXT_STORAGE_KEY));
  const [videoOverrides, setVideoOverrides] = useState(() => readOverrides(VIDEO_STORAGE_KEY));
  const [positionOverrides, setPositionOverrides] = useState(() => readOverrides(POSITION_STORAGE_KEY));
  const [sizeOverrides, setSizeOverrides] = useState(() => readOverrides(SIZE_STORAGE_KEY));
  const [panelPosition, setPanelPosition] = useState(null);
  const [activeType, setActiveType] = useState(null);
  const [isInlineTextEditing, setIsInlineTextEditing] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [imgWidthInput, setImgWidthInput] = useState("");
  const [imgHeightInput, setImgHeightInput] = useState("");
  const [imgObjectFit, setImgObjectFit] = useState("contain");
  const [cardRect, setCardRect] = useState(null);

  const imageOverridesRef = useRef(imageOverrides);
  const textOverridesRef = useRef(textOverrides);
  const videoOverridesRef = useRef(videoOverrides);
  const positionOverridesRef = useRef(positionOverrides);
  const sizeOverridesRef = useRef(sizeOverrides);
  const activeElementRef = useRef(null);
  const activeTypeRef = useRef(activeType);
  const isInlineTextEditingRef = useRef(false);
  const panelRef = useRef(null);
  const fileInputRef = useRef(null);
  const rafRef = useRef(0);
  const textSessionRef = useRef(null);
  const dragRef = useRef(null);
  const resizeDragRef = useRef(null);
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
    activeTypeRef.current = activeType;
  }, [activeType]);

  useEffect(() => {
    isInlineTextEditingRef.current = isInlineTextEditing;
  }, [isInlineTextEditing]);

  // DB에서 override를 불러와 localStorage와 병합한다 (DB가 원본).
  useEffect(() => {
    if (!isAdmin) return;
    fetchOverridesFromDb().then((rows) => {
      if (!Array.isArray(rows)) return;
      const grouped = { image: {}, text: {}, video: {}, position: {}, size: {} };
      rows.forEach(({ type, key, value }) => {
        if (grouped[type]) grouped[type][key] = value;
      });
      const mergeAndApply = (storageKey, type, setter, ref) => {
        const local = readOverrides(storageKey);
        const merged = { ...local, ...grouped[type] };
        saveOverrides(storageKey, merged);
        ref.current = merged;
        setter(merged);
      };
      mergeAndApply(IMAGE_STORAGE_KEY, "image", setImageOverrides, imageOverridesRef);
      mergeAndApply(TEXT_STORAGE_KEY, "text", setTextOverrides, textOverridesRef);
      mergeAndApply(VIDEO_STORAGE_KEY, "video", setVideoOverrides, videoOverridesRef);
      mergeAndApply(POSITION_STORAGE_KEY, "position", setPositionOverrides, positionOverridesRef);
      mergeAndApply(SIZE_STORAGE_KEY, "size", setSizeOverrides, sizeOverridesRef);
      // ref가 모두 갱신된 뒤 DOM에 재적용한다
      requestAnimationFrame(() => applyOverridesToPageRef.current?.());
    });
  }, [isAdmin]);

  // 인라인 편집 종료 시 현재 DOM 값과 저장소 값을 함께 정리한다.
  const finishInlineTextEditing = useCallback(
    (save = true) => {
      const session = textSessionRef.current;
      if (!session) {
        setIsInlineTextEditing(false);
        isInlineTextEditingRef.current = false;
        return;
      }

      const { target, onBlur, onKeyDown, snapshot } = session;

      target.removeEventListener("blur", onBlur);
      target.removeEventListener("keydown", onKeyDown);
      target.contentEditable = "false";
      target.classList.remove("admin-inline-text-editing");
      target.removeAttribute("data-admin-inline-editing");

      let nextValue = target.textContent || "";

      if (!save) {
        nextValue = snapshot;
        target.textContent = snapshot;
      }

      if (save) {
        const key = getEditableElementKey(target, location.pathname);
        const normalizedValue = nextValue.replace(/\r\n/g, "\n");
        applyTextValue(target, normalizedValue);
        const nextOverrides = { ...textOverridesRef.current, [key]: normalizedValue };
        textOverridesRef.current = nextOverrides;
        setTextOverrides(nextOverrides);
        saveOverrides(TEXT_STORAGE_KEY, nextOverrides);
        syncOverrideToDb("text", key, normalizedValue);
      }

      textSessionRef.current = null;
      setIsInlineTextEditing(false);
      isInlineTextEditingRef.current = false;
    },
    [location.pathname]
  );

  const clearActiveTarget = useCallback(() => {
    finishInlineTextEditing(true);

    if (activeElementRef.current) {
      activeElementRef.current.classList.remove("admin-editing-selected");
    }

    activeElementRef.current = null;
    activeTypeRef.current = null;
    setActiveType(null);
    setPanelPosition(null);
    setCardRect(null);
  }, [finishInlineTextEditing]);

  // 편집 패널이 대상 요소를 가리지 않도록 타입별로 위치를 계산한다.
  const updatePanelPosition = useCallback(() => {
    const target = activeElementRef.current;
    if (!target || !document.body.contains(target)) {
      clearActiveTarget();
      return;
    }

    const rect = target.getBoundingClientRect();
    const panelWidth = 230;
    const panelHeight = 52;

    if (activeTypeRef.current === "text") {
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

    const top = Math.max(8, rect.top + 10);
    const left = Math.min(window.innerWidth - panelWidth - 8, Math.max(8, rect.right - panelWidth));
    setPanelPosition({ top, left });

    if (activeTypeRef.current === "card") {
      setCardRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    }
  }, [clearActiveTarget]);

  // 텍스트는 contentEditable 기반으로 즉시 수정하고, Ctrl/Cmd + Enter로 저장한다.
  const startInlineTextEditing = useCallback(
    (target) => {
      if (!(target instanceof HTMLElement)) return;
      if (activeTypeRef.current !== "text") return;

      finishInlineTextEditing(true);

      const snapshot = target.textContent || "";
      target.contentEditable = "true";
      target.dataset.adminInlineEditing = "true";
      target.classList.add("admin-inline-text-editing");

      const onBlur = () => {
        finishInlineTextEditing(true);
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finishInlineTextEditing(false);
          return;
        }

        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          insertLineBreakAtCaret(target);
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          finishInlineTextEditing(true);
        }
      };

      target.addEventListener("blur", onBlur);
      target.addEventListener("keydown", onKeyDown);

      textSessionRef.current = {
        target,
        onBlur,
        onKeyDown,
        snapshot,
      };

      setIsInlineTextEditing(true);
      isInlineTextEditingRef.current = true;

      requestAnimationFrame(() => {
        target.focus();
        placeCaretAtEnd(target);
        updatePanelPosition();
      });
    },
    [finishInlineTextEditing, updatePanelPosition]
  );

  // 화면이 다시 렌더링되거나 라우트가 바뀌어도 저장된 덮어쓰기 값을 재적용한다.
  const applyOverridesToPage = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;

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
        if (overrideValue) {
          applyImageValue(element, overrideValue);
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

      const editableTexts = Array.from(document.querySelectorAll(EDITABLE_TEXT_SELECTOR)).filter(
        (element) => element instanceof HTMLElement
      );

      editableTexts.forEach((element) => {
        if (element.closest(".admin-image-editor-panel")) return;
        if (!element.textContent || !element.textContent.trim()) return;

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
          applyTextValue(element, overrideValue);
        }
      });

      const editableCards = Array.from(document.querySelectorAll(DRAGGABLE_CARD_SELECTOR)).filter(
        (el) => el instanceof HTMLElement && !el.closest(".admin-image-editor-panel")
      );

      editableCards.forEach((element) => {
        if (isAdmin && adminPageEditMode) {
          element.classList.add("admin-draggable-card");
        } else {
          element.classList.remove("admin-draggable-card");
          return;
        }

        const key = getEditableElementKey(element, location.pathname);
        const saved = positionOverridesRef.current[key];
        if (saved) {
          element.style.transform = `translate(${saved.x}px, ${saved.y}px)`;
          element.style.position = "relative";
          element.style.zIndex = "1";
          element.dataset.adminPositionCustomized = "true";
        } else if (element.dataset.adminPositionCustomized === "true") {
          element.style.removeProperty("transform");
          element.style.removeProperty("position");
          element.style.removeProperty("z-index");
          element.dataset.adminPositionCustomized = "false";
        }

        const sizeSaved = sizeOverridesRef.current[key];
        if (sizeSaved) {
          applySizeValue(element, sizeSaved);
        } else if (element.dataset.adminSizeCustomized === "true") {
          restoreOriginalSizeValue(element);
        }
      });

      if (activeElementRef.current && !document.body.contains(activeElementRef.current)) {
        clearActiveTarget();
      } else if (activeElementRef.current) {
        updatePanelPosition();
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
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && adminPageEditMode) {
      document.body.classList.add("admin-image-editor-on");
    } else {
      document.body.classList.remove("admin-image-editor-on");
      clearActiveTarget();
    }

    applyOverridesToPage();

    return () => {
      document.body.classList.remove("admin-image-editor-on");
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [applyOverridesToPage, clearActiveTarget, isAdmin, adminPageEditMode]);

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

      removedKeys.forEach((key) => {
        deleteOverrideFromDb("position", key);
      });

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
    resizeDragRef.current = {
      element: target,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: target.offsetWidth,
      startHeight: target.offsetHeight,
    };
  }, []);

  useEffect(() => {
    if (!isAdmin || !adminPageEditMode) return undefined;

    const onResizeMouseMove = (e) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      drag.element.style.overflow = "hidden";
      if (drag.direction === "e" || drag.direction === "se") {
        drag.element.style.width = `${Math.max(80, drag.startWidth + dx)}px`;
      }
      if (drag.direction === "s" || drag.direction === "se") {
        drag.element.style.height = `${Math.max(40, drag.startHeight + dy)}px`;
      }
      const r = drag.element.getBoundingClientRect();
      setCardRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    };

    const onResizeMouseUp = () => {
      const drag = resizeDragRef.current;
      if (!drag) return;
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
  }, [isAdmin, adminPageEditMode, location.pathname]);

  useEffect(() => {
    if (!isAdmin || !adminPageEditMode) return undefined;

    const activateTarget = (target, type) => {
      if (type === "image") {
        rememberOriginalImageValue(target);
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

    const onClickCapture = (event) => {
      if (isInlineTextEditingRef.current) return;
      const selectedTextTarget = getSelectedTextTarget();
      if (selectedTextTarget) {
        event.preventDefault();
        event.stopPropagation();
        activateTarget(selectedTextTarget, "text");
        startInlineTextEditing(selectedTextTarget);
      }
    };

    const onDoubleClickCapture = (event) => {
      if (isInlineTextEditingRef.current) return;

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
        startInlineTextEditing(textTarget);
      }
    };

    const onPointerDown = (event) => {
      const target = event.target;
      const activeElement = activeElementRef.current;
      if (!activeElement || !(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || activeElement.contains(target)) return;
      if (event.ctrlKey) return;
      // 리사이즈 핸들 클릭 시 선택 해제 방지
      if (target instanceof Element && target.classList.contains("admin-resize-handle")) return;
      clearActiveTarget();
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

      drag.element.style.transform = `translate(${newX}px, ${newY}px)`;
      drag.element.style.position = "relative";
      drag.element.style.zIndex = "100";

      state.rafId = requestAnimationFrame(runDragAutoScroll);
    };

    const onCtrlMouseDown = (event) => {
      if (!event.ctrlKey || event.button !== 0) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".admin-image-editor-panel")) return;
      if (isInlineTextEditingRef.current) return;

      // 이미지 편집 대상(img, role=img, staff-image-slot 등)을 직접 클릭하면 이미지 에디터 우선
      if (event.target.matches(EDITABLE_IMAGE_SELECTOR) || event.target.closest(".staff-image-slot, [role='img']")) return;

      const card = event.target.closest(DRAGGABLE_CARD_SELECTOR);
      if (!card) return;

      const key = getEditableElementKey(card, location.pathname);
      const saved = positionOverridesRef.current[key] || { x: 0, y: 0 };

      dragRef.current = {
        element: card,
        key,
        startMouseX: event.clientX,
        startPageY: event.clientY + window.scrollY,
        startOffsetX: saved.x,
        startOffsetY: saved.y,
        startRect: card.getBoundingClientRect(),
        isDashboardCard: isDashboardCardElement(card),
        layoutByKey: new Map(),
        hoverTarget: null,
        isDragging: false,
      };

      const draggableCards = Array.from(document.querySelectorAll(DRAGGABLE_CARD_SELECTOR)).filter(
        (candidate) => candidate instanceof HTMLElement && !candidate.closest(".admin-image-editor-panel")
      );
      draggableCards.forEach((candidate) => {
        const candidateKey = getEditableElementKey(candidate, location.pathname);
        const candidateSaved = positionOverridesRef.current[candidateKey] || { x: 0, y: 0 };
        dragRef.current.layoutByKey.set(candidateKey, {
          rect: candidate.getBoundingClientRect(),
          saved: { x: candidateSaved.x, y: candidateSaved.y },
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

      drag.element.style.transform = `translate(${newX}px, ${newY}px)`;
      drag.element.style.position = "relative";
      drag.element.style.zIndex = "100";

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
          let maxOverlapArea = 0;

          const cardElements = Array.from(document.querySelectorAll(DRAGGABLE_CARD_SELECTOR)).filter(
            (candidate) => candidate instanceof HTMLElement && candidate !== drag.element
          );

          cardElements.forEach((candidate) => {
            const candidateRect = candidate.getBoundingClientRect();
            const overlapArea = getRectOverlapArea(draggedRect, candidateRect);
            if (overlapArea <= 0) return;

            const candidateArea = Math.max(1, candidateRect.width * candidateRect.height);
            const overlapRatio = overlapArea / Math.min(draggedArea, candidateArea);
            if (overlapRatio < CARD_SWAP_OVERLAP_RATIO) return;

            if (overlapArea <= maxOverlapArea) return;
            maxOverlapArea = overlapArea;
            swapTarget = candidate;
          });
        }

        drag.element.style.zIndex = "1";
        drag.element.dataset.adminPositionCustomized = "true";

        if (swapTarget) {
          const targetKey = getEditableElementKey(swapTarget, location.pathname);
          const sourceLayout = drag.layoutByKey?.get(drag.key);
          const targetLayout = drag.layoutByKey?.get(targetKey);
          const sourceRect = sourceLayout?.rect || drag.startRect || drag.element.getBoundingClientRect();
          const targetRect = targetLayout?.rect || swapTarget.getBoundingClientRect();
          const sourceSaved = sourceLayout?.saved || { x: drag.startOffsetX, y: drag.startOffsetY };
          const targetSaved = targetLayout?.saved || { x: 0, y: 0 };

          const nextDragOffset = {
            x: Math.round(sourceSaved.x + (targetRect.left - sourceRect.left)),
            y: Math.round(sourceSaved.y + (targetRect.top - sourceRect.top)),
          };
          const nextTargetOffset = {
            x: Math.round(targetSaved.x + (sourceRect.left - targetRect.left)),
            y: Math.round(targetSaved.y + (sourceRect.top - targetRect.top)),
          };

          drag.element.style.transform = `translate(${nextDragOffset.x}px, ${nextDragOffset.y}px)`;
          swapTarget.style.transform = `translate(${nextTargetOffset.x}px, ${nextTargetOffset.y}px)`;
          swapTarget.style.position = "relative";
          swapTarget.style.zIndex = "1";
          swapTarget.dataset.adminPositionCustomized = "true";

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
        } else {
          if (drag.isDashboardCard) {
            drag.element.style.transform = `translate(${drag.startOffsetX}px, ${drag.startOffsetY}px)`;
          } else {
            const matrix = new DOMMatrix(window.getComputedStyle(drag.element).transform);
            const finalX = Math.round(matrix.m41);
            const finalY = Math.round(matrix.m42);
            const nextOverrides = { ...positionOverridesRef.current, [drag.key]: { x: finalX, y: finalY } };
            positionOverridesRef.current = nextOverrides;
            setPositionOverrides(nextOverrides);
            saveOverrides(POSITION_STORAGE_KEY, nextOverrides);
            syncOverrideToDb("position", drag.key, { x: finalX, y: finalY });
          }
        }
      } else {
        if (activeElementRef.current && activeElementRef.current !== drag.element) {
          activeElementRef.current.classList.remove("admin-editing-selected");
        }
        activeElementRef.current = drag.element;
        activeTypeRef.current = "card";
        setActiveType("card");
        drag.element.classList.add("admin-editing-selected");
        setPanelPosition({ top: 0, left: 0 });
        requestAnimationFrame(() => {
          updatePanelPosition();
          const r = drag.element.getBoundingClientRect();
          setCardRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
        });
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

    if (isInlineTextEditingRef.current) {
      finishInlineTextEditing(true);
      return;
    }

    startInlineTextEditing(target);
  }, [finishInlineTextEditing, startInlineTextEditing]);

  const handleFileChange = useCallback(
    (event) => {
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

      const reader = new FileReader();

      reader.onload = () => {
        const nextValue = String(reader.result || "");
        if (!nextValue) return;

        applyImageValue(target, nextValue);
        const nextOverrides = { ...imageOverridesRef.current, [key]: nextValue };
        imageOverridesRef.current = nextOverrides;
        setImageOverrides(nextOverrides);

        const saved = saveOverrides(IMAGE_STORAGE_KEY, nextOverrides);
        if (!saved) {
          window.alert("이미지 용량이 커서 저장에 실패했습니다. 작은 파일로 시도해 주세요.");
        }
        syncOverrideToDb("image", key, nextValue);

        updatePanelPosition();
      };

      reader.onerror = () => {
        window.alert("이미지 파일을 읽는 중 오류가 발생했습니다.");
      };

      reader.readAsDataURL(selectedFile);
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
    const sizeValue = {
      width: widthVal || undefined,
      height: heightVal || undefined,
      objectFit: fitVal || undefined,
    };
    applySizeValue(target, sizeValue);
    const nextOverrides = { ...sizeOverridesRef.current, [key]: sizeValue };
    sizeOverridesRef.current = nextOverrides;
    setSizeOverrides(nextOverrides);
    saveOverrides(SIZE_STORAGE_KEY, nextOverrides);
    syncOverrideToDb("size", key, sizeValue);
    updatePanelPosition();
  }, [location.pathname, updatePanelPosition]);

  if (!isAdmin) {
    return null;
  }

  const shouldShowPanel = Boolean(
    adminPageEditMode && panelPosition && !(activeType === "text" && isInlineTextEditing)
  );

  return (
    <>
      {shouldShowPanel ? (
        <div
          ref={panelRef}
          className="admin-image-editor-panel"
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
            <span className="admin-editor-card-label">Ctrl+드래그: 위치 이동 / 핸들: 크기 조절</span>
          ) : (
            <button type="button" className="admin-image-editor-button" onClick={handleEdit}>
              {activeType === "text"
                ? isInlineTextEditing ? "입력 완료" : "텍스트 입력"
                : "파일 선택"}
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
                    { label: "원본", w: "", h: "" },
                    { label: "320px", w: "320px", h: "" },
                    { label: "480px", w: "480px", h: "" },
                    { label: "640px", w: "640px", h: "" },
                    { label: "800px", w: "800px", h: "" },
                    { label: "1280px", w: "1280px", h: "" },
                    { label: "100%", w: "100%", h: "" },
                  ].map(({ label, w, h }) => (
                    <button
                      key={label}
                      type="button"
                      className="admin-size-preset-btn"
                      onClick={() => { setImgWidthInput(w); setImgHeightInput(h); handleSizeApply(w, h, imgObjectFit); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="admin-size-custom-row">
                  <input
                    type="text"
                    className="admin-size-input"
                    placeholder="W (예: 640px)"
                    value={imgWidthInput}
                    onChange={(e) => setImgWidthInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSizeApply(imgWidthInput, imgHeightInput, imgObjectFit)}
                  />
                  <span className="admin-size-x">×</span>
                  <input
                    type="text"
                    className="admin-size-input"
                    placeholder="H (auto)"
                    value={imgHeightInput}
                    onChange={(e) => setImgHeightInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSizeApply(imgWidthInput, imgHeightInput, imgObjectFit)}
                  />
                  <button type="button" className="admin-image-editor-button" onClick={() => handleSizeApply(imgWidthInput, imgHeightInput, imgObjectFit)}>적용</button>
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
                      onClick={() => { setImgObjectFit(value); handleSizeApply(imgWidthInput, imgHeightInput, value); }}
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

      {adminPageEditMode && activeType === "card" && cardRect ? (
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
