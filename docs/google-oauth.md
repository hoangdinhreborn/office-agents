# Đăng nhập Google từ giao diện

Trang đăng nhập chỉ dùng Google OAuth. Backend nhận mã một lần, kiểm tra state/cookie, PKCE, nonce, tài khoản và các quyền được cấp, sau đó lưu token cho Gmail và Calendar. Frontend không nhận access token hoặc refresh token.

## Cấu hình

Dùng file Google credentials đang được cấu hình qua `GOOGLE_CREDENTIALS_PATH` hoặc cơ chế credentials hiện có. Bật Gmail API và Calendar API; thêm tài khoản vào Test users nếu OAuth app còn ở chế độ Testing.

Giá trị mặc định:

```dotenv
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
GOOGLE_OAUTH_FRONTEND_URL=http://localhost:3000
```

Với client **Web application**, đăng ký đúng redirect URI trên trong Google Cloud và cập nhật JSON credentials tương ứng. Client **Desktop app** tự dùng callback gốc `http://localhost:8000/` trên cùng origin, tương thích script Python cũ; chỉ sử dụng tại máy chạy backend. Khi triển khai qua domain, dùng client Web và HTTPS; đổi cả hai URL theo địa chỉ thực tế. Không lấy callback từ Host header hoặc URL do frontend gửi.

Mở frontend → **Tiếp tục với Google** → cấp quyền Gmail/Calendar → tự quay về ứng dụng. Nếu đã có đủ token hợp lệ hoặc có thể refresh, ứng dụng dùng lại kết nối. Quyền Gmail gồm đọc/gắn nhãn và gửi; Calendar dùng quyền sự kiện như các tích hợp hiện tại. Việc đăng nhập không gửi thư hay tạo lịch.

Token được ghi bằng file tạm riêng tư rồi thay thế file tại `GOOGLE_GMAIL_TOKEN_PATH` và `GOOGLE_CALENDAR_TOKEN_PATH`; các HTTP client cũ được xóa cache để lần gọi tiếp theo dùng token mới. Hồ sơ hiển thị lưu tại `data/tokens/google_account.json`. Thư mục token đã được git ignore. Không commit credentials hoặc token.

`OWNER_EMAIL` nếu có sẽ giới hạn tài khoản được kết nối. Nút đăng xuất vẫn kết thúc phiên giao diện cục bộ; giữ token backend cho đồng bộ nền, không thu hồi quyền Google.

Phiên OAuth chờ xác nhận có hạn 10 phút và giữ trong tiến trình backend; sau khi restart hoặc đổi worker cần đăng nhập lại. Luồng hiện tại dành cho backend một tiến trình như chế độ chạy local của dự án.

## Endpoint

- `GET /api/auth/google/status`: chỉ đọc trạng thái token, không gọi API Google hay refresh.
- `GET /api/auth/google/start`: chuyển trình duyệt sang Google, đặt cookie state HttpOnly/SameSite=Lax.
- `GET /api/auth/google/callback`: kiểm tra và đổi mã của client Web; chỉ chuyển trạng thái thành công/lỗi về frontend, không chuyển token.
- `GET /?state=…&code=…`: cùng bộ xử lý callback cho client Desktop; các lượt truy cập `/` bình thường vẫn giữ dashboard cũ.

Địa chỉ `localhost`/`127.0.0.1` được thống nhất ở bước start để cookie khớp callback. Không tự retry đổi mã một lần khi kết nối lỗi; người dùng bắt đầu một phiên OAuth mới.

Tài liệu: [Google OAuth cho web server](https://developers.google.com/identity/protocols/oauth2/web-server), [OAuth cho Desktop](https://developers.google.com/identity/protocols/oauth2/native-app).
