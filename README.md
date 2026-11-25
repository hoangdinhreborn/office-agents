# deskhive-harness

Trợ lý dự án cho email, PDF, đề xuất giải pháp và lịch làm việc. Frontend dùng React/Vite; backend FastAPI dùng SQLite và hỗ trợ nhiều nhà cung cấp AI.

## Chạy bằng Docker

Cần Docker Engine kèm Compose v2, hoặc Docker Desktop đang chạy. Thực hiện tại thư mục gốc repository; không cần cài Python, Node hay pnpm trên máy.

1. Nếu chưa có `.env`, sao chép từ `.env.example`:

   ```sh
   cp .env.example .env
   ```

2. Tạo thư mục `data/tokens`, đặt Google OAuth credentials tại `data/tokens/google_credentials.json`. Bật Gmail API và Google Calendar API; nếu ứng dụng Google đang ở chế độ Testing, thêm tài khoản của các thành viên vào Test users. Với client **Web application**, đăng ký callback `http://localhost:8000/api/auth/google/callback` và tải lại JSON credentials. Xem [hướng dẫn OAuth](docs/google-oauth.md).

3. Nếu dùng endpoint AI khác Ollama, có thể nhập provider, API key và model trong ứng dụng sau khi đăng nhập. Hoặc điền `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROTOCOL`, `LLM_API_KEY_ENV` và biến chứa key tương ứng trong `.env` trước lần chạy đầu. Ví dụ `LLM_API_KEY_ENV=CUSTOM_LLM_API_KEY`; giá trị key đặt riêng ở `CUSTOM_LLM_API_KEY`.

4. Khởi động:

   ```sh
   docker compose up --build -d
   ```

Mở **[http://localhost:3000](http://localhost:3000)** và đăng nhập Google. Backend/API docs ở [http://localhost:8000/docs](http://localhost:8000/docs). Dùng `localhost` nhất quán để cookie OAuth khớp callback.

Compose chỉ chạy **frontend và backend**. SQLite, PDF, báo cáo, cấu hình provider và token được lưu trong `./data`; dừng container không xóa dữ liệu. Postgres và Qdrant chưa được code sử dụng nên không cần khởi động.

Mỗi thành viên chạy một bản trên máy mình và đăng nhập tài khoản riêng. Chỉ chia sẻ source; không chép `.env`, token hoặc thư mục dữ liệu cá nhân cho nhau. Cổng 3000 và 8000 cần còn trống. Nếu dùng Ollama, Ollama chạy trên máy host và cần nhận kết nối từ container qua `host.docker.internal:11434` (trên Linux, cấu hình `OLLAMA_HOST=0.0.0.0:11434` cho dịch vụ Ollama). Compose không tải model; dùng provider cloud thì không cần chạy Ollama. Endpoint AI chạy trên host cũng dùng `host.docker.internal` thay cho `localhost` khi nhập URL provider.

Xem log hoặc dừng ứng dụng:

```sh
docker compose logs -f backend
docker compose down
```

Sau khi đổi biến môi trường, chạy lại `docker compose up -d`. Sau khi sửa code hoặc `VITE_API_BASE_URL`, chạy `docker compose up --build -d`. Cấu hình provider đã lưu trong DB được giữ lại; các biến `LLM_*` chỉ khởi tạo provider cho DB mới.

## Chạy trực tiếp để phát triển

Backend:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend (Node 24 và pnpm 12.15.0):

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Trên Windows PowerShell, kích hoạt Python bằng `.venv\Scripts\Activate.ps1`. Khi chạy trực tiếp, Ollama mặc định ở `http://localhost:11434`.

## Tài liệu

- [Đăng nhập Google](docs/google-oauth.md)
- [Hướng dẫn sử dụng](docs/USER_GUIDE.md)
- [Hướng dẫn phát triển](docs/DEVELOPER_GUIDE.md)
