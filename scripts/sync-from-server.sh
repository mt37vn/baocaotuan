#!/bin/bash
# Đồng bộ dữ liệu (data/) từ server về máy local.
# Chạy thủ công:  scripts/sync-from-server.sh
# Chạy tự động:  launchd (com.baocaotuan.sync.plist, mặc định mỗi 15 phút)
set -euo pipefail

SSH_KEY="${SYNC_SSH_KEY:-$HOME/.ssh/baocaotuan_deploy}"
SSH_HOST="${SYNC_SSH_HOST:-root@103.232.121.14}"
REMOTE_DATA="${SYNC_REMOTE_DATA:-/opt/baocaotuan/data}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DATA="${SYNC_LOCAL_DATA:-$ROOT/data}"
LOG_FILE="${SYNC_LOG:-$ROOT/logs/sync.log}"

mkdir -p "$LOCAL_DATA" "$ROOT/logs"

LOCK="$ROOT/logs/sync.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

log() { echo "$(date '+%F %T') $*" >> "$LOG_FILE"; }

log "Bắt đầu đồng bộ..."
TMP_BAK="baocaotuan-sync-$$"
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$SSH_KEY" "$SSH_HOST" \
  "mkdir -p /tmp/$TMP_BAK && sqlite3 '$REMOTE_DATA/app.db' \".backup '/tmp/$TMP_BAK/app.db'\""; then
  log "LỖI: không snapshot được app.db trên server."
  exit 1
fi

rsync -az -e "ssh -i $SSH_KEY" "$SSH_HOST:/tmp/$TMP_BAK/app.db" "$LOCAL_DATA/app.db" || { log "LỖI: tải app.db thất bại."; ssh -i "$SSH_KEY" "$SSH_HOST" "rm -rf /tmp/$TMP_BAK"; exit 1; }
rsync -az -e "ssh -i $SSH_KEY" "$SSH_HOST:$REMOTE_DATA/.session_secret" "$LOCAL_DATA/" || true
rsync -az -e "ssh -i $SSH_KEY" "$SSH_HOST:$REMOTE_DATA/.admin_password" "$LOCAL_DATA/" || true
ssh -i "$SSH_KEY" "$SSH_HOST" "rm -rf /tmp/$TMP_BAK"

log "Đồng bộ xong: app.db = $(stat -f '%z' "$LOCAL_DATA/app.db") bytes."
