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

TMP_LOCAL="$(mktemp -d)"
trap 'rm -rf "$TMP_LOCAL"; rmdir "$LOCK" 2>/dev/null || true' EXIT

if ! rsync -az -e "ssh -i $SSH_KEY" "$SSH_HOST:/tmp/$TMP_BAK/app.db" "$TMP_LOCAL/app.db"; then
  log "LỖI: tải app.db thất bại."
  ssh -i "$SSH_KEY" "$SSH_HOST" "rm -rf /tmp/$TMP_BAK"
  exit 1
fi

CHANGED=0
if [ ! -f "$LOCAL_DATA/app.db" ] || ! cmp -s "$TMP_LOCAL/app.db" "$LOCAL_DATA/app.db"; then
  CHANGED=1
  BK_DIR="$LOCAL_DATA/backups"
  mkdir -p "$BK_DIR"
  TODAY="$(date '+%F')"
  if [ ! -f "$BK_DIR/app-$TODAY.db" ]; then
    sqlite3 "$LOCAL_DATA/app.db" ".backup '$BK_DIR/app-$TODAY.db'" 2>/dev/null \
      || cp "$LOCAL_DATA/app.db" "$BK_DIR/app-$TODAY.db"
    log "Đã lưu backup: $BK_DIR/app-$TODAY.db"
  fi
  rsync -a "$TMP_LOCAL/app.db" "$LOCAL_DATA/app.db"
  log "Đã cập nhật app.db từ server."
else
  log "Dữ liệu không đổi, bỏ qua cập nhật."
fi

rsync -az -e "ssh -i $SSH_KEY" "$SSH_HOST:$REMOTE_DATA/.session_secret" "$LOCAL_DATA/" || true
rsync -az -e "ssh -i $SSH_KEY" "$SSH_HOST:$REMOTE_DATA/.admin_password" "$LOCAL_DATA/" || true
ssh -i "$SSH_KEY" "$SSH_HOST" "rm -rf /tmp/$TMP_BAK"

# Nếu dữ liệu thay đổi và app local đang chạy (pm2), restart để đọc file app.db mới
if [ "$CHANGED" = "1" ] && command -v pm2 >/dev/null 2>&1; then
  PM_IDS="$(ROOT_DIR="$ROOT" pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const a=JSON.parse(d);const m=a.filter(x=>x.pm2_env&&x.pm2_env.pm_cwd===process.env.ROOT_DIR&&x.pm2_env.status==='online').map(x=>x.pm2_env.pm_id);if(m.length)console.log(m.join(' '))}catch(e){}})" 2>/dev/null || true)"
  if [ -n "$PM_IDS" ]; then
    pm2 restart $PM_IDS >/dev/null 2>&1 || true
    log "Đã restart app local ($PM_IDS) để đọc dữ liệu mới."
  fi
fi

log "Đồng bộ xong: app.db = $(wc -c < "$LOCAL_DATA/app.db" | tr -d ' ') bytes."
