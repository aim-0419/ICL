import { AsyncLocalStorage } from "node:async_hooks";

/**
 * MySQL pool을 애플리케이션용 DB 클라이언트로 감쌉니다.
 * 트랜잭션 안에서 공용 query()를 호출해도 같은 커넥션을 사용하도록 보장합니다.
 */
export function createDatabaseClient(pool) {
  const transactionContext = new AsyncLocalStorage();

  function getExecutor() {
    return transactionContext.getStore()?.connection || pool;
  }

  async function query(sql, params = []) {
    const [rows] = await getExecutor().execute(sql, params);
    return rows;
  }

  async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] ?? null;
  }

  async function withTransaction(fn) {
    const activeConnection = transactionContext.getStore()?.connection;
    if (activeConnection) return fn(activeConnection);

    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      const result = await transactionContext.run({ connection }, () => fn(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  return { query, queryOne, withTransaction };
}
