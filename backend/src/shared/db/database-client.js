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
