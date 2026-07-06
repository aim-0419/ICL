#!/usr/bin/env bash
# icl-pilates Docker 데모 환경 DB 백업 스크립트
# 사용법: ./db-backup.sh [출력디렉토리]
# 기본값: ./backups/ 디렉토리에 icl_YYYYMMDD_HHMMSS.sql.gz 저장

set -euo pipefail

CONTAINER="icl-demo-mysql"
OUTPUT_DIR="${1:-./backups}"
DB="${MYSQL_DATABASE:-icl_pilates}"
ROOT_PW="${MYSQL_ROOT_PASSWORD:-icl_demo_root_pw}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${OUTPUT_DIR}/icl_${TIMESTAMP}.sql.gz"

mkdir -p "${OUTPUT_DIR}"

# 컨테이너 상태 확인
if ! docker inspect --format '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q "true"; then
  echo "[오류] 컨테이너 '${CONTAINER}'가 실행 중이지 않습니다."
  echo "  docker compose up -d 으로 시작 후 재시도하세요."
  exit 1
fi

echo "[백업] DB: ${DB}, 컨테이너: ${CONTAINER}"
echo "[백업] 출력: ${BACKUP_FILE}"

docker exec "${CONTAINER}" \
  mysqldump \
    -uroot -p"${ROOT_PW}" \
    --single-transaction \
    --routines \
    --triggers \
    --no-tablespaces \
    "${DB}" \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[백업] 완료: ${SIZE} (${BACKUP_FILE})"
