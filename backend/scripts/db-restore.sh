#!/usr/bin/env bash
# icl-pilates Docker 데모 환경 DB 복구 스크립트
# 사용법: ./db-restore.sh <백업파일.sql.gz>
# 경고: 기존 데이터를 완전히 덮어씁니다. 반드시 확인 후 실행하세요.

set -euo pipefail

BACKUP_FILE="${1:-}"
CONTAINER="icl-demo-mysql"
DB="${MYSQL_DATABASE:-icl_pilates}"
ROOT_PW="${MYSQL_ROOT_PASSWORD:-icl_demo_root_pw}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "사용법: $0 <백업파일.sql.gz>"
  echo "예시:   $0 ./backups/icl_20250612_140000.sql.gz"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[오류] 파일을 찾을 수 없습니다: ${BACKUP_FILE}"
  exit 1
fi

# 컨테이너 상태 확인
if ! docker inspect --format '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q "true"; then
  echo "[오류] 컨테이너 '${CONTAINER}'가 실행 중이지 않습니다."
  exit 1
fi

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "──────────────────────────────────────────────"
echo " 복구 대상  : ${CONTAINER}/${DB}"
echo " 백업 파일  : ${BACKUP_FILE} (${SIZE})"
echo " 경고       : 기존 데이터 전체가 덮어쓰여집니다."
echo "──────────────────────────────────────────────"
read -r -p "계속하려면 'yes' 입력: " CONFIRM

if [[ "${CONFIRM}" != "yes" ]]; then
  echo "취소됨."
  exit 0
fi

echo "[복구] 시작..."
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
  mysql -uroot -p"${ROOT_PW}" "${DB}"

echo "[복구] 완료."
echo "복구 검증: docker exec ${CONTAINER} mysql -uroot -p${ROOT_PW} ${DB} -e 'SHOW TABLES;'"
