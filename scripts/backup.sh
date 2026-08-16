#!/bin/bash
# backup.sh
# Nightly Postgres dump, uploaded off-server via rclone (B2).
# Add to crontab: 0 3 * * * /home/solana/quantedge/scripts/backup.sh >> /var/log/quantedge-backup-cron.log 2>&1
#
# Degrades gracefully if the 'b2' rclone remote isn't configured yet: still
# takes and retains a local dump, just logs a clear warning instead of
# failing the whole run - a local-only dump is still better than the
# previous state (nothing at all).

set -uo pipefail

BACKUP_DIR="/home/solana/backups"
RETENTION_DAYS=14
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
DUMP_FILE="$BACKUP_DIR/quantedge-${TIMESTAMP}.sql.gz"
RCLONE_REMOTE="b2:${B2_BUCKET_NAME:-anchorledger-backups}"
ENV_FILE="/home/solana/quantedge/.env"

mkdir -p "$BACKUP_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1"; }

log "Starting backup..."

POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)

if [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ]; then
  log "ERROR: could not read Postgres credentials from $ENV_FILE - aborting"
  exit 1
fi

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" quantedge_postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DUMP_FILE"

if [ ! -s "$DUMP_FILE" ]; then
  log "ERROR: dump file is empty - not uploading, not rotating, leaving it for inspection"
  exit 1
fi
log "Dump created: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

if ! rclone listremotes 2>/dev/null | grep -q "^b2:"; then
  log "WARNING: no 'b2' rclone remote configured yet - dump saved locally only, NOT copied off-server. Run 'rclone config' to add B2 credentials."
else
  if rclone copy "$DUMP_FILE" "$RCLONE_REMOTE" --quiet; then
    log "Uploaded to $RCLONE_REMOTE"
  else
    log "ERROR: rclone upload to $RCLONE_REMOTE failed - dump still retained locally"
  fi
fi

# Local retention only - off-server (B2) retention should be set as a
# lifecycle rule on the bucket itself once it exists, not duplicated here.
find "$BACKUP_DIR" -name "quantedge-*.sql.gz" -mtime +$RETENTION_DAYS -delete

log "Backup complete."
