const MIGRATIONS = [
  {
    id: "20260612_001_studio_class_operating_columns",
    description: "수업별 최소 인원, 대기 정원, 예약·취소·폐강 기준시간 추가",
    async up(connection) {
      const columns = [
        ["min_capacity", "INT NOT NULL DEFAULT 0 COMMENT '수업이 정상 운영되기 위해 필요한 최소 수강 인원입니다.' AFTER capacity"],
        ["waitlist_capacity", "INT NULL COMMENT '예약 정원 초과 시 받을 수 있는 대기 인원입니다. NULL이면 무제한 대기입니다.' AFTER min_capacity"],
        ["booking_deadline_at", "DATETIME NULL COMMENT '회원이 이 수업을 예약할 수 있는 마지막 시각입니다.' AFTER waitlist_capacity"],
        ["cancellation_deadline_at", "DATETIME NULL COMMENT '회원이 이 수업 예약을 취소할 수 있는 마지막 시각입니다.' AFTER booking_deadline_at"],
        ["cancellation_decision_at", "DATETIME NULL COMMENT '최소 인원 미달 등으로 폐강 여부를 판단하는 기준 시각입니다.' AFTER cancellation_deadline_at"],
      ];
      for (const [columnName, definition] of columns) {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) AS count
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_classes' AND COLUMN_NAME = ?`,
          [columnName]
        );
        if (Number(rows?.[0]?.count || 0) === 0) {
          await connection.query(`ALTER TABLE studio_classes ADD COLUMN ${columnName} ${definition}`);
        }
      }
    },
  },
  {
    id: "20260612_002_external_import_keys",
    description: "엑셀 재이관 시 회원 수강권과 수업 일정 중복 생성을 막는 식별키 추가",
    async up(connection) {
      const targets = [
        ["studio_passes", "ux_studio_passes_external_import_key"],
        ["studio_classes", "ux_studio_classes_external_import_key"],
      ];
      for (const [tableName, indexName] of targets) {
        const [columnRows] = await connection.execute(
          `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'external_import_key'`,
          [tableName]
        );
        if (Number(columnRows?.[0]?.count || 0) === 0) {
          await connection.query(
            `ALTER TABLE ${tableName} ADD COLUMN external_import_key VARCHAR(64) NULL
             COMMENT '외부 엑셀에서 가져온 동일 데이터를 다시 등록하지 않기 위한 식별값입니다.'`
          );
        }
        const [indexRows] = await connection.execute(
          `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
          [tableName, indexName]
        );
        if (Number(indexRows?.[0]?.count || 0) === 0) {
          await connection.query(`ALTER TABLE ${tableName} ADD UNIQUE INDEX ${indexName} (external_import_key)`);
        }
      }
    },
  },
  {
    id: "20260612_003_studio_staff_user_link",
    description: "강사·매니저 프로필과 실제 로그인 계정을 1:1로 연결",
    async up(connection) {
      const [columnRows] = await connection.execute(
        `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_staff_profiles' AND COLUMN_NAME = 'user_id'`,
      );
      if (Number(columnRows?.[0]?.count || 0) === 0) {
        await connection.query(
          `ALTER TABLE studio_staff_profiles
           ADD COLUMN user_id VARCHAR(64) NULL
           COMMENT '이 직원이 로그인할 때 사용하는 통합회원 계정(users.id)입니다. 연결된 계정에 역할별 관리자 권한이 적용됩니다.'
           AFTER id`,
        );
      }

      const [indexRows] = await connection.execute(
        `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_staff_profiles'
           AND INDEX_NAME = 'ux_studio_staff_profiles_user'`,
      );
      if (Number(indexRows?.[0]?.count || 0) === 0) {
        await connection.query(
          `ALTER TABLE studio_staff_profiles
           ADD UNIQUE INDEX ux_studio_staff_profiles_user (user_id)`,
        );
      }

      const [constraintRows] = await connection.execute(
        `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_staff_profiles'
           AND CONSTRAINT_NAME = 'fk_studio_staff_profiles_user'`,
      );
      if (Number(constraintRows?.[0]?.count || 0) === 0) {
        await connection.query(
          `ALTER TABLE studio_staff_profiles
           ADD CONSTRAINT fk_studio_staff_profiles_user
           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`,
        );
      }
    },
  },
];

/** 적용한 스키마 변경 이력을 남기고 아직 실행하지 않은 변경만 순서대로 적용합니다. */
export async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(120) PRIMARY KEY COMMENT '스키마 변경 작업의 고유 이름입니다.',
      description VARCHAR(255) NOT NULL COMMENT '비개발자도 이해할 수 있는 변경 설명입니다.',
      applied_at DATETIME NOT NULL COMMENT '변경 작업이 실제 DB에 적용된 날짜와 시간입니다.'
    ) COMMENT='DB 구조 변경 이력을 기록해 같은 변경이 중복 실행되지 않도록 관리합니다.'
  `);

  const [appliedRows] = await pool.query(`SELECT id FROM schema_migrations`);
  const appliedIds = new Set((appliedRows || []).map((row) => String(row.id)));

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await migration.up(connection);
      await connection.execute(
        `INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, NOW())`,
        [migration.id, migration.description]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
