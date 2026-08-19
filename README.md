# Bảng Báo Cáo Tuần

Web app báo cáo công việc tuần: **cột = tuần, hàng = nhân viên, công việc = thẻ**.

## Tính năng
- Bảng tuần theo thứ Hai; đầu tuần **tự động đẩy** các việc chưa hoàn thành sang tuần mới.
- Nhân viên phải **nhập kết quả** trước khi mark done → chờ Giám đốc **duyệt** hoặc **trả lại**.
- Nhân viên chọn tên (không mật khẩu) để tạo việc cho **chính mình**; Giám đốc đăng nhập để giao việc, duyệt, chuyển/xóa, quản lý nhân viên.
- Giám đốc có thể **giao 1 việc cho nhiều nhân viên**: mỗi người thấy việc trong cột của mình và ghi **nhật ký riêng** cho việc đó; **Báo cáo tuần hiển thị 1 dòng/việc** với đầy đủ người phụ trách và nội dung từng người.
- **Bắt buộc đăng nhập** để xem bảng; nhân viên thấy toàn bộ công ty nhưng dòng của mình được đưa lên đầu.
- Nhật ký tiến độ từng tuần trên mỗi thẻ.
- **Tuổi thẻ** = số tuần thẻ đã tồn tại; càng lâu màu càng đậm (xanh nhạt → đỏ đậm).
- Báo cáo thống kê **hàng tháng** (việc giao, hoàn thành, tỷ lệ, tồn đọng, tuổi TB) + biểu đồ + xuất **CSV** (mở được bằng Excel).

## Yêu cầu
- Node.js ≥ 22.5 (dùng module `node:sqlite` tích hợp, không cần build native).

## Cài đặt & chạy
```bash
npm install
npm start        # mặc định cổng 3000
```
Biến môi trường tùy chọn: `PORT`, `SESSION_SECRET`, `DB_PATH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

### Tài khoản Giám đốc (lần đầu)
- Nếu chưa có tài khoản, server tự tạo `admin` với mật khẩu lấy từ `ADMIN_PASSWORD` (hoặc sinh ngẫu nhiên và ghi vào `data/.admin_password`).
- Đăng nhập → đổi mật khẩu qua góc phải trên cùng → xóa file `data/.admin_password`.
- Tạo danh sách nhân viên ở trang **Quản lý nhân viên**.

### Triển khai trên máy chủ (Docker)
Yêu cầu máy chủ: Docker và Docker Compose v2.

```bash
cd /opt/baocaotuan
# Cấu hình lần đầu (chỉ cần khi chưa có tài khoản Giám đốc)
echo "ADMIN_PASSWORD='mat-khau-an-toan'" > .env
docker compose up -d --build
```
- Ứng dụng chạy ở cổng `3000`; dữ liệu lưu tại `data/` (mount thẳng vào container, vẫn đọc/ghi được từ host).
- Mỗi lần push lên `main`, GitHub Actions tự `git pull` rồi build lại image (`docker compose up -d --build`).
- Các biến môi trường khác (xem phần ở trên) đặt trong file `.env` nếu cần.
- Nút "Đồng bộ"/"Push lên server" chỉ hiển thị khi chạy **local** (`NODE_ENV != production` hoặc `IS_LOCAL=1`).

### Chạy Docker trên máy local (để dùng nút Đồng bộ / Push)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```
File `docker-compose.dev.yml` bật `IS_LOCAL=1` và mount `~/.ssh` vào container (cần chứa `baocaotuan_deploy` + `known_hosts` để script SSH tới server).

### Sao lưu
Dữ liệu nằm trong file `data/app.db` (được mount từ container ra host) — có thể sao lưu trong lúc server chạy bằng:
```bash
scripts/backup.sh          # lưu vào data/backups/, giữ lại 14 bản gần nhất
sqlite3 data/app.db ".backup 'backup-$(date +%F).db'"
```
hoặc chạy bên trong container:
```bash
docker compose exec -T app node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/app/data/app.db');db.exec(\"VACUUM INTO '/app/data/backup.db'\");db.close()"
```
> **Quan trọng**: `scripts/sync-from-server.sh` và `scripts/push-to-server.sh` **ghi đè `app.db`** mà không xoá — mỗi lần chạy chúng đều tự lưu 1 bản backup hằng ngày vào `data/backups/` (phía local và cả trên server) trước khi ghi đè. Đừng chạy `scripts/seed-demo.js` trên DB thật — script này **xóa toàn bộ dữ liệu** rồi chèn dữ liệu mẫu.

## Ghi chú mô hình tin cậy
Nhân viên **có tài khoản riêng** (username + mật khẩu) do **Giám đốc tạo/đặt lại** trong trang Quản lý nhân viên. **Bắt buộc đăng nhập** để xem bảng. Nhân viên thấy toàn bộ bảng của công ty nhưng dòng của bản thân được đưa lên đầu; muốn **tạo việc, ghi/sửa nhật ký, báo cáo hoàn thành** phải đăng nhập — mọi thao tác được ghi nhận theo đúng tài khoản (session) và lưu vào lịch sử thẻ để truy vết. Nhân viên chỉ tạo việc cho chính mình; Giám đốc giao việc cho bất kỳ ai. Ai cũng có thể đổi mật khẩu của mình (nút "Đổi mật khẩu" khi đã đăng nhập).
