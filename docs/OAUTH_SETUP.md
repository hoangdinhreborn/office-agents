# Hướng Dẫn Thiết Lập OAuth 2.0: Google Calendar & Gmail API

Tài liệu này hướng dẫn chi tiết từng bước thiết lập quyền truy cập đám mây (Cloud Integration) cho **Google Calendar** và **Gmail API v1** trên hệ thống **Local AI Assistant**.

---

## 0. Làm Rõ Về Chi Phí & Thẻ Tín Dụng (Billing & Free Tier)

| Dịch vụ | Yêu cầu thẻ tín dụng? | Chi phí sử dụng | Lưu ý quan trọng |
| :--- | :--- | :--- | :--- |
| **Google Cloud (Calendar & Gmail)** | ❌ **Không** | **100% Miễn phí** | Miễn phí cho ứng dụng Desktop ở chế độ Thử nghiệm (Testing mode) với tài khoản cá nhân. Không yêu cầu liên kết thẻ tín dụng. |

Hệ thống hoạt động theo cơ chế **Outbound Polling (Quét chủ động từ trong ra ngoài)**: Không cần mở port, không cần cài đặt ngrok hay webhook công khai.

---

## 1. Thiết Lập Google Cloud (Google Calendar API & Gmail API)

### Bước 1: Tạo Dự Án Trên Google Cloud Console
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/) và đăng nhập bằng tài khoản Google.
2. Nhấn vào menu chọn dự án ở góc trên bên trái -> Chọn **New Project** (Dự án mới).
3. Đặt tên dự án: `Local-AI-Assistant` -> Nhấn **Create**.

### Bước 2: Bật Các API Cần Thiết
1. Vào menu **APIs & Services** -> **Enabled APIs & services** -> Nhấn **+ ENABLE APIS AND SERVICES**.
2. Tìm kiếm và bấm **Enable** cho 2 API:
   - **Google Calendar API**
   - **Gmail API**

### Bước 3: Cấu Hình Màn Hình Đồng Ý OAuth (OAuth Consent Screen)
1. Ở thanh menu bên trái, chọn **OAuth consent screen**.
2. Chọn **External** (Người dùng bên ngoài) -> Nhấn **Create**.
3. Điền thông tin cơ bản:
   - App name: `Local AI Assistant`
   - User support email: Email của bạn.
   - Developer contact email: Email của bạn.
4. Nhấn **Save and Continue** qua các bước Scopes.
5. Tại mục **Test users** (Người dùng thử nghiệm):
   - Nhấn **+ ADD USERS**.
   - Nhập chính địa chỉ email Google mà bạn muốn trợ lý AI truy cập lịch và thư.
   - Nhấn **Save and Continue** -> **Back to Dashboard**.

### Bước 4: Tạo Khóa OAuth Client ID (Desktop Application)
1. Chọn **Credentials** ở thanh menu bên trái.
2. Nhấn **+ CREATE CREDENTIALS** -> Chọn **OAuth client ID**.
3. Application type: Chọn **Desktop app**.
4. Name: `Local AI Desktop Client`.
5. Nhấn **Create**.
6. Một cửa sổ hiện ra -> Nhấn nút **DOWNLOAD JSON**.
7. Đổi tên file đã tải thành:
   `google_credentials.json`
8. Di chuyển file vào thư mục của dự án:
   `data/tokens/google_credentials.json`

### Bước 5: Xác Thực Lần Đầu & Kiểm Tra Gửi/Nhận Mail
Chạy script kiểm tra để hoàn tất đăng nhập qua trình duyệt (cấp quyền `gmail.readonly` và `gmail.send`):
```powershell
# 1. Chỉ đăng nhập OAuth (mở trình duyệt cấp quyền, lưu token):
python backend/scripts/smoke_test_gmail_send.py --auth-only

# 2. Hoặc chạy kiểm tra gửi mail thực tế (gửi đến chính hộp thư của bạn và xác minh trong INBOX):
python backend/scripts/smoke_test_gmail_send.py

# 3. Gửi đến địa chỉ chỉ định:
python backend/scripts/smoke_test_gmail_send.py --to nguoinhan@example.com --subject "[Test] Thử nghiệm gửi mail"
```
Trình duyệt sẽ tự động mở lên -> Đăng nhập tài khoản Google của bạn -> Nhấn "Tiếp tục" (Advanced -> Go to Local AI Assistant) -> Đồng ý cấp quyền đọc và gửi email.
Token sẽ tự động được lưu và mã hóa an toàn trong `data/tokens/google_gmail_token.json`.

> **Lưu ý quan trọng về loại OAuth Client**:
> - Bắt buộc chọn loại **Desktop app** khi tạo Client ID trên Google Cloud Console để cho phép đăng nhập tự động trên máy tính cục bộ qua port ngẫu nhiên.
> - Nếu sử dụng loại **Web application**, Google yêu cầu redirect URI cố định. Bạn cần thêm redirect URI `http://localhost:8765/` trên Console và cấu hình `GOOGLE_OAUTH_PORT=8765` trong `.env`.
> - Ở chế độ Google Testing Mode, Refresh Token có thể hết hạn sau 7 ngày. Khi hết hạn, chỉ cần chạy lại lệnh `--auth-only`.

---

## 2. Bảo Mật Dữ Liệu & Mã Hóa Token Cục Bộ

Để ngăn chặn việc lộ thông tin `access_token` và `refresh_token` dưới dạng văn bản thô (plaintext), hệ thống tích hợp module bảo mật **`SecureTokenStore`**:

1. **Mã hóa đối xứng Fernet (AES-128-CBC + HMAC-SHA256)**:
   Mọi token khi lưu vào đĩa cứng đều được mã hóa bằng thuật toán Fernet.
2. **Khóa Master Key cục bộ**:
   - Nếu bạn cung cấp `TOKEN_ENCRYPTION_KEY` trong file `.env`, hệ thống sẽ sử dụng khóa này kết hợp muối bảo mật (salt) và KDF.
   - Nếu không, hệ thống tự động sinh khóa master key ngẫu nhiên tại `data/tokens/.master_key` với quyền truy cập chỉ dành riêng cho tài khoản máy hiện tại.
3. **Quy tắc Git Ignore**:
   Thư mục `data/tokens/` và file `.master_key` đã được cấu hình trong `.gitignore`, đảm bảo không bao giờ bị commit nhầm lên kho mã nguồn công khai.

---

## 3. Các Lệnh Kiểm Thử Tự Động Toàn Diện

```powershell
# 1. Kiểm tra gửi & xác thực Gmail API (OAuth v1)
python backend/scripts/smoke_test_gmail_send.py --auth-only   # Xác thực lần đầu
python backend/scripts/smoke_test_gmail_send.py               # Gửi mail thực tế & kiểm tra INBOX

# 2. Kiểm tra Google Calendar API
python backend/scripts/smoke_test_google_calendar.py

# 3. Kiểm tra Outbound Email Poller (Gmail, EML, PDF)
python backend/scripts/smoke_test_email.py

# 4. Chạy toàn bộ bộ kiểm thử tự động
$env:PYTHONPATH="backend"
pytest backend/tests/ -v
```
