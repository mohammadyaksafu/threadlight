#!/usr/bin/env bash
# Nightly backup: Postgres dump + MinIO mirror into the `backups` bucket, then off-site with rclone if
# RCLONE_REMOTE is set. Keeps 14 days. Cron: 30 2 * * * /opt/threadlight/deploy/backup.sh
# Restore test: ./backup.sh --restore-test   (restores the latest dump into a scratch database and counts rows)
set -euo pipefail
cd "$(dirname "$0")"
DC="docker compose -f docker-compose.yml --env-file .env"
STAMP=$(date +%Y%m%d-%H%M)
DIR=/var/backups/threadlight
mkdir -p "$DIR"
if [ "${1:-}" = "--restore-test" ]; then
  LATEST=$(ls -1t "$DIR"/pg-*.dump | head -1)
  $DC exec -T postgres sh -c 'dropdb -U postgres --if-exists restore_test && createdb -U postgres restore_test'
  $DC exec -T postgres pg_restore -U postgres -d restore_test --no-owner < "$LATEST"
  $DC exec -T postgres psql -U postgres -d restore_test -Atc "select 'documents', count(*) from documents union all select 'audit_log', count(*) from audit_log"
  $DC exec -T postgres dropdb -U postgres restore_test
  echo "restore test OK from $LATEST"
  exit 0
fi
$DC exec -T postgres pg_dump -U postgres -Fc threadlight > "$DIR/pg-$STAMP.dump"
$DC run --rm --entrypoint sh minio-init -c "mc alias set local http://minio:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD >/dev/null && mc mirror --overwrite local/threadlight local/backups/files-latest"
if [ -n "${RCLONE_REMOTE:-}" ]; then rclone copy "$DIR" "$RCLONE_REMOTE/threadlight" --max-age 48h; fi
find "$DIR" -name 'pg-*.dump' -mtime +14 -delete
echo "backup $STAMP done"
