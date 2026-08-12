#!/usr/bin/env bash
# Local Docker development database restore. This script never targets production.

set -euo pipefail

BACKUP_FILE="${1:-}"
CONTAINER="icl-dev-mysql"
DB="${MYSQL_DATABASE:-homepage_dev}"
ROOT_PW="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}"

if [[ -z "${BACKUP_FILE}" || ! -f "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <homepage_dev backup.sql.gz>"
  exit 1
fi

if [[ "${DB}" != "homepage_dev" ]]; then
  echo "[restore] Refusing to restore a database other than homepage_dev."
  exit 1
fi

if ! docker inspect --format '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q "true"; then
  echo "[restore] Container '${CONTAINER}' is not running."
  exit 1
fi

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "Restore target: ${CONTAINER}/${DB}"
echo "Backup file: ${BACKUP_FILE} (${SIZE})"
echo "This replaces data in the local homepage_dev Docker database only."
read -r -p "Type 'RESTORE homepage_dev' to continue: " CONFIRM

if [[ "${CONFIRM}" != "RESTORE homepage_dev" ]]; then
  echo "Restore cancelled."
  exit 0
fi

gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
  mysql -uroot -p"${ROOT_PW}" "${DB}"

echo "[restore] Completed. Verify the development application before continuing."
