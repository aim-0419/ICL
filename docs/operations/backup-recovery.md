# 운영 DB 백업·복구 훈련 절차

> 이 문서의 복구 드릴은 운영 DB가 아닌 격리된 훈련용 DB에서만 실행합니다. 실행 전에 별도 백업과 대상 DB 이름을 다시 확인합니다.

> 범위: 이 문서는 MySQL DB 백업·복구만 다룹니다. `UPLOAD_ROOT`의 업로드 파일, Git 저장소, 배포 산출물은 현재 저장소에서 자동 백업 절차가 확인되지 않으므로 별도 운영 정책이 필요합니다.

## 전제조건

- Docker Desktop 실행 중
- `docker compose up -d` 로 `icl-demo-mysql` 컨테이너 기동 확인
- Git Bash 또는 Linux/macOS 터미널 (Windows는 Git Bash 사용)

---

## 1단계: 백업 생성

```bash
cd backend/scripts
bash db-backup.sh
```

성공 시 출력 예:
```
[백업] DB: icl_pilates, 컨테이너: icl-demo-mysql
[백업] 출력: ./backups/icl_20250612_140000.sql.gz
[백업] 완료: 124K (./backups/icl_20250612_140000.sql.gz)
```

백업 파일 경로를 기록해 둔다.

---

## 2단계: 백업 파일 검증

```bash
# 압축 파일 내용 일부 확인 (첫 20줄)
gunzip -c ./backups/icl_20250612_140000.sql.gz | head -20

# 테이블 목록 확인
gunzip -c ./backups/icl_20250612_140000.sql.gz | grep "^CREATE TABLE" | sort
```

`CREATE TABLE users`, `CREATE TABLE orders` 등이 보이면 백업 정상.

---

## 3단계: 복구 드릴 (데이터 변조 → 복구)

**현재 users 테이블 행 수 기록:**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}" \
  icl_pilates -e "SELECT COUNT(*) AS before_count FROM users;"
```

**테스트용 더미 행 삽입 (복구 확인용):**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}" \
  icl_pilates -e "
    INSERT INTO users (id, login_id, name, phone_hash, email_hash, grade, created_at)
    VALUES ('drill-test-row', 'drill_test', '복구훈련테스트', 'x', 'x', 'member', NOW());
  "
```

**삽입 확인:**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}" \
  icl_pilates -e "SELECT id, name FROM users WHERE id = 'drill-test-row';"
```

---

## 4단계: 백업에서 복구

```bash
bash db-restore.sh ./backups/icl_20250612_140000.sql.gz
```

`yes` 입력 후 진행. 완료 메시지 확인.

---

## 5단계: 복구 검증

**더미 행이 사라졌는지 확인 (복구 성공 지표):**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}" \
  icl_pilates -e "SELECT id FROM users WHERE id = 'drill-test-row';"
# → Empty set 이어야 함
```

**users 행 수가 백업 전과 동일한지 확인:**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}" \
  icl_pilates -e "SELECT COUNT(*) AS after_count FROM users;"
```

---

## 운영 환경 (Docker 미사용) 백업 명령

운영 서버에서 MySQL이 직접 실행되는 경우:

```bash
# 백업 전용 계정과 최소 권한을 사용하고 비밀번호는 프롬프트에서 입력합니다.
mysqldump -h 127.0.0.1 -u백업전용계정 -p \
  --single-transaction --routines --triggers --no-tablespaces \
  icl_pilates | gzip > icl_$(date +%Y%m%d_%H%M%S).sql.gz

# 복구는 승인된 유지보수 시간에 별도 복구 계정으로 실행합니다.
gunzip -c icl_20250612_140000.sql.gz | mysql -h 127.0.0.1 -u복구전용계정 -p icl_pilates
```

---

## 백업 보관 정책 (권장)

| 보관 주기 | 개수 | 보관 기간 |
|-----------|------|-----------|
| 일 단위   | 7개  | 최근 7일  |
| 주 단위   | 4개  | 최근 4주  |
| 월 단위   | 3개  | 최근 3개월 |

오래된 백업은 먼저 삭제 후보를 확인한 뒤 승인된 경우에만 정리합니다.
```bash
# 삭제 후보 확인
find ./backups -name "icl_*.sql.gz" -mtime +7 -print

# 확인 및 승인 후 삭제
find ./backups -name "icl_*.sql.gz" -mtime +7 -delete
```

> 최종 점검: 2026-07-29. 명령 예시는 자격 증명을 포함하지 않으며, 실제 실행 전 대상 DB와 보관 정책 승인이 필요합니다.
