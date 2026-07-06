# 운영 백업 복구 훈련 절차

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
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-icl_demo_root_pw}" \
  icl_pilates -e "SELECT COUNT(*) AS before_count FROM users;"
```

**테스트용 더미 행 삽입 (복구 확인용):**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-icl_demo_root_pw}" \
  icl_pilates -e "
    INSERT INTO users (id, login_id, name, phone_hash, email_hash, grade, created_at)
    VALUES ('drill-test-row', 'drill_test', '복구훈련테스트', 'x', 'x', 'member', NOW());
  "
```

**삽입 확인:**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-icl_demo_root_pw}" \
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
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-icl_demo_root_pw}" \
  icl_pilates -e "SELECT id FROM users WHERE id = 'drill-test-row';"
# → Empty set 이어야 함
```

**users 행 수가 백업 전과 동일한지 확인:**
```bash
docker exec icl-demo-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD:-icl_demo_root_pw}" \
  icl_pilates -e "SELECT COUNT(*) AS after_count FROM users;"
```

---

## 운영 환경 (Docker 미사용) 백업 명령

운영 서버에서 MySQL이 직접 실행되는 경우:

```bash
# 백업
mysqldump -h 127.0.0.1 -uroot -p \
  --single-transaction --routines --triggers --no-tablespaces \
  icl_pilates | gzip > icl_$(date +%Y%m%d_%H%M%S).sql.gz

# 복구
gunzip -c icl_20250612_140000.sql.gz | mysql -h 127.0.0.1 -uroot -p icl_pilates
```

---

## 백업 보관 정책 (권장)

| 보관 주기 | 개수 | 보관 기간 |
|-----------|------|-----------|
| 일 단위   | 7개  | 최근 7일  |
| 주 단위   | 4개  | 최근 4주  |
| 월 단위   | 3개  | 최근 3개월 |

오래된 백업 삭제 예시 (7일 이상 된 파일):
```bash
find ./backups -name "icl_*.sql.gz" -mtime +7 -delete
```
