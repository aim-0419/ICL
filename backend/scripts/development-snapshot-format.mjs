// 파일 역할: 개발 DB 스냅샷 파일의 형식과 검증 규칙을 정의합니다.
//
// DB 접속이 필요한 부분은 snapshot-development-db.mjs와 restore-development-db.mjs에 두고,
// 값 변환·지문 계산·스키마 비교처럼 순수한 판단만 여기 모읍니다.
// 이렇게 나눠야 DB 없이 테스트할 수 있습니다.
import { createHash } from "node:crypto";

export const DEVELOPMENT_SNAPSHOT_VERSION = 1;

// BLOB 같은 이진 값은 JSON으로 그대로 담을 수 없어 표식을 붙여 base64로 보관합니다.
const BUFFER_MARKER = "__buffer__";

// 함수 역할: DB에서 읽은 값 하나를 JSON에 담을 수 있는 형태로 바꿉니다.
// 날짜와 BIGINT는 조회 단계에서 문자열로 받아오므로 여기서는 손대지 않습니다.
// 문자열로 받는 이유는 시간대 해석이나 정밀도 손실 없이 그대로 되돌리기 위해서입니다.
export function serializeSnapshotValue(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return { [BUFFER_MARKER]: value.toString("base64") };
  if (value instanceof Date) return value.toISOString();
  return value;
}

// 함수 역할: 스냅샷 파일에서 읽은 값을 DB에 넣을 수 있는 형태로 되돌립니다.
export function deserializeSnapshotValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && typeof value[BUFFER_MARKER] === "string") {
    return Buffer.from(value[BUFFER_MARKER], "base64");
  }
  return value;
}

// 함수 역할: JSON 컬럼을 파싱하지 않고 원본 텍스트 그대로 읽게 합니다.
//
// mysql2는 기본적으로 JSON 컬럼을 JS 값으로 파싱합니다. 그러면 JSON 문자열 값
// `"안녕"` 이 평범한 JS 문자열 `안녕` 이 되어, 되돌릴 때 MySQL이 JSON 텍스트로
// 인식하지 못하고 `Invalid JSON text` 로 거부합니다.
//
// field.string() 만 쓰면 JSON 컬럼을 BINARY로 읽어 한글이 깨지므로 utf8을 명시합니다.
export function snapshotTypeCast(field, next) {
  if (field.type === "JSON") return field.string("utf8");
  return next();
}

// 함수 역할: 테이블과 컬럼 구성을 하나의 지문 문자열로 요약합니다.
//
// 스냅샷을 뜬 시점과 되돌리는 시점의 스키마가 다르면 조용히 이상하게 복원됩니다.
// 지문을 같이 저장해 두면 그 상황을 복원 전에 알아챌 수 있습니다.
export function buildSchemaFingerprint(schema) {
  const normalized = [...schema.entries()]
    .map(([table, columns]) => `${table}:${[...columns].sort().join(",")}`)
    .sort()
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

// 함수 역할: 스냅샷의 스키마와 현재 DB의 스키마 차이를 정리해 돌려줍니다.
//
// missingTables / missingColumns 는 복원을 막아야 하는 차이입니다.
// 스냅샷에 있는 데이터를 넣을 자리가 DB에 없다는 뜻이라, 진행하면 데이터가 조용히 사라집니다.
//
// addedTables / addedColumns 는 막을 필요가 없습니다.
// 스냅샷 이후에 스키마가 추가된 것이고, 복원하면 그 자리는 기본값으로 채워집니다.
// 다만 사용자가 알고 넘어가야 하므로 결과에 담아 보고합니다.
export function describeSchemaGap(snapshotSchema, currentSchema) {
  const missingTables = [];
  const missingColumns = [];
  const addedTables = [];
  const addedColumns = [];

  for (const [table, columns] of snapshotSchema.entries()) {
    if (!currentSchema.has(table)) {
      missingTables.push(table);
      continue;
    }
    const currentColumns = currentSchema.get(table);
    for (const column of columns) {
      if (!currentColumns.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  for (const [table, columns] of currentSchema.entries()) {
    if (!snapshotSchema.has(table)) {
      addedTables.push(table);
      continue;
    }
    const snapshotColumns = snapshotSchema.get(table);
    for (const column of columns) {
      if (!snapshotColumns.has(column)) addedColumns.push(`${table}.${column}`);
    }
  }

  return {
    missingTables: missingTables.sort(),
    missingColumns: missingColumns.sort(),
    addedTables: addedTables.sort(),
    addedColumns: addedColumns.sort(),
    restorable: missingTables.length === 0 && missingColumns.length === 0,
  };
}

// 함수 역할: 스냅샷 파일의 최상위 구조가 이 도구가 만든 것이 맞는지 확인합니다.
// 다른 파일을 잘못 지정했을 때 DB를 비우기 전에 멈추기 위한 검사입니다.
export function assertSnapshotShape(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== "object") errors.push("snapshot must be an object");
  if (snapshot?.version !== DEVELOPMENT_SNAPSHOT_VERSION) errors.push("snapshot version is not supported");
  if (snapshot?.database !== "homepage_dev") errors.push("snapshot database must be homepage_dev");
  if (typeof snapshot?.schemaFingerprint !== "string" || !snapshot.schemaFingerprint) {
    errors.push("snapshot schema fingerprint is missing");
  }
  if (!Array.isArray(snapshot?.tables)) errors.push("snapshot tables must be an array");

  for (const table of snapshot?.tables ?? []) {
    if (!/^[A-Za-z0-9_]+$/.test(String(table?.name ?? ""))) errors.push("snapshot table name is unsafe");
    if (!Array.isArray(table?.columns)) errors.push(`snapshot table ${table?.name} has no columns`);
    if (!Array.isArray(table?.rows)) errors.push(`snapshot table ${table?.name} has no rows`);
  }

  if (errors.length > 0) throw new Error(`[dev-snapshot] ${errors.join("; ")}`);
}

// 함수 역할: 스냅샷 파일의 테이블 목록을 스키마 Map으로 바꿉니다. 비교에 사용합니다.
export function snapshotSchemaOf(snapshot) {
  return new Map(snapshot.tables.map((table) => [table.name, new Set(table.columns)]));
}
