# HƯỚNG DẪN SỬ DỤNG CHO NGƯỜI DÙNG (USER GUIDE)

**Local Multi-Agent AI Assistant** là giải pháp trợ lý công việc thông minh hoạt động 100% tại máy tính nội bộ (Local / On-Premise), bảo mật tuyệt đối dữ liệu doanh nghiệp và không phụ thuộc vào internet.

---

## 1. Yêu Cầu Hệ Thống & Cài Đặt Ban Đầu

### 1.1. Yêu cầu hệ thống
- **Hệ điều hành**: Windows 10/11, macOS, hoặc Linux.
- **Phần cứng**:
  - Tối thiểu 16GB RAM.
  - Card đồ họa GPU (NVIDIA RTX 3060 trở lên với 6GB+ VRAM) hoặc chạy CPU thông thường.
- **Phần mềm phụ trợ**:
  - [Ollama](https://ollama.com/) (để chạy mô hình AI Local).
  - Python 3.10 trở lên.
  - Tài khoản Google (kết nối Gmail API & Google Calendar qua OAuth 2.0).

### 1.2. Khởi động mô hình AI Local (Ollama)
Mở cửa sổ dòng lệnh (Terminal hoặc PowerShell) và tải mô hình học tăng cường DeepSeek-R1:
```bash
ollama run deepseek-r1:8b
```
*(Nếu máy có cấu hình nhẹ hơn có thể dùng `ollama run deepseek-r1:1.5b`; nếu máy có GPU mạnh hơn có thể dùng `ollama run deepseek-r1:14b`)*.

### 1.3. Khởi chạy Ứng dụng Trợ lý AI
1. Mở PowerShell tại thư mục dự án `local-ai-assistant`:
   ```bash
   $env:PYTHONPATH="backend"
   .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
2. Mở trình duyệt web và truy cập vào địa chỉ:
   👉 **http://127.0.0.1:8000/** hoặc **http://127.0.0.1:8000/app**

---

## 2. Hướng Dẫn Chi Tiết Các Tính Năng Trên Giao Diện Web

Giao diện Web Dashboard gồm thanh trạng thái và 5 tab chức năng chính:

```
[ Điều phối AI (Chat) ] [ Tóm tắt PDF ] [ Đọc & Gửi Email Gmail ] [ Đề xuất Giải pháp ] [ Lịch & Nhắc hẹn ]
```

---

### Tab 1: 💬 Điều phối AI (Chat & Compound Flows)
Đây là cổng tương tác thông minh nhất của hệ thống:
- **Tự động nhận diện ý định**: Bạn chỉ cần gõ yêu cầu bằng ngôn ngữ tự nhiên tiếng Việt, Trợ lý sẽ tự động phân loại và kích hoạt các Agent phù hợp.
- **Đính kèm tài liệu PDF**: Bấm nút **"Đính kèm PDF"** bên cạnh ô nhập chat để gửi file kèm câu hỏi (ví dụ: *"Tóm tắt các điều khoản phạt trong hợp đồng này và lên lịch họp nghiệm thu"*).
- **Minh bạch quá trình suy luận**: Bấm vào thanh **"Suy luận DeepSeek-R1 (`<think>`)"** để xem trực tiếp các bước phân tích logic từng bước của mô hình AI.

**Ví dụ câu lệnh mẫu:**
> *"Đọc email từ sếp trong thư mục Inbox, nếu có sự cố hãy đề xuất phương án xử lý và tạo lịch họp khẩn vào 15h30 chiều nay, nhắc trước 30 phút."*

---

### Tab 2: 📄 Tóm Tắt Tài Liệu Chuẩn PDF
Dành riêng cho các văn bản hành chính, báo cáo tài chính, hợp đồng kinh tế và tài liệu kỹ thuật dài.
1. Kéo thả file PDF vào ô tải file (hoặc nhấp chuột để chọn file `.pdf`).
2. Bấm nút **"Bắt đầu Tóm tắt"**.
3. Hệ thống sẽ phân tích bằng `PyMuPDF` và hiển thị kết quả chuẩn cấu trúc 4 phần:
   - **📌 Tổng quan điều hành (Executive Summary)**: Nắm bắt cốt lõi tài liệu trong 2-3 câu.
   - **🔑 Các luận điểm chính (Key Insights)**: Danh sách các điểm trọng tâm.
   - **🎯 Quyết định & Cam kết**: Nghĩa vụ và quyền lợi của các bên.
   - **⏰ Mốc thời gian & Hạn chót**: Danh sách ngày giờ deadline kèm nút bấm **"Đưa vào Calendar"** để tạo lịch ngay lập tức.
 
---
 
### Tab 3: 📧 Đọc & Gửi Email Gmail
Hệ thống cho phép quét nhãn Gmail, gửi email và chỉ lọc email từ danh sách người gửi chỉ định:
1. **Nhãn Gmail (Label)**: Chọn hoặc nhập tên nhãn muốn quét (ví dụ: `INBOX`, `STARRED`, `IMPORTANT`).
2. **Người gửi cho phép (Whitelist)**: Nhập danh sách địa chỉ email cần đọc, phân cách bằng dấu phẩy (ví dụ: `boss@company.com, client@partner.com`). Email từ những người khác sẽ tự động bị bỏ qua để tránh rác thông tin.
3. Bấm **"Quét Email" / "Phân Tích AI"**:
   - Hệ thống hiển thị huy hiệu mức độ khẩn cấp (*Khẩn cấp*, *Cao*, *Trung bình*).
   - Nếu email chứa sự cố: Có nút **"Đề xuất Giải pháp sự cố này"** (chuyển thẳng sang Solution Agent).
   - Nếu email có lời mời họp/thời hạn: Có nút **"Đưa vào Calendar"** (tự động tạo lịch).
4. **Soạn & Gửi Email**: Hỗ trợ gửi email trực tiếp qua Gmail API v1 với xác thực an toàn OAuth 2.0.

---

### Tab 4: 💡 Đề Xuất Giải Pháp (Reasoning CoT)
Khi gặp một sự cố kỹ thuật hoặc bài toán vận hành phức tạp:
1. Nhập mô tả vấn đề vào ô **"Mô tả vấn đề / Sự cố"** (ví dụ: *"Hệ thống máy chủ thanh toán bị timeout vào giờ cao điểm, 35% giao dịch chờ xử lý"*).
2. Nhập bối cảnh hoặc ràng buộc ngân sách/công nghệ nếu có.
3. Bấm **"Đề Xuất Giải Pháp"**.
4. AI DeepSeek-R1 sẽ suy luận và trả về:
   - **🔍 Phân tích nguyên nhân gốc rễ (Root Cause - 5 Whys)**.
   - **⚡ Cấp 1 - Ngắn hạn (Workaround)**: Biện pháp xử lý ngay trong 24h-48h.
   - **🔧 Cấp 2 - Trung hạn (Systemic Fix)**: Khắc phục triệt để trong 1-4 tuần.
   - **🛡️ Cấp 3 - Dài hạn (Prevention)**: Chiến lược phòng ngừa tái diễn.
   - **⚠️ Đánh giá tính khả thi & rủi ro**.

---

### Tab 5: 📅 Quản Lý Lịch Làm Việc & Nhắc Hẹn
Đảm bảo bạn không bao giờ bỏ lỡ các cuộc họp hoặc hạn chót:
1. **Lên lịch tự do bằng ngôn ngữ tự nhiên**:
   Nhập vào ô lệnh câu nói tự nhiên, ví dụ:
   > *"Họp bàn giao tiến độ dự án với khách hàng lúc 9h30 sáng thứ 5 tuần tới tại phòng họp A, nhắc trước 30 phút"*
2. Bấm **"Tạo Lịch & Nhắc Hẹn"**.
3. **Cơ chế nhắc hẹn trước quy định (Advance Reminders)**:
   - AI tự động tính toán thời gian bắt đầu, kết thúc và số phút nhắc hẹn (`15 phút`, `30 phút`, `60 phút`, hoặc `1 ngày` tùy theo yêu cầu).
   - **Google Calendar Cloud Sync**: Sự kiện tự động đồng bộ trực tiếp lên tài khoản **Google Calendar** của bạn nếu đã kích hoạt OAuth 2.0.
   - **Tải file chuẩn `.ICS`**: Bạn có thể bấm nút **".ICS"** trên bảng danh sách để tải file sự kiện chuẩn quốc tế RFC-5545. Nhấp đúp vào file tải về để mở và thêm vào bất kỳ ứng dụng lịch nào (Google Calendar, Apple Calendar, v.v.).

---

## 3. Các Tùy Chỉnh Cấu Hình Nhanh (`.env`)

Bạn có thể chỉnh sửa file `.env` tại thư mục gốc để cấu hình hệ thống phù hợp với nhu cầu:
- `OLLAMA_MODEL`: Đổi tên mô hình (mặc định: `deepseek-r1:8b`).
- `CALENDAR_PROVIDER`: `google` (Google Calendar API) hoặc `local` (chỉ tạo file .ics).
- `GMAIL_LABEL`: Nhãn Gmail mặc định cần đọc (mặc định: `INBOX`).
- `ALLOWED_SENDERS`: Danh sách email người gửi cho phép mặc định (để trống = cho phép tất cả).
- `CALENDAR_DEFAULT_REMINDER_MINUTES`: Số phút nhắc trước mặc định (mặc định: `30` phút).

---

## 4. Tài Liệu Hỗ Trợ Khác

- 📖 [Hướng Dẫn Thiết Lập OAuth 2.0 (Google Calendar & Gmail API)](./OAUTH_SETUP.md)
- 🛠️ [Hướng Dẫn Kỹ Thuật Dành Cho Lập Trình Viên (Developer Guide)](./DEVELOPER_GUIDE.md)
- 🎓 [Cẩm Nang Vấn Đáp Bảo Vệ Đồ Án Với Giáo Viên Siêu Khó](./ORAL_DEFENSE_GUIDE.md)
