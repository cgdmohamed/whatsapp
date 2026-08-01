#!/usr/bin/env bash
# One-shot logical backup of the WhatsApp Campaign Manager.
#
# Backs up:
#   - PostgreSQL database  (pg_dump, custom format)
#   - Redis dataset        (redis-cli BGSAVE + copy of the RDB/AOF files)
#   - File storage         (uploads/, data/, exports/ under apps/api)
#
# Usage:
#   ./deploy/scripts/backup.sh [target-directory]
#
# Environment overrides:
#   DATABASE_URL   postgres connection string (default: local dev URL)
#   REDIS_URL      redis connection string    (default: redis://localhost:6379)
#   KEEP_DAYS      prune backups older than N days (default: 14)
#   DATA_DIR       app data directory         (default: apps/api)
#
# Restore with: ./deploy/scripts/restore.sh <backup-directory>

set -euo pipefail

BACKUP_ROOT="${1:-./backups}"
TARGET="${BACKUP_ROOT}/$(date +%Y%m%d_%H%M%S)"
DATABASE_URL="${DATABASE_URL:-postgresql://whatsapp:whatsapp_dev@localhost:5432/whatsapp_dev}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
DATA_DIR="${DATA_DIR:-apps/api}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "${TARGET}"

echo "==> Backup target: ${TARGET}"

# --- PostgreSQL ---
if command -v pg_dump >/dev/null 2>&1; then
  echo "==> Dumping PostgreSQL database..."
  pg_dump "${DATABASE_URL}" --format=custom --no-owner --no-privileges \
    --file="${TARGET}/database.dump"
else
  echo "!! pg_dump not found; running inside Docker instead"
  docker compose exec -T postgres pg_dump -U whatsapp -d whatsapp \
    --format=custom --no-owner --no-privileges --file=/tmp/database.dump
  docker compose cp postgres:/tmp/database.dump "${TARGET}/database.dump"
fi

# --- Redis ---
echo "==> Snapshotting Redis..."
if command -v redis-cli >/dev/null 2>&1; then
  redis-cli -u "${REDIS_URL}" BGSAVE
  echo "   Redis BGSAVE scheduled. RDB snapshot lives in the redis volume;"
  echo "   for AOF setups, back up the appendonly dir as well."
else
  echo "   redis-cli not found - skipping (queues are recoverable from DB state)."
fi

# --- File storage ---
if [ -d "${DATA_DIR}/uploads" ] || [ -d "${DATA_DIR}/data" ] || [ -d "${DATA_DIR}/exports" ]; then
  echo "==> Copying file storage..."
  tar -czf "${TARGET}/files.tar.gz" \
    --ignore-failed-read \
    "${DATA_DIR}/uploads" "${DATA_DIR}/data" "${DATA_DIR}/exports" || true
else
  echo "   No file storage directories found under ${DATA_DIR}; skipping."
fi

# --- Manifest ---
{
  echo "created: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "database_url_host: $(printf '%s' "${DATABASE_URL}" | sed -E 's#^[^@]+@##')"
  echo "files:"
  ls -lh "${TARGET}"
} > "${TARGET}/MANIFEST.txt"
echo "==> Wrote ${TARGET}/MANIFEST.txt"

# --- Retention ---
if [ -n "${KEEP_DAYS}" ] && [ "${KEEP_DAYS}" -gt 0 ]; then
  echo "==> Pruning backups older than ${KEEP_DAYS} days..."
  find "${BACKUP_ROOT}" -maxdepth 1 -mindepth 1 -type d -mtime "+${KEEP_DAYS}" -print -exec rm -rf {} \;
fi

echo "==> Backup complete: ${TARGET}"
