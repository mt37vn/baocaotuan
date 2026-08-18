# Bảng Báo Cáo Tuần

Web app báo cáo công việc tuần: **cột = tuần, hàng = nhân viên, công việc = thẻ**.

## Tính năng
- Bảng tuần theo thứ Hai; đầu tuần **tự động đẩy** các việc chưa hoàn thành sang tuần mới.
- Nhân viên phải **nhập kết quả** trước khi mark done → chờ Giám đốc **duyệt** hoặc **trả lại**.
- Nhân viên chọn tên (không mật khẩu) để tạo việc cho **chính mình**; Giám đốc đăng nhập để giao việc, duyệt, chuyển/xóa, quản lý nhân viên.
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

### Triển khai trên máy chủ (ví dụ pm2)
```bash
npm install --omit=dev
ADMIN_PASSWORD='mat-khau-an-toan' pm2 start server.js --name baocaotuan
pm2 save && pm2 startup
```

### Sao lưu
Dữ liệu nằm trong file `data/app.db` — chỉ cần copy file khi server tắt, hoặc dùng:
```bash
sqlite3 data/app.db ".backup 'backup-$(date +%F).db'"
```

## Ghi chú mô hình tin cậy
Nhân viên **có tài khoản riêng** (username + mật khẩu) do **Giám đốc tạo/đặt lại** trong trang Quản lý nhân viên. Bảng **xem tự do** (không cần đăng nhập), nhưng muốn **tạo việc, ghi/sửa nhật ký, báo cáo hoàn thành** thì phải đăng nhập — mọi thao tác được ghi nhận theo đúng tài khoản (session) và lưu vào lịch sử thẻ để truy vết. Nhân viên chỉ tạo việc cho chính mình; Giám đốc giao việc cho bất kỳ ai. Ai cũng có thể đổi mật khẩu của mình (nút "Đổi mật khẩu" khi đã đăng nhập).
