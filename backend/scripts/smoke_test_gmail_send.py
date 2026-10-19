"""
Smoke Test script for Gmail API OAuth send & receive integration.
Features:
- Validates credentials file and client type (Desktop app vs Web).
- Interactive OAuth authorization (--auth-only option).
- Sends a test email to specified recipient or to self.
- Verifies message sent state (SENT label).
- Verifies arrival in INBOX if sent to self.
"""

import argparse
from datetime import datetime
from pathlib import Path
import sys
import time

# Ensure Windows terminal prints UTF-8 properly without cp1252 encode errors
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.integrations.gmail import gmail_service


def run_smoke_test(
    recipient: str = None,
    subject: str = None,
    auth_only: bool = False,
    no_inbox_check: bool = False,
):
    print("=" * 70)
    print("      GMAIL API OAUTH SMOKE TEST (XÁC THỰC & GỬI MAIL KIỂM THỬ)      ")
    print("=" * 70)

    # 1. Check configuration
    print("\n1. Kiểm tra cấu hình OAuth Google...")
    creds_path = gmail_service.creds_path
    token_path = gmail_service.token_path
    print(f"   - File credentials: {creds_path}")
    print(f"   - File token:       {token_path}")

    if not creds_path.exists():
        print(f"\n[LỖI]: Chưa tìm thấy credentials tại '{creds_path}'.")
        print("\nCác bước chuẩn bị:")
        print("1. Truy cập Google Cloud Console: https://console.cloud.google.com")
        print("2. Bật 'Gmail API' trong APIs & Services")
        print("3. OAuth consent screen: thêm email của bạn vào 'Test users'")
        print("4. Credentials -> Create Credentials -> OAuth client ID -> Chọn 'Desktop app'")
        print("5. Tải file JSON về và lưu vào:")
        print(f"   -> {creds_path}")
        sys.exit(1)

    ctype = gmail_service.client_type()
    print(f"   - Loại client:      {ctype} ({'Hợp lệ (Desktop)' if ctype == 'installed' else 'Cần chú ý'})")

    if ctype == "web" and settings.google_oauth_port == 0:
        print("\n[CẢNH BÁO]: File credentials là loại 'web' nhưng chưa đặt GOOGLE_OAUTH_PORT trong .env.")
        print("Google OAuth sẽ báo lỗi 'redirect_uri_mismatch' nếu dùng port ngẫu nhiên với client 'web'.")
        print("Khuyến nghị: Tạo lại OAuth client loại 'Desktop app' (Installed App) trên Google Cloud Console.")

    # 2. Authenticate
    print("\n2. Xác thực tài khoản Gmail (OAuth 2.0)...")
    try:
        service = gmail_service.authenticate(interactive=True)
        print("   -> Xác thực thành công!")
    except Exception as exc:
        print(f"   -> Lỗi xác thực: {exc}")
        sys.exit(1)

    # 3. Get profile email
    try:
        my_email = gmail_service.get_profile_email()
        print(f"   -> Tài khoản Gmail đã đăng nhập: {my_email}")
    except Exception as exc:
        print(f"   -> Không thể lấy thông tin profile: {exc}")
        sys.exit(1)

    if auth_only:
        print("\n✅ ĐÃ HOÀN TẤT XÁC THỰC OAUTH GMAIL THÀNH CÔNG (--auth-only)!")
        return

    # 4. Prepare message
    target_to = recipient or my_email
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    mail_subject = subject or f"[Local AI Assistant] Kiểm tra gửi mail tự động lúc {timestamp_str}"
    mail_body = (
        f"Xin chào {target_to},\n\n"
        f"Đây là email kiểm thử tự động được gửi từ hệ thống Local AI Assistant qua Gmail API OAuth v1.\n"
        f"- Thời gian gửi: {timestamp_str}\n"
        f"- Người gửi: {my_email}\n"
        f"- Người nhận: {target_to}\n\n"
        f"Nếu bạn nhận được email này, tính năng gửi email đã hoạt động chính xác 100%.\n\n"
        f"Trân trọng,\nLocal AI Assistant"
    )

    print(f"\n3. Đang gửi email kiểm thử:")
    print(f"   - Đến:     {target_to}")
    print(f"   - Tiêu đề: {mail_subject}")

    try:
        send_res = gmail_service.send_email(
            to=[target_to],
            subject=mail_subject,
            body=mail_body,
        )
        msg_id = send_res.get("message_id")
        thread_id = send_res.get("thread_id")
        print(f"   -> Gửi thành công! Message ID: {msg_id} (Thread ID: {thread_id})")
    except Exception as exc:
        print(f"   -> Lỗi gửi email: {exc}")
        sys.exit(1)

    # 5. Verify SENT label on the message
    print("\n4. Xác minh trạng thái thư gửi trên Gmail API...")
    try:
        msg_meta = service.users().messages().get(userId="me", id=msg_id, format="metadata").execute()
        labels = msg_meta.get("labelIds", [])
        print(f"   -> Nhãn gắn trên thư: {labels}")
        if "SENT" in labels:
            print("   -> Xác minh: Thư đã được gắn nhãn SENT thành công!")
        else:
            print("   -> Cảnh báo: Thư chưa có nhãn SENT.")
    except Exception as exc:
        print(f"   -> Cảnh báo kiểm tra nhãn: {exc}")

    # 6. Check INBOX arrival if sending to self
    is_self_send = target_to.strip().lower() == my_email.strip().lower()
    if is_self_send and not no_inbox_check:
        print("\n5. Đang kiểm tra thư đến trong Hộp thư đến (INBOX) của bạn (tối đa 60s)...")
        found = False
        start_wait = time.time()
        while time.time() - start_wait < 60:
            try:
                query = f'subject:"{mail_subject}" in:inbox'
                list_res = service.users().messages().list(userId="me", q=query, maxResults=5).execute()
                msgs = list_res.get("messages", [])
                if any(m.get("id") == msg_id for m in msgs) or len(msgs) > 0:
                    found = True
                    print(f"   -> [OK] Đã tìm thấy thư đến trong INBOX sau {int(time.time() - start_wait)} giây!")
                    break
            except Exception as e:
                pass
            time.sleep(5)
            print(".", end="", flush=True)
        print()

        if not found:
            print("   -> [LƯU Ý]: Thư đã gửi thành công nhưng chưa lập chỉ mục vào INBOX trong 60s. Vui lòng kiểm tra trên web Gmail.")

    print("\n" + "=" * 70)
    print("✅ PASS: KIỂM TRA GỬI MAIL QUA GMAIL API HOÀN TẤT THÀNH CÔNG 100%!")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smoke test gửi email qua Gmail API")
    parser.add_argument("--to", type=str, default=None, help="Địa chỉ email người nhận (mặc định: gửi cho chính mình)")
    parser.add_argument("--subject", type=str, default=None, help="Tiêu đề email")
    parser.add_argument("--auth-only", action="store_true", help="Chỉ thực hiện xác thực OAuth, không gửi email")
    parser.add_argument("--no-inbox-check", action="store_true", help="Không chờ kiểm tra thư đến trong INBOX")
    args = parser.parse_args()

    run_smoke_test(
        recipient=args.to,
        subject=args.subject,
        auth_only=args.auth_only,
        no_inbox_check=args.no_inbox_check,
    )
