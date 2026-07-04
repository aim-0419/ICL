import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeRichTextHtml, stripHtmlTags } from "../src/shared/security/html.js";

test("sanitizeRichTextHtml keeps safe rich text formatting", () => {
  const html = '<p style="font-size: 18px; color: #333; text-align: center">안내 <strong>문구</strong></p>';

  assert.equal(
    sanitizeRichTextHtml(html),
    '<p style="font-size: 18px; color: #333; text-align: center">안내 <strong>문구</strong></p>',
  );
});

test("sanitizeRichTextHtml strips scripts, event handlers, and unsafe style values", () => {
  const html = '<img src=x onerror=alert(1)><p onclick="alert(1)" style="background-image:url(javascript:alert(1)); font-size: 16px">Hi<script>alert(1)</script></p>';

  assert.equal(
    sanitizeRichTextHtml(html),
    '<p style="font-size: 16px">Hialert(1)</p>',
  );
});

test("stripHtmlTags removes executable tags and dangerous URI protocols", () => {
  const value = '<img src=x onerror=alert(1)>QA<script>alert(2)</script>javascript:alert(3)';

  assert.equal(stripHtmlTags(value), "QAalert(2)alert(3)");
});
