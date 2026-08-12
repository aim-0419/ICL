#!/usr/bin/env bash
# Local Docker development database backup. This script never targets production.

set -euo pipefail

CONTAINER="icl-dev-mysql"
OUTPUT_DIR="${1:-./backups}"
DB="${MYSQL_DATABASE:-homepage_dev}"
ROOT_PW="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${OUTPUT_DIR}/homepage_dev_${TIMESTAMP}.sql.gz"

if [[ "${DB}" != "homepage_dev" ]]; then
  echo "[backup] Refusing to back up a database other than homepage_dev."
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

if ! docker inspect --format '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q "true"; then
  echo "[backup] Container '${CONTAINER}' is not running."
  exit 1
fi

echo "[backup] Development database backup started: ${DB}"
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
echo "[backup] Completed: ${SIZE} (${BACKUP_FILE})"
