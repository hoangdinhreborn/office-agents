# HƯỚNG DẪN DÀNH CHO LẬP TRÌNH VIÊN (DEVELOPER GUIDE)

Chào mừng bạn đến với mã nguồn của **Local Multi-Agent AI Assistant Framework**.
Hệ thống được thiết kế theo kiến trúc module hóa cao cấp, chạy trên **duy nhất 01 mô hình LLM tại Local** hỗ trợ cơ chế **Học Tăng Cường (Reinforcement Learning - DeepSeek-R1)** và tích hợp sâu với **Gmail API v1**, **Google Calendar** và tài liệu chuẩn **PDF**.

---

## 1. Cấu Trúc Thư Mục Dự Án (Directory Structure)

```text
local-ai-assistant/
├── backend/
│   ├── app/
│   │   ├── agents/                     # Multi-Agent Core
│   │   │   ├── orchestrator.py         # Điều phối đa Agent & Compound Flows
│   │   │   ├── summary_agent.py        # Tóm tắt tài liệu PDF (Map-Reduce)
│   │   │   ├── solution_agent.py       # Đề xuất giải pháp (CoT 4 bước)
│   │   │   ├── email_agent.py          # Đọc & phân loại email (Gmail)
│   │   │   └── calendar_agent.py       # Trích xuất & lên lịch nhắc hẹn
│   │   ├── api/                        # RESTful API Endpoints (FastAPI)
│   │   │   ├── chat.py                 # Chat & Orchestrator API
│   │   │   ├── documents.py            # PDF upload & summarization API
│   │   │   ├── emails.py               # Gmail API v1 & filter API
│   │   │   ├── calendar.py             # Lịch trình & tải file .ICS
│   │   │   └── solutions.py            # Đề xuất giải pháp API
│   │   ├── database/                   # Cơ sở dữ liệu SQLite / Postgres
│   │   │   ├── database.py             # Engine & Session
│   │   │   └── models.py               # Document, Calendar, Solution ORM models
│   │   ├── integrations/               # Tích hợp dịch vụ ngoại vi
│   │   │   ├── gmail.py                # Gmail API v1 Client (fetch/send)
│   │   │   ├── google_calendar.py      # Google Calendar API Client
│   │   │   └── calendar.py             # RFC-5545 .ICS Generator (VALARM)
│   │   ├── llm/                        # Kết nối mô hình LLM Local
│   │   │   ├── ollama.py               # Ollama client, parse <think> CoT & JSON
│   │   │   └── prompts.py              # Centralized System Prompts cho từng Agent
│   │   ├── rag/                        # Xử lý văn bản & PDF
│   │   │   ├── pdf_loader.py           # PyMuPDF (fitz) parser
│   │   │   └── chunker.py              # Context-aware text chunking
│   │   ├── schemas/                    # Pydantic schemas validation
│   │   ├── static/                     # Giao diện Web Dashboard tích hợp
│   │   │   └── index.html              # HTML5 + Tailwind + JavaScript UI
│   │   ├── config.py                   # Cấu hình Pydantic BaseSettings
│   │   └── main.py                     # Entry point FastAPI Application
│   ├── tests/                          # Bộ kiểm thử tự động (Pytest)
│   │   ├── test_pdf_loader.py
│   │   ├── test_calendar_service.py
│   │   ├── test_gmail_send.py
│   │   └── test_agents_and_api.py
│   └── requirements.txt
├── training/                           # Phân hệ Huấn luyện Học tăng cường (RL)
│   ├── configs/
│   │   └── grpo_config.yaml            # Cấu hình siêu tham số GRPO & LoRA
│   ├── datasets/
│   │   ├── calendar_rl_dataset.jsonl   # Dataset mẫu bài toán Lịch trình
│   │   └── solution_rl_dataset.jsonl   # Dataset mẫu bài toán Giải pháp
│   ├── scripts/
│   │   ├── reward_functions.py         # Các hàm Reward chấm điểm chính sách
│   │   ├── train_rl_grpo.py            # Script huấn luyện GRPO (TRL / Unsloth)
│   │   └── export_to_ollama.py         # Xuất trọng số sang GGUF & tạo Modelfile
├── data/
│   ├── calendar/                       # Thư mục lưu trữ file .ics sinh ra
│   └── documents/                      # Thư mục lưu file PDF upload
└── docs/
    ├── DEVELOPER_GUIDE.md
    └── USER_GUIDE.md
```

---

## 2. Kiến Trúc Kỹ Thuật & Luồng Xử Lý (Core Architecture)

### 2.1. Bản chất mô hình 01 Local LLM duy nhất
- Thay vì chạy song song 4-5 mô hình LLM riêng lẻ gây tràn VRAM, hệ thống dùng **01 mô hình LLM suy luận học tăng cường (DeepSeek-R1-Distill-Qwen-8B)** chạy qua Ollama.
- LLM được đóng các vai trò khác nhau thông qua cơ chế **Dynamic Persona Injection** và **Multi-Step Tool Orchestration**:
  1. `SYSTEM_ORCHESTRATOR_PROMPT` -> Phân loại Intent và điều hướng luồng.
  2. `SYSTEM_SUMMARY_PROMPT` -> Đóng vai trò chuyên gia tóm tắt văn bản điều hành.
  3. `SYSTEM_SOLUTION_PROMPT` -> Đóng vai trò cố vấn phân tích Root Cause và ma trận giải pháp.
  4. `SYSTEM_EMAIL_PROMPT` -> Đóng vai trò trợ lý xử lý email chuyên nghiệp.
  5. `SYSTEM_CALENDAR_PROMPT` -> Đóng vai trò chuyên viên bóc tách ngày giờ và thời gian báo động.

### 2.2. Bóc tách suy luận DeepSeek-R1 (`<think>...</think>`)
Mô hình DeepSeek-R1 luôn sinh ra chuỗi suy luận nội tại trước khi đưa ra câu trả lời:
```text
<think>
1. Người dùng gửi email từ sếp: có sự cố thanh toán.
2. Cần phân tích nguyên nhân gốc rễ và đề xuất giải pháp.
3. Trong email có nhắc: họp khẩn 15h30 chiều nay, nhắc trước 30 phút.
4. Lên kế hoạch gọi Solution Agent và Calendar Agent.
</think>
Câu trả lời cuối cùng...
```
Hàm `parse_thinking_and_content()` trong `backend/app/llm/ollama.py` bóc tách độc lập 2 thành phần này:
- Phần suy luận `<think>` được hiển thị trên UI phục vụ Audit / Explainability.
- Phần kết quả được parse JSON hoặc định dạng Markdown chuẩn.

---

## 3. Tích Hợp Gmail API & Lịch Điện Tử

### 3.1. Gmail API v1 Integration
- Sử dụng Google OAuth 2.0 (`google-auth`, `google-api-python-client`) với token bảo mật lưu tại `data/tokens/`.
- **Chức năng**:
  - Quét email chưa đọc hoặc tất cả email theo nhãn chỉ định (vd: `INBOX`, `STARRED`).
  - Lọc người gửi theo danh sách whitelist (`allowed_senders`).
  - Soạn và gửi email trực tiếp qua Gmail API (`gmail_service.send_email()`).
  - Xử lý tệp đính kèm PDF và tự động chuyển sang phân tích tóm tắt.

### 3.2. Chuông nhắc hẹn trước (Advance Reminders)
- **Đồng bộ Google Calendar API**:
  Tự động tạo sự kiện lịch trên Google Calendar kèm thông báo nhắc hẹn trước:
  ```python
  google_calendar.create_event(
      title=event.title,
      start_time=event.start_time,
      end_time=event.end_time,
      reminder_minutes=30,
  )
  ```
- **File chuẩn iCalendar (`.ics`)**:
  Sử dụng khối `VALARM` theo chuẩn RFC-5545:
  ```text
  BEGIN:VALARM
  TRIGGER:-PT30M
  ACTION:DISPLAY
  DESCRIPTION:Nhắc hẹn: Họp bàn giao dự án
  END:VALARM
  ```

---

## 4. Huấn Luyện Học Tăng Cường Thêm Cho LLM (RL Post-Training Pipeline)

Khi doanh nghiệp có thêm dữ liệu (ví dụ: các mẫu biên bản họp nội bộ, mẫu email khách hàng đặc thù), lập trình viên có thể huấn luyện tăng cường mô hình bằng thuật toán **GRPO (Group Relative Policy Optimization)**.

### 4.1. Chuẩn bị tập dữ liệu (`training/datasets/*.jsonl`)
Mỗi dòng là một bản ghi JSON có trường `prompt` và các nhãn đánh giá tương ứng:
```json
{
  "prompt": "Thời điểm hiện tại: 2026-10-05 08:30:00. Trích xuất lịch: 'Họp xử lý sự cố lúc 14h chiều nay, nhắc trước 30 phút.'",
  "target_start_time": "2026-10-05T14:00:00",
  "target_reminder_minutes": 30
}
```

### 4.2. Xây dựng hàm Reward (`training/scripts/reward_functions.py`)
Trong GRPO, mô hình sinh ra một nhóm câu trả lời ($G$ rollouts), các hàm reward sẽ chấm điểm:
1. `format_reward_func`: Thưởng điểm khi mô hình sinh đúng khối suy luận `<think>` và khối JSON hợp lệ.
2. `calendar_accuracy_reward_func`: So khớp ngày giờ và số phút nhắc hẹn với ground-truth.
3. `solution_quality_reward_func`: Chấm điểm mức độ bao phủ 4 giai đoạn giải pháp (Nguyên nhân, Ngắn hạn, Trung hạn, Dài hạn, Kế hoạch).

### 4.3. Chạy lệnh huấn luyện
```bash
# Kiểm thử nhanh logic reward
python training/scripts/train_rl_grpo.py --test_rewards

# Chạy huấn luyện GRPO với TRL và LoRA trên GPU
python training/scripts/train_rl_grpo.py --base_model "deepseek-ai/DeepSeek-R1-Distill-Qwen-8B" --epochs 3
```

### 4.4. Đóng gói và cập nhật ngược lại Ollama
1. Chạy script tạo Modelfile:
   ```bash
   python training/scripts/export_to_ollama.py
   ```
2. Đăng ký mô hình mới vào Ollama:
   ```bash
   ollama create deepseek-r1-custom -f Modelfile
   ```
3. Cập nhật biến môi trường `OLLAMA_MODEL=deepseek-r1-custom` trong file `.env`.

---

## 5. Chạy Kiểm Thử Tự Động (Automated Testing)

Toàn bộ hệ thống có bộ test suite bao phủ tích hợp:
```bash
# Chạy toàn bộ 11 tests với pytest
$env:PYTHONPATH="backend"
.\backend\.venv\Scripts\python.exe -m pytest backend/tests/ -v
```
Kết quả kiểm thử:
- `test_health_check`: Kiểm tra API health check.
- `test_system_status`: Kiểm tra trạng thái Ollama, Gmail và Calendar provider.
- `test_reasoning_trace_parsing`: Kiểm tra tách thẻ `<think>` của DeepSeek-R1.
- `test_extract_json_from_markdown`: Kiểm tra bóc tách JSON an toàn.
- `test_calendar_service`: Kiểm tra tạo sự kiện và tạo khối `VALARM` trong file `.ics`.
- `test_calendar_providers`: Kiểm tra tích hợp Google Calendar và Local Calendar.
- `test_gmail_send`: Kiểm tra cấu hình và gửi email qua Gmail API.
- `test_email_polling`: Kiểm tra chu kỳ quét ngầm Outbound polling (Gmail / EML).
- `test_pdf_loader`: Kiểm tra đọc tài liệu PDF thực tế.
- `test_summary_solution_agents`: Kiểm tra Agent tóm tắt và Agent đề xuất giải pháp.
