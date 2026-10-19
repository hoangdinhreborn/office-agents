# Local Multi-Agent AI Assistant Framework

Framework AI đa tác vụ chạy hoàn toàn tại Local (On-Premise / Desktop), sử dụng **duy nhất 01 mô hình LLM học tăng cường (DeepSeek-R1 qua Ollama)** điều phối các Agent chuyên trách:
- 📄 **Document Summary Agent**: Tóm tắt tài liệu chuẩn hóa PDF (PyMuPDF).
- 💡 **Solution Proposal Agent**: Phân tích nguyên nhân gốc rễ (Root Cause) & đề xuất ma trận giải pháp 3 cấp độ.
- 📧 **Gmail Email Agent**: Đọc và gửi email qua Gmail API v1; quét email từ nhãn cụ thể và lọc theo danh sách địa chỉ người gửi.
- 📅 **Calendar Agent**: Trích xuất lịch trình từ email, PDF hoặc prompt; tạo sự kiện vào Google Calendar / file .ics chuẩn RFC-5545 kèm chuông nhắc trước quy định.
- 🧠 **Reinforcement Learning Pipeline**: Huấn luyện tăng cường thêm dữ liệu với thuật toán DPO / GRPO (TRL / Unsloth).
- 🖥️ **Modern Next.js Frontend Dashboard**: Ứng dụng Next.js 14 App Router hoàn chỉnh với Shadcn UI, Lucide Icons, Zod & React Hook Form tại cổng `http://localhost:3000/`.

---

## 🚀 Khởi Chạy Nhanh (Quick Start)

### 1. Khởi động Ollama (Gemma 4 / DeepSeek-R1)
```bash
ollama run gemma4:31b-cloud
# hoặc deepseek-r1:8b
```

### 2. Cài đặt thư viện Python & Khởi chạy Backend (Port 8000)
```bash
# Khởi chạy server FastAPI
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Cài đặt & Khởi chạy Frontend Next.js (Port 3000)
```bash
cd frontend
pnpm install
pnpm run dev
```

### 4. Truy Cập Ứng Dụng
- **Next.js Modern Dashboard**: **[http://localhost:3000/](http://localhost:3000/)**
- **FastAPI Backend & Swagger API Docs**: **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)**

---

## 📚 Tài Liệu Hướng Dẫn Chi Tiết

- 👨‍💻 **[Hướng dẫn dành cho Lập trình viên (Developer Guide)](docs/DEVELOPER_GUIDE.md)**: Kiến trúc chi tiết, cách hoạt động của từng Agent, quy trình huấn luyện học tăng cường (RL GRPO) và cách chạy automated tests.
- 👤 **[Hướng dẫn sử dụng cho Người dùng (User Guide)](docs/USER_GUIDE.md)**: Hướng dẫn chi tiết từng tính năng trên Web Dashboard, cách kết nối Gmail, Google Calendar và cấu hình nhắc hẹn.

---

## 🧪 Chạy Kiểm Thử (Automated Tests)

```bash
$env:PYTHONPATH="backend"
pytest backend/tests/ -v
```
*(11/11 tests tự động bao phủ toàn bộ các module và endpoints)*.
