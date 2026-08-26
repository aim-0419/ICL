/**
 * [데이터베이스 연결 도구]
 *
 * 데이터베이스에 연결하고 질의를 보내는 공통 도구입니다.
 * 연결을 미리 여러 개 만들어 두고 돌려쓰기 때문에
 * 요청이 올 때마다 새로 연결하느라 느려지지 않습니다.
 */
import { AsyncLocalStorage } from "node:async_hooks";

function normalizeRows(result) {
  return Array.isArray(result) ? result[0] : result;
}

export function createDatabaseClient(pool) {
  const txStore = new AsyncLocalStorage();

  async function runQuery(sql, params = []) {
    const connection = txStore.getStore();
    const runner = connection || pool;
    const execute = typeof runner.query === "function" ? runner.query.bind(runner) : runner.execute.bind(runner);
    return execute(sql, params);
  }

  return {
    async query(sql, params = []) {
      return normalizeRows(await runQuery(sql, params));
    },

    async queryOne(sql, params = []) {
      const rows = normalizeRows(await runQuery(sql, params));
      return Array.isArray(rows) ? (rows[0] || null) : null;
    },

    async withTransaction(fn) {
      const currentConnection = txStore.getStore();
      if (currentConnection) {
        return fn(currentConnection);
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await txStore.run(connection, () => fn(connection));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
