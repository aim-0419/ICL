import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVELOPMENT_SNAPSHOT_VERSION,
  assertSnapshotShape,
  buildSchemaFingerprint,
  describeSchemaGap,
  deserializeSnapshotValue,
  serializeSnapshotValue,
  snapshotSchemaOf,
  snapshotTypeCast,
} from "../scripts/development-snapshot-format.mjs";

function schemaOf(entries) {
  return new Map(entries.map(([table, columns]) => [table, new Set(columns)]));
}

test("이진 값은 표식과 함께 base64로 보관되고 원본으로 되돌아온다", () => {
  const original = Buffer.from([0x00, 0xff, 0x10]);
  const restored = deserializeSnapshotValue(serializeSnapshotValue(original));

  assert.ok(Buffer.isBuffer(restored));
  assert.deepEqual([...restored], [...original]);
});

test("문자열과 숫자와 null은 그대로 오간다", () => {
  for (const value of ["2026-08-19 09:00:00", "9007199254740993", 42, null]) {
    assert.equal(deserializeSnapshotValue(serializeSnapshotValue(value)), value);
  }
});

test("스키마 지문은 테이블과 컬럼 순서가 달라도 같게 나온다", () => {
  const a = schemaOf([["users", ["id", "email"]], ["studio_passes", ["id", "user_id"]]]);
  const b = schemaOf([["studio_passes", ["user_id", "id"]], ["users", ["email", "id"]]]);

  assert.equal(buildSchemaFingerprint(a), buildSchemaFingerprint(b));
});

test("컬럼이 하나만 달라도 지문이 달라진다", () => {
  const a = schemaOf([["users", ["id", "email"]]]);
  const b = schemaOf([["users", ["id", "email", "platform"]]]);

  assert.notEqual(buildSchemaFingerprint(a), buildSchemaFingerprint(b));
});

test("스냅샷에만 있는 테이블이나 컬럼이 있으면 복원 불가로 판정한다", () => {
  const snapshot = schemaOf([["users", ["id", "birth_year"]], ["studio_passes", ["id"]]]);
  const current = schemaOf([["users", ["id"]]]);
  const gap = describeSchemaGap(snapshot, current);

  assert.equal(gap.restorable, false);
  assert.deepEqual(gap.missingTables, ["studio_passes"]);
  assert.deepEqual(gap.missingColumns, ["users.birth_year"]);
});

test("스냅샷 이후 추가된 스키마는 복원을 막지 않고 보고만 한다", () => {
  const snapshot = schemaOf([["users", ["id"]]]);
  const current = schemaOf([["users", ["id", "platform"]], ["studio_notices", ["id"]]]);
  const gap = describeSchemaGap(snapshot, current);

  assert.equal(gap.restorable, true);
  assert.deepEqual(gap.addedTables, ["studio_notices"]);
  assert.deepEqual(gap.addedColumns, ["users.platform"]);
});

test("다른 DB나 다른 버전의 파일은 형식 검사에서 걸린다", () => {
  const valid = {
    version: DEVELOPMENT_SNAPSHOT_VERSION,
    database: "homepage_dev",
    schemaFingerprint: "abc",
    tables: [{ name: "users", columns: ["id"], rows: [["u1"]] }],
  };

  assert.doesNotThrow(() => assertSnapshotShape(valid));
  assert.throws(() => assertSnapshotShape({ ...valid, database: "icl_pilates" }), /homepage_dev/);
  assert.throws(() => assertSnapshotShape({ ...valid, version: 99 }), /version/);
  assert.throws(() => assertSnapshotShape({ ...valid, schemaFingerprint: "" }), /fingerprint/);
});

test("테이블 이름에 이상한 문자가 있으면 거부한다", () => {
  const snapshot = {
    version: DEVELOPMENT_SNAPSHOT_VERSION,
    database: "homepage_dev",
    schemaFingerprint: "abc",
    tables: [{ name: "users; DROP TABLE users", columns: ["id"], rows: [] }],
  };

  assert.throws(() => assertSnapshotShape(snapshot), /unsafe/);
});

test("스냅샷 파일에서 스키마 Map을 복원한다", () => {
  const snapshot = {
    version: DEVELOPMENT_SNAPSHOT_VERSION,
    database: "homepage_dev",
    schemaFingerprint: "abc",
    tables: [{ name: "users", columns: ["id", "email"], rows: [] }],
  };

  const schema = snapshotSchemaOf(snapshot);
  assert.deepEqual([...schema.get("users")].sort(), ["email", "id"]);
});

test("JSON 컬럼은 파싱하지 않고 utf8 원본 텍스트로 읽는다", () => {
  // mysql2가 JSON 컬럼을 파싱해 버리면 JSON 문자열 값이 평범한 문자열이 되어
  // 되돌릴 때 Invalid JSON text 로 거부된다. 원본 텍스트를 그대로 가져와야 한다.
  const calls = [];
  const jsonField = { type: "JSON", string: (encoding) => { calls.push(encoding); return '{"a":1}'; } };

  assert.equal(snapshotTypeCast(jsonField, () => "parsed"), '{"a":1}');
  assert.deepEqual(calls, ["utf8"], "BINARY로 읽으면 한글이 깨지므로 utf8을 넘겨야 한다");
});

test("JSON이 아닌 컬럼은 기본 변환을 그대로 쓴다", () => {
  const textField = { type: "VAR_STRING", string: () => "raw" };
  assert.equal(snapshotTypeCast(textField, () => "default"), "default");
});
