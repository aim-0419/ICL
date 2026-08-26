/**
 * [엑셀 파일로 내려받기]
 *
 * 관리자 화면의 표 내용을 엑셀 파일로 만들어 내려받게 해 줍니다.
 */
const encoder = new TextEncoder();

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function buildSheetXml(rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const columnCount = Math.max(1, ...normalizedRows.map((row) => Array.isArray(row) ? row.length : 0));
  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const longest = normalizedRows.reduce((max, row) => Math.max(max, String(row?.[columnIndex] ?? "").length), 0);
    return Math.min(45, Math.max(10, longest + 3));
  });
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheetRows = normalizedRows.map((row, rowIndex) => {
    const cells = (Array.isArray(row) ? row : []).map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? " s=\"1\"" : "";
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"${style}><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const lastRef = `${columnName(columnCount - 1)}${Math.max(1, normalizedRows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastRef}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:${columnName(columnCount - 1)}1"/>
</worksheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(view, offset, value) { view.setUint16(offset, value, true); }
function writeU32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const year = Math.max(1980, date.getFullYear());
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const { time, day } = dosDateTime();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    writeU32(localView, 0, 0x04034b50); writeU16(localView, 4, 20); writeU16(localView, 6, 0x0800);
    writeU16(localView, 8, 0); writeU16(localView, 10, time); writeU16(localView, 12, day);
    writeU32(localView, 14, crc); writeU32(localView, 18, data.length); writeU32(localView, 22, data.length);
    writeU16(localView, 26, name.length); writeU16(localView, 28, 0);
    localParts.push(localHeader, name, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    writeU32(centralView, 0, 0x02014b50); writeU16(centralView, 4, 20); writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0x0800); writeU16(centralView, 10, 0); writeU16(centralView, 12, time); writeU16(centralView, 14, day);
    writeU32(centralView, 16, crc); writeU32(centralView, 20, data.length); writeU32(centralView, 24, data.length);
    writeU16(centralView, 28, name.length); writeU16(centralView, 30, 0); writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0); writeU16(centralView, 36, 0); writeU32(centralView, 38, 0); writeU32(centralView, 42, localOffset);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeU32(endView, 0, 0x06054b50); writeU16(endView, 4, 0); writeU16(endView, 6, 0);
  writeU16(endView, 8, entries.length); writeU16(endView, 10, entries.length);
  writeU32(endView, 12, centralDirectory.length); writeU32(endView, 16, localOffset); writeU16(endView, 20, 0);
  return concatBytes([...localParts, centralDirectory, end]);
}

function sanitizeSheetName(value, index) {
  const cleaned = String(value || `시트${index + 1}`).replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31);
  return cleaned || `시트${index + 1}`;
}

// [현재 미사용] 엑셀 파일 데이터를 만듭니다. 현재 직접 호출하는 곳이 없습니다.
export function createXlsxBlob(sheets) {
  const normalizedSheets = (Array.isArray(sheets) ? sheets : []).map((sheet, index) => ({
    name: sanitizeSheetName(sheet?.name, index),
    rows: Array.isArray(sheet?.rows) ? sheet.rows : [],
  }));
  if (!normalizedSheets.length) normalizedSheets.push({ name: "데이터", rows: [["데이터 없음"]] });

  const sheetOverrides = normalizedSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`;
  const workbookSheets = normalizedSheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`;
  const workbookRels = normalizedSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const stylesId = normalizedSheets.length + 1;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
  const entries = [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}<Relationship Id="rId${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: styles },
    ...normalizedSheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: buildSheetXml(sheet.rows) })),
  ];
  return new Blob([createZip(entries)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadXlsx(filename, sheets) {
  const safeName = String(filename || "export.xlsx").toLowerCase().endsWith(".xlsx") ? String(filename) : `${filename}.xlsx`;
  const url = URL.createObjectURL(createXlsxBlob(sheets));
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
