/**
 * [글 내용 안전하게 다듬기 - 서버]
 *
 * 사용자가 작성한 글에서 위험한 부분을 서버에서 한 번 더 걸러 냅니다.
 *
 * 화면에서도 같은 검사를 하지만, 화면 검사는 우회될 수 있으므로
 * 저장하기 전에 서버에서 반드시 다시 확인합니다.
 */
const ALLOWED_RICH_TEXT_TAGS = new Set([
  "p",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "br",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

const VOID_TAGS = new Set(["br"]);

// 관리자 리치텍스트 편집값은 글자 크기/정렬 같은 서식은 살리고,
// 스크립트·위험한 URL·이벤트 속성은 제거해서 XSS를 막습니다.
const ALLOWED_STYLE_PROPERTIES = new Set([
  "color",
  "background-color",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-decoration",
]);

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeStyleValue(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 160) return false;
  if (/url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|behavior\s*:/i.test(text)) {
    return false;
  }
  return /^[#(),.%\w\s'"-]+$/u.test(text);
}

function normalizeStyleValue(property, value) {
  const text = String(value || "").trim();
  if (!isSafeStyleValue(text)) return "";

  if (property === "display") {
    return text === "block" || text === "inline" || text === "inline-block" ? text : "";
  }

  if (property === "text-align") {
    return ["left", "center", "right", "justify"].includes(text.toLowerCase()) ? text.toLowerCase() : "";
  }

  if (property === "text-decoration") {
    return ["none", "underline", "line-through"].includes(text.toLowerCase()) ? text.toLowerCase() : "";
  }

  if (property === "font-size" || property === "letter-spacing") {
    return /^-?\d{1,3}(\.\d{1,2})?px$/i.test(text) ? text : "";
  }

  if (property === "line-height") {
    return /^(\d{1,2}(\.\d{1,2})?|\d{1,3}(\.\d{1,2})?%|\d{1,3}(\.\d{1,2})?px)$/i.test(text) ? text : "";
  }

  return text;
}

function sanitizeStyle(styleText) {
  const declarations = String(styleText || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const safeDeclarations = [];

  for (const declaration of declarations) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex <= 0) continue;
    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = declaration.slice(separatorIndex + 1).trim();
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;
    const value = normalizeStyleValue(property, rawValue);
    if (!value) continue;
    safeDeclarations.push(`${property}: ${value}`);
  }

  return safeDeclarations.join("; ");
}

function pickStyleAttribute(attributesText) {
  const match = String(attributesText || "").match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return sanitizeStyle(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

export function sanitizeRichTextHtml(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (fullTag, rawTagName, rawAttributes) => {
      const tagName = String(rawTagName || "").toLowerCase();
      if (!ALLOWED_RICH_TEXT_TAGS.has(tagName)) return "";

      const isClosingTag = /^<\s*\//.test(fullTag);
      if (isClosingTag) return VOID_TAGS.has(tagName) ? "" : `</${tagName}>`;
      if (VOID_TAGS.has(tagName)) return `<${tagName}>`;

      const style = pickStyleAttribute(rawAttributes);
      return style ? `<${tagName} style="${escapeAttribute(style)}">` : `<${tagName}>`;
    });
}

export function stripHtmlTags(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\b(?:javascript|vbscript|data)\s*:/gi, "")
    .trim();
}
