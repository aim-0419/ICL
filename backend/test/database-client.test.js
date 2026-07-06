import assert from "node:assert/strict";
import test from "node:test";
import { createDatabaseClient } from "../src/shared/db/database-client.js";

function createFakeDatabase() {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push("begin"); },
    async execute(sql) { calls.push(`connection:${sql}`); return [[{ source: "connection" }]]; },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  };
  const pool = {
    async execute(sql) { calls.push(`pool:${sql}`); return [[{ source: "pool" }]]; },
    async getConnection() { calls.push("getConnection"); return connection; },
  };
  return { calls, connection, pool };
}

test("트랜잭션 밖의 query는 pool을 사용한다", async () => {
  const fake = createFakeDatabase();
  const db = createDatabaseClient(fake.pool);
  const rows = await db.query("SELECT outside");
  assert.equal(rows[0].source, "pool");
  assert.deepEqual(fake.calls, ["pool:SELECT outside"]);
});

test("트랜잭션 안의 공용 query는 같은 connection을 사용하고 커밋한다", async () => {
  const fake = createFakeDatabase();
  const db = createDatabaseClient(fake.pool);
  await db.withTransaction(async () => {
    const rows = await db.query("SELECT inside");
    assert.equal(rows[0].source, "connection");
  });
  assert.deepEqual(fake.calls, ["getConnection", "begin", "connection:SELECT inside", "commit", "release"]);
});

test("트랜잭션 작업이 실패하면 롤백하고 오류를 다시 전달한다", async () => {
  const fake = createFakeDatabase();
  const db = createDatabaseClient(fake.pool);
  await assert.rejects(
    db.withTransaction(async () => {
      await db.query("UPDATE failure");
      throw new Error("실패");
    }),
    /실패/
  );
  assert.deepEqual(fake.calls, ["getConnection", "begin", "connection:UPDATE failure", "rollback", "release"]);
});

test("중첩 withTransaction은 새 커넥션을 만들지 않는다", async () => {
  const fake = createFakeDatabase();
  const db = createDatabaseClient(fake.pool);
  await db.withTransaction(async () => {
    await db.withTransaction(async (connection) => {
      assert.equal(connection, fake.connection);
      await db.query("SELECT nested");
    });
  });
  assert.equal(fake.calls.filter((call) => call === "getConnection").length, 1);
  assert.equal(fake.calls.filter((call) => call === "commit").length, 1);
});
