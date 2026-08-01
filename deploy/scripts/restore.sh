#!/usr/bin/env bash
# Restore a backup produced by deploy/scripts/backup.sh.
#
# WARNING: This DROPS and recreates the target database before restoring.
# Run it with the app stopped (e.g. `pm2 stop api worker` or
# `docker compose stop api worker`) to avoid writing to a stale dataset.
#
# Usage:
#   ./deploy/scripts/restore.sh <backup-directory>
#
# Environment overrides:
#   DATABASE_URL   postgres connection string (default: local dev URL)
#   DATA_DIR       app data directory         (default: apps/api)

set -euo pipefail

BACKUP="${1:?Usage: restore.sh <backup-directory>}"
DATABASE_URL="${DATABASE_URL:-postgresql://whatsapp:whatsapp_dev@localhost:5432/whatsapp_dev}"
DATA_DIR="${DATA_DIR:-apps/api}"

if [ ! -d "${BACKUP}" ]; then
  echo "!! Backup directory not found: ${BACKUP}" >&2
  exit 1
fi

echo "==> Restoring from: ${BACKUP}"
echo "!! This will DROP all data in the target database. Stop the app first."

# --- PostgreSQL ---
if [ -f "${BACKUP}/database.dump" ]; then
  echo "==> Dropping and recreating the database (may require admin rights)..."
  DB_NAME="${DATABASE_URL##*/}"
  DB_NAME="${DB_NAME%%\?*}"
  if command -v dropdb >/dev/null 2>&1 && command -v createdb >/dev/null 2>&1; then
    dropdb --if-exists "${DATABASE_URL}"
    createdb "${DATABASE_URL}"
  else
    echo "   dropdb/createdb not found; ensure the target DB is empty before continuing."
  fi

  echo "==> Restoring PostgreSQL database..."
  if command -v pg_restore >/dev/null 2>&1; then
    pg_restore "${DATABASE_URL}" --no-owner --no-privileges --clean --if-exists \
      --file="${BACKUP}/database.dump" \
      || echo "!! pg_restore reported warnings (usually indexes/tables already present)."
  else
    echo "   pg_restore not found; run inside Docker instead:"
    echo "   docker compose exec -T postgres pg_restore -U whatsapp -d whatsapp ${BACKUP}/database.dump"
  fi
else
  echo "!! No database.dump found in backup; skipping database restore." >&2
fi

# --- File storage ---
if [ -f "${BACKUP}/files.tar.gz" ]; then
  echo "==> Restoring file storage..."
  mkdir -p "${DATA_DIR}"
  tar -xzf "${BACKUP}/files.tar.gz" -C .
fi

echo "==> Restore complete. Start the app and verify:"
echo "    curl -fsS http://localhost:4000/api/health"
echo "    curl -fsS http://localhost:4000/api/ready"
