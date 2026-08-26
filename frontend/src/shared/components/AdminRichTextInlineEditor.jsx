/**
 * [관리자용 글 편집기]
 *
 * 관리자가 홈페이지 글을 화면에서 바로 고칠 수 있게 해 주는 편집기입니다.
 * 굵게, 색상, 정렬 같은 서식을 지원합니다.
 */
import React from "react";
import { Extension } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const FONT_FAMILIES = [
  { label: "기본", value: "" },
  { label: "고딕", value: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" },
  { label: "명조", value: "'Noto Serif KR', 'Batang', serif" },
  { label: "영문", value: "'Times New Roman', serif" },
  { label: "모노", value: "'Consolas', 'Courier New', monospace" },
];

const RichTextStyle = Extension.create({
  name: "richTextStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => element.style.fontFamily || null,
            renderHTML: (attributes) => (
              attributes.fontFamily ? { style: `font-family: ${attributes.fontFamily}` } : {}
            ),
          },
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => (
              attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {}
            ),
          },
          letterSpacing: {
            default: null,
            parseHTML: (element) => element.style.letterSpacing || null,
            renderHTML: (attributes) => (
              attributes.letterSpacing ? { style: `letter-spacing: ${attributes.letterSpacing}` } : {}
            ),
          },
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => (
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {}
            ),
          },
          textDecoration: {
            default: null,
            parseHTML: (element) => element.style.textDecoration || null,
            renderHTML: (attributes) => (
              attributes.textDecoration ? { style: `text-decoration: ${attributes.textDecoration}` } : {}
            ),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontFamily: (fontFamily) => ({ chain }) => (
        chain().setMark("textStyle", { fontFamily: fontFamily || null }).run()
      ),
      setFontSize: (fontSize) => ({ chain }) => (
        chain().setMark("textStyle", { fontSize }).run()
      ),
      setLetterSpacing: (letterSpacing) => ({ chain }) => (
        chain().setMark("textStyle", { letterSpacing }).run()
      ),
      setLineHeight: (lineHeight) => ({ chain }) => (
        chain().setMark("textStyle", { lineHeight }).run()
      ),
      setTextDecoration: (textDecoration) => ({ chain }) => (
        chain().setMark("textStyle", { textDecoration }).run()
      ),
    };
  },
});

function syncInputsFromEditor(editor, refs) {
  const attrs = editor.getAttributes("textStyle");
  const { fontFamilyRef, fontSizeRef, letterSpacingRef, lineHeightRef } = refs;

  if (fontFamilyRef.current && document.activeElement !== fontFamilyRef.current) {
    fontFamilyRef.current.value = attrs.fontFamily || "";
  }
  if (fontSizeRef.current && document.activeElement !== fontSizeRef.current) {
    fontSizeRef.current.value = attrs.fontSize ? attrs.fontSize.replace(/px$/, "") : "";
  }
  if (letterSpacingRef.current && document.activeElement !== letterSpacingRef.current) {
    letterSpacingRef.current.value = attrs.letterSpacing ? attrs.letterSpacing.replace(/px$/, "") : "";
  }
  if (lineHeightRef.current && document.activeElement !== lineHeightRef.current) {
    lineHeightRef.current.value = attrs.lineHeight || "";
  }
}

function ToolbarButton({ active = false, label, title, onClick }) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function AdminRichTextInlineEditor({ initialContent, onCancel, onSave }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      RichTextStyle,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: initialContent || "",
    editorProps: {
      attributes: { class: "admin-rich-text-content" },
    },
    immediatelyRender: false,
  });

  const fontFamilyRef = React.useRef(null);
  const fontSizeRef = React.useRef(null);
  const letterSpacingRef = React.useRef(null);
  const lineHeightRef = React.useRef(null);

  React.useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(initialContent || "", false);
    requestAnimationFrame(() => editor.commands.focus("end"));
  }, [editor, initialContent]);

  React.useEffect(() => {
    if (!editor) return;
    const refs = { fontFamilyRef, fontSizeRef, letterSpacingRef, lineHeightRef };
    const handler = () => syncInputsFromEditor(editor, refs);
    editor.on("selectionUpdate", handler);
    editor.on("transaction", handler);
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("transaction", handler);
    };
  }, [editor]);

  if (!editor) {
    return <div className="admin-rich-text-loading">텍스트 편집기를 불러오는 중입니다...</div>;
  }

  const textStyleAttrs = editor.getAttributes("textStyle");
  const isUnderline = textStyleAttrs.textDecoration === "underline";

  const applyFontSize = () => {
    const val = fontSizeRef.current?.value.trim();
    if (val) editor.chain().focus().setFontSize(`${val}px`).run();
  };

  const applyLetterSpacing = () => {
    const val = letterSpacingRef.current?.value.trim();
    if (val !== undefined && val !== "") editor.chain().focus().setLetterSpacing(`${val}px`).run();
  };

  const applyLineHeight = () => {
    const val = lineHeightRef.current?.value.trim();
    if (val) editor.chain().focus().setLineHeight(val).run();
  };

  const handleNumberKeyDown = (applyFn) => (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFn();
    }
  };

  const stopEditorEvent = (event) => {
    event.stopPropagation();
  };

  return (
    <div
      className="admin-rich-text-modal"
      role="dialog"
      aria-modal="true"
      aria-label="텍스트 편집"
      onPointerDown={stopEditorEvent}
      onMouseDown={stopEditorEvent}
      onClick={stopEditorEvent}
      onDoubleClick={stopEditorEvent}
    >
      <div className="admin-rich-text-dialog">
        <div className="admin-rich-text-dialog-head">
          <strong>텍스트 편집</strong>
          <button type="button" onClick={onCancel} aria-label="닫기">x</button>
        </div>

        <div className="admin-rich-text-editor">
          <div className="admin-rich-text-toolbar" aria-label="텍스트 서식 도구">
            <select
              ref={fontFamilyRef}
              aria-label="글꼴"
              defaultValue=""
              onMouseDown={(event) => event.stopPropagation()}
              onChange={(event) => editor.chain().focus().setFontFamily(event.currentTarget.value).run()}
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.label} value={font.value}>{font.label}</option>
              ))}
            </select>

            <label className="admin-rich-text-input-label" title="글자 크기(px), Enter로 적용">
              <input
                ref={fontSizeRef}
                type="number"
                className="admin-rich-text-number-input"
                aria-label="글자 크기"
                placeholder="크기"
                min="6"
                max="200"
                step="1"
                onKeyDown={handleNumberKeyDown(applyFontSize)}
                onBlur={applyFontSize}
              />
              <span className="admin-rich-text-input-unit">px</span>
            </label>

            <ToolbarButton active={editor.isActive("bold")} label="가" title="굵게" onClick={() => editor.chain().focus().toggleBold().run()} />
            <ToolbarButton active={editor.isActive("italic")} label="기" title="기울임" onClick={() => editor.chain().focus().toggleItalic().run()} />
            <ToolbarButton active={isUnderline} label="밑" title="밑줄" onClick={() => editor.chain().focus().setTextDecoration(isUnderline ? null : "underline").run()} />
            <ToolbarButton active={editor.isActive("strike")} label="삭" title="취소선" onClick={() => editor.chain().focus().toggleStrike().run()} />

            <input
              type="color"
              aria-label="글자 색상"
              title="글자 색상"
              onInput={(event) => editor.chain().focus().setColor(event.currentTarget.value).run()}
            />

            <label className="admin-rich-text-input-label" title="자간(px), Enter로 적용">
              <input
                ref={letterSpacingRef}
                type="number"
                className="admin-rich-text-number-input"
                aria-label="자간"
                placeholder="자간"
                min="-10"
                max="30"
                step="0.5"
                onKeyDown={handleNumberKeyDown(applyLetterSpacing)}
                onBlur={applyLetterSpacing}
              />
              <span className="admin-rich-text-input-unit">px</span>
            </label>

            <label className="admin-rich-text-input-label" title="줄간격, Enter로 적용">
              <input
                ref={lineHeightRef}
                type="number"
                className="admin-rich-text-number-input"
                aria-label="줄간격"
                placeholder="줄"
                min="0.5"
                max="5"
                step="0.1"
                onKeyDown={handleNumberKeyDown(applyLineHeight)}
                onBlur={applyLineHeight}
              />
            </label>

            <ToolbarButton active={editor.isActive({ textAlign: "left" })} label="좌" title="왼쪽 정렬" onClick={() => editor.chain().focus().setTextAlign("left").run()} />
            <ToolbarButton active={editor.isActive({ textAlign: "center" })} label="중" title="가운데 정렬" onClick={() => editor.chain().focus().setTextAlign("center").run()} />
            <ToolbarButton active={editor.isActive({ textAlign: "right" })} label="우" title="오른쪽 정렬" onClick={() => editor.chain().focus().setTextAlign("right").run()} />
            <ToolbarButton active={editor.isActive("bulletList")} label="•" title="글머리 목록" onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <ToolbarButton active={editor.isActive("orderedList")} label="1." title="번호 목록" onClick={() => editor.chain().focus().toggleOrderedList().run()} />
            <ToolbarButton active={editor.isActive("blockquote")} label="❝" title="인용" onClick={() => editor.chain().focus().toggleBlockquote().run()} />
            <ToolbarButton label="↶" title="실행 취소" onClick={() => editor.chain().focus().undo().run()} />
            <ToolbarButton label="↷" title="다시 실행" onClick={() => editor.chain().focus().redo().run()} />
          </div>
        </div>

        <div className="admin-rich-text-document">
          <EditorContent editor={editor} />
        </div>

        <div className="admin-rich-text-actions">
          <button type="button" className="admin-image-editor-button secondary" onClick={onCancel}>취소</button>
          <button type="button" className="admin-image-editor-button" onClick={() => onSave(editor.getHTML().trim())}>저장</button>
        </div>
      </div>
    </div>
  );
}
