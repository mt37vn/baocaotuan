#!/bin/bash
# Sao lưu app.db (an toàn khi app đang chạy). Chạy thủ công hoặc qua cron/launchd hằng ngày.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${BACKUP_DATA_DIR:-$ROOT/data}"
BK_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
RETENTION="${BACKUP_RETENTION:-14}"

mkdir -p "$BK_DIR"
STAMP="$(date '+%F-%H%M')"

if ! sqlite3 "$DATA_DIR/app.db" ".backup '$BK_DIR/app-$STAMP.db'"; then
  echo "LỖI: backup thất bại." >&2
  exit 1
fi

ls -1t "$BK_DIR"/app-*.db 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs rm -f 2>/dev/null || true

echo "Backup xong: $BK_DIR/app-$STAMP.db"
