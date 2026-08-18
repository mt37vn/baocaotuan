#!/bin/bash
# Đẩy dữ liệu (data/) từ máy local lên server.
# Chạy thủ công:  scripts/push-to-server.sh
# Chạy qua nút "Push lên server" trên UI (chỉ khi chạy local).
set -euo pipefail

SSH_KEY="${PUSH_SSH_KEY:-$HOME/.ssh/baocaotuan_deploy}"
SSH_HOST="${PUSH_SSH_HOST:-root@103.232.121.14}"
REMOTE_DATA="${PUSH_REMOTE_DATA:-/opt/baocaotuan/data}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DATA="${PUSH_LOCAL_DATA:-$ROOT/data}"
LOG_FILE="${PUSH_LOG:-$ROOT/logs/push.log}"

mkdir -p "$LOCAL_DATA" "$ROOT/logs"

LOCK="$ROOT/logs/push.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

log() { echo "$(date '+%F %T') $*" >> "$LOG_FILE"; }

log "Bắt đầu push..."
TMP_LOCAL="$(mktemp -d)"
TMP_REMOTE="baocaotuan-push-$$"
cleanup() {
  rm -rf "$TMP_LOCAL"
  ssh -i "$SSH_KEY" "$SSH_HOST" "rm -rf /tmp/$TMP_REMOTE" 2>/dev/null || true
}
trap 'cleanup' EXIT

if ! sqlite3 "$LOCAL_DATA/app.db" ".backup '$TMP_LOCAL/app.db'"; then
  log "LỖI: không snapshot được app.db local."
  exit 1
fi

ssh -i "$SSH_KEY" "$SSH_HOST" "mkdir -p /tmp/$TMP_REMOTE"
if ! rsync -az -e "ssh -i $SSH_KEY" "$TMP_LOCAL/app.db" "$SSH_HOST:/tmp/$TMP_REMOTE/app.db"; then
  log "LỖI: upload app.db thất bại."
  exit 1
fi
if [ -f "$LOCAL_DATA/.admin_password" ]; then
  rsync -az -e "ssh -i $SSH_KEY" "$LOCAL_DATA/.admin_password" "$SSH_HOST:/tmp/$TMP_REMOTE/admin" || true
fi

ssh -i "$SSH_KEY" "$SSH_HOST" "pm2 stop baocaotuan && \
  cp /tmp/$TMP_REMOTE/app.db '$REMOTE_DATA/app.db' && \
  cp /tmp/$TMP_REMOTE/admin '$REMOTE_DATA/.admin_password' && \
  rm -f '$REMOTE_DATA/app.db-wal' '$REMOTE_DATA/app.db-shm' && \
  pm2 restart baocaotuan"

log "Push xong: app.db = $(stat -f '%z' "$LOCAL_DATA/app.db") bytes."
