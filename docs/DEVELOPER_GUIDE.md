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
    ├── USER_GUIDE.md
    ├── OAUTH_SETUP.md
    └── ORAL_DEFENSE_GUIDE.md
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

### 3.1. Gmail API v1 & Quản Lý Folder Tự Động
- Sử dụng Google OAuth 2.0 (`google-auth`, `google-api-python-client`) với token bảo mật lưu tại `data/tokens/`.
- **Chức năng**:
  - Quét email chưa đọc hoặc tất cả email theo nhãn chỉ định (vd: `INBOX`, `STARRED`).
  - Lọc người gửi theo danh sách whitelist (`allowed_senders`).
  - **Quản lý Folder & Tự động phân loại (Folder Rules Engine)**:
    - Bảng `EmailFolderRuleRecord` lưu trữ các luật lọc theo từ khóa (`keywords_json`) và vai trò/người gửi (`senders_json`, hỗ trợ wildcard như `*@student.edu.vn`).
    - Hàm `route_and_apply_folder()` phân loại email vào thư mục tương ứng và tự động tạo/gắn nhãn trên Gmail API qua `gmail_service.add_label_to_message()`.
  - **Tự động tóm tắt tệp PDF đính kèm**:
    - Khi phát hiện tệp PDF đính kèm trong email, hệ thống gọi trực tiếp `SummaryAgent.summarize_pdf(pdf_source=att.data)` để trích xuất tổng quan điều hành và các mốc hạn chót, lưu vào trường `pdf_summary` và `pdf_filename` của `EmailProcessedRecord`.
  - **Xuất Báo Cáo Tổng Hợp PDF Trong Ngày (Daily Digest PDF)**:
    - Service `DailyDigestPDFGenerator` tại `app/services/pdf_generator.py` gom nhóm email theo danh mục (Nộp bài, Học vụ, Thắc mắc, Khẩn cấp, Công việc) và xuất file PDF chuẩn A4 sang trọng có hỗ trợ font Unicode tiếng Việt (PyMuPDF).
  - **Cơ chế bóc tách độ khẩn cấp (Anchored Urgency Parsing)**:
    - Khắc phục triệt để lỗi gán nhãn sai "Khẩn cấp" bằng thuật toán Regex có neo (`(?:mức độ khẩn cấp|độ khẩn cấp)\s*[:\-–]\s*(Khẩn cấp|Cao|Trung bình|Thấp)`), loại trừ tiêu đề prompt.
  - Soạn và gửi email trực tiếp qua Gmail API (`gmail_service.send_email()`).

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


## Phần 1 — Dự án, thành viên và cấu hình (đã nối FE–BE)

Frontend hiện tại là **React + Vite**, chạy `pnpm dev` trong `frontend/`; các mô tả Next.js ở tài liệu cũ chưa phản ánh code hiện tại. `VITE_API_BASE_URL` trỏ đến FastAPI (mặc định `http://localhost:8000`). Khởi động BE bằng `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` trong `backend/`. Dùng môi trường Python đã cài `backend/requirements.txt`.

- `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/{id}`: danh sách, tạo, đổi tên/icon, cập nhật thành viên và cấu hình. Tìm/sắp xếp ở API có `q` và `sort=date_desc|date_asc|name_asc|name_desc`; UI giữ tìm/sắp xếp tiếng Việt cục bộ trên danh sách đã tải.
- `POST /api/projects/{id}/restore`: hoàn tác xóa mềm. Dự án bị ẩn cùng tài nguyên/chat, file và dữ liệu Google được giữ nguyên; nhãn Gmail vẫn được giữ chỗ để khôi phục không xung đột.
- `GET /api/projects/{id}/resources`: PDF/email thuộc dự án. Các API tài liệu, giải pháp, lịch, tasks, chat và feedback nhận **query `project_id`**. ID tài nguyên/session dự án khác trả 404. Lệnh cũ bỏ query chỉ truy cập `Dữ liệu cũ`, không lấy toàn hệ thống.
- `GET /api/emails/mailbox-labels`, `POST /api/emails/mailbox-labels {name}`: lấy/tạo nhãn Gmail thật, không trả ID giả khi Google lỗi. Một dự án gắn một nhãn; ID và tên nhãn không được dùng lại ở dự án khác. Cần OAuth Gmail để tạo/chọn nhãn từ UI.
- `GET /api/account`: hồ sơ cố định của chủ máy. Đặt `OWNER_NAME`, `OWNER_EMAIL` trong `.env` ở root nếu muốn đổi hồ sơ; email Gmail đã kết nối được ưu tiên hiển thị. Đăng xuất chỉ khóa giao diện trong tab hiện tại (`sessionStorage`), không thu hồi OAuth; theme lưu trong `localStorage`.

Thành viên được chuẩn hóa email, không trùng trong cùng dự án. Mặc định `@soviectech.vn` là `nội bộ`, còn lại `khách`, cho phép sửa tay. Đây là nhãn quan hệ nghiệp vụ, không phải quyền đăng nhập. Cấu hình riêng dự án gồm nhãn Gmail, chu kỳ đồng bộ 30–720 phút, nhắc trước 10/15/30/60 phút và `collectRlFeedback`; không còn `defaultSummaryStyle`. BE từ chối nhận feedback khi dự án tắt thu thập. Cấu hình OCR, OAuth và LLM vẫn ở BE `.env`.

Startup tự thêm schema và đưa dữ liệu BE phẳng hiện có vào dự án **Dữ liệu cũ**, không xóa DB. Đường dẫn SQLite tương đối được tính từ root repo. Nên sao lưu DB trước khi chạy bản mới. `EMAIL_POLLER_ENABLED=false` tắt poller khi kiểm thử thủ công; scheduler đồng bộ Gmail theo từng dự án thuộc phần 5, chưa nằm trong thay đổi này.

FE không nạp dự án/tài nguyên/chat mẫu khi mở ứng dụng. PDF upload được lưu theo dự án và ID file riêng, chat được lưu ở BE; chat có query `project_id` dùng hỏi đáp chỉ đọc qua provider/model đã chọn, chưa điều phối nháp mail/lịch của phần 7. Những pipeline giải pháp/gửi mail/lịch/training còn lại không được coi là đã hoàn thành bởi phần 1.

Kiểm tra: `pnpm lint`, `pnpm build` trong `frontend/`; `PYTHONPATH=backend python -m pytest backend/tests/ -q` từ root bằng Python của môi trường dự án. Conftest cô lập DB, file, token và tắt poller trước khi import app. Bộ phiên bản BE đã kiểm chứng cho thay đổi này: Python 3.12, FastAPI 0.165.0, Pydantic 2.14.4, SQLAlchemy 2.1.9, HTTPX 0.28.1, Pytest 9.2.0; không thêm dependency mới.


## Provider/model — dùng endpoint khác Ollama

Provider, danh sách model đã cấu hình, model đang chọn và fallback VRAM được lưu trong BE (bảng `llm_providers`, `llm_runtime`). API key nhập trực tiếp được mã hóa riêng theo provider trong bảng `llm_provider_secrets`, dùng cơ chế Fernet sẵn có của `SecureTokenStore`. Khởi động lại backend để tạo bảng mới; `cryptography` đã được khai báo trực tiếp trong requirements vì luồng này sử dụng nó. Việc mở app, tải/lưu cấu hình hoặc chọn model **không gọi endpoint từ xa**. Không dùng catalog model mẫu để giả báo kết nối thành công.

### Cấu hình qua giao diện

1. Mỗi provider có một cấu hình xác thực riêng: **API key riêng cho provider**, **Biến môi trường trên backend**, hoặc **Không xác thực**. Không đặt key vào `VITE_*` hay URL.
2. Trong khung chat, mở menu model → nút cài đặt → **Thêm nhà cung cấp** → **API mô hình tùy chỉnh**.
3. Điền URL cơ sở và giao thức. Chọn **API key riêng cho provider** rồi dán key trực tiếp vào ô mật khẩu; không cần sửa `.env`. Với provider đã lưu key, để trống để giữ nguyên, nhập key mới để thay thế. Chọn **Không xác thực** rồi lưu để xóa key. Key chỉ tồn tại tạm trong form và request ghi/discovery, không trả lại trong API cấu hình; response chỉ có `has_api_key`. Đóng form sẽ bỏ key chưa lưu.
   Nếu muốn giữ key trong môi trường triển khai, chọn **Biến môi trường trên backend**, đặt `PROVIDER_A_API_KEY=<key>` trong `.env` **ở root repo**, khởi động lại BE rồi nhập tên `PROVIDER_A_API_KEY` vào form. Provider khác có thể dùng biến khác. Ô tên biến chỉ nhận chữ, số và dấu `_`, không bắt đầu bằng số (tối đa 128 ký tự); không nhập key trực tiếp, dấu `$` hoặc cả dòng `NAME=value` ở chế độ này.
4. Nhập model ID đúng như provider cấp rồi **Lưu**, hoặc chủ động bấm tải danh sách để đọc model bằng key của provider đó (có thể dùng key vừa nhập trước khi lưu). Tên hiển thị có thể khác ID. Sau đó chọn model trong menu chat; lựa chọn cũng được lưu ở BE và dùng làm mặc định cho các agent xử lý tài liệu/email/lịch.

Key mã hóa dùng `TOKEN_ENCRYPTION_KEY` nếu đã cấu hình, hoặc khóa máy tại `data/tokens/.master_key` ở root repo. Giữ khóa máy cùng bản sao DB khi sao lưu/di chuyển; mất khóa cần nhập lại API key. Key mã hóa và bản rõ đều không nằm trong JSON cấu hình provider hay response. Xóa provider sẽ xóa bản ghi key theo foreign key.

| Giao thức | URL cơ sở điển hình | Đường gọi inference | Xác thực ở BE |
|---|---|---|---|
| `openai-chat` | `https://<host>/<prefix>/v1` | `/chat/completions` | `Authorization: Bearer …` nếu có biến env |
| `openai-responses` | `https://<host>/<prefix>/v1` | `/responses` | Bearer nếu có biến env |
| `anthropic-messages` | `https://<host>/v1` | `/messages` | `x-api-key`, `anthropic-version: 2023-06-01` |
| `ollama-native` | `http://<host>:11434` | `/api/chat` | Bearer nếu có biến env |

Đặt URL ở đúng API root của nhà cung cấp; BE giữ nguyên prefix proxy và không tự thêm `/v1`. Nếu nhập nguyên đường endpoint thuộc bốn giao thức, BE chuẩn hóa lại đường tương ứng. Chỉ chọn giao thức mà endpoint đó hỗ trợ. Adapter hiện nhận/trả văn bản, không stream và chưa gửi ảnh/tool call; cờ capability không biến đầu vào hiện tại thành multimodal.

Nút **Tải danh sách mô hình/Kiểm tra kết nối** là thao tác chủ động của người dùng: BE dùng `/models` hoặc `/api/tags`, không gọi sinh câu trả lời. API key vẫn ở BE. Nếu nhà cung cấp không hỗ trợ list models, lỗi được hiển thị và vẫn có thể nhập model ID thủ công; không chèn dữ liệu giả thay thế. Đọc được danh sách không chứng minh model có thể inference hay tài khoản còn hạn mức.

Context/max output để trống nếu chưa biết; nhập số hoặc K/M (`K = 1000`, `M = 1000000`). BE không suy đoán capability từ tên model. Context window được dùng cho `num_ctx` của Ollama; với API khác, giới hạn context do provider kiểm soát, BE không tự cắt ngữ cảnh. Max output ánh xạ tới tham số từng giao thức: Chat dùng `max_tokens` hoặc `max_completion_tokens` khi bật reasoning; Responses dùng `max_output_tokens`; Ollama dùng `num_predict`. Messages yêu cầu `max_tokens`, mặc định 4096 nếu chưa điền. Cờ reasoning ở cấu hình không tự bật chế độ thinking của provider; với Chat/Responses/Messages, BE bỏ temperature khi cờ này bật để tránh ép tham số không được hỗ trợ.

### Hành vi khi lỗi và fallback

BE trả lỗi có cấu trúc khi sai xác thực, sai model/path, hết hạn mức, timeout hoặc phản hồi không đúng giao thức. Không trả chuỗi lỗi như một câu trả lời AI thành công; không tự retry inference hoặc tự tìm/chuyển model Ollama khi gặp 401/403/404/429. Tin nhắn nhập được giữ nếu gọi thất bại. Model/provider thực tế và cờ fallback được lưu cùng câu trả lời chat.

Muốn dự phòng VRAM: đánh dấu đúng provider **Máy chủ cục bộ**, cấu hình thêm model nhẹ và chọn nó trong mục **Mô hình dự phòng khi thiếu VRAM**. Fallback chỉ thử một lần khi máy chủ local báo lỗi thiếu bộ nhớ, không áp dụng cho hết quota hay lỗi đăng nhập. Không tự tải model. Muốn tắt, chọn **Không tự chuyển model**. Xóa model/provider đang chọn sẽ yêu cầu chọn lại, không âm thầm chọn một model khác có thể tính phí. Rollback adapter RL vẫn chờ phần huấn luyện/phiên bản adapter thật, nút không báo thành công giả.

### Cấu hình ban đầu bằng biến môi trường (tùy chọn)

Khi BE chưa có bản ghi runtime, có thể đặt `LLM_BASE_URL`, `LLM_PROTOCOL`, `LLM_MODEL`, `LLM_API_KEY_ENV` (tên biến chứa key, không phải key). Nếu không đặt endpoint mới, BE nhập cấu hình `OLLAMA_BASE_URL`/`OLLAMA_MODEL` hiện có; đây là cấu hình đã lưu, chưa xác nhận model tồn tại. Sau khi khởi tạo, chỉnh provider qua UI; sửa các biến bootstrap không ghi đè provider đã lưu. `LLM_TIMEOUT` thay timeout chung, nếu bỏ trống giữ `OLLAMA_TIMEOUT` để tương thích cấu hình cũ.

API cấu hình: `GET /api/llm/settings`, `PUT/DELETE /api/llm/providers/{id}`, `PUT /api/llm/selection`, `PUT /api/llm/fallback`, `POST /api/llm/providers/discover`. Request lưu/discovery nhận `api_key` (tùy chọn, bỏ trống giữ key cũ) và `clear_api_key` (xóa/bỏ qua key cũ); không gửi đồng thời key mới và lệnh xóa hay tên biến môi trường. Chat nhận thêm `model_id` là ID cấu hình nội bộ của model; `model_id` trong câu trả lời là tên model thực do provider trả. API key không xuất hiện trong response, kể cả response lỗi validation.

Tham khảo giao thức: [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [Messages](https://platform.claude.com/docs/en/api/messages/create), [Ollama Chat](https://docs.ollama.com/api/chat).

**Xác minh lần thay đổi provider:** theo yêu cầu người dùng, không chạy test, typecheck/build, không khởi chạy app để thử và không gọi discovery/inference vào provider. Các kết quả 83 test của phần trước không phải kết quả kiểm chứng phần provider. Test cũ kỳ vọng lỗi Ollama được trả như nội dung đã được cập nhật sang lỗi rõ ràng, không chuyển model; test này cũng chưa chạy.
