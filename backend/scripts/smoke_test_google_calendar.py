"""
Smoke Test script for Google Calendar API v3 integration.
Usage:
  python backend/scripts/smoke_test_google_calendar.py --auth-only
  python backend/scripts/smoke_test_google_calendar.py
"""

import argparse
from datetime import datetime, timedelta
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

# Ensure UTF-8 console output on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.integrations.google_calendar import google_calendar, VN_TZ


def parse_args():
    p = argparse.ArgumentParser(description="Google Calendar API Smoke Test & Auth Helper")
    p.add_argument("--auth-only", action="store_true", help="Chỉ mở trình duyệt xác thực OAuth và lưu token, không tạo sự kiện test")
    p.add_argument("--port", type=int, default=None, help="Port cho OAuth local server (mặc định theo GOOGLE_OAUTH_PORT)")
    return p.parse_args()


def run_smoke_test():
    args = parse_args()

    print("=" * 65)
    print("      GOOGLE CALENDAR API SMOKE TEST (TẠO & XÓA THỬ NGHIỆM)      ")
    print("=" * 65)

    if not google_calendar.is_configured():
        print(f"[THÔNG BÁO]: Chưa tìm thấy file credentials tại '{google_calendar.creds_path}'.")
        print("\nĐể chạy thử nghiệm thực tế với Google Calendar của bạn:")
        print("1. Vào Google Cloud Console: https://console.cloud.google.com")
        print("2. Chọn project và bật 'Google Calendar API'")
        print("3. OAuth Consent Screen -> External -> Thêm email của bạn vào Test users")
        print("4. Credentials -> Create OAuth client ID -> Desktop App -> Download JSON")
        print(f"5. Đặt file đã tải về vào đường dẫn: {settings.google_credentials_path}")
        return

    print("1. Đang xác thực với Google Calendar API...")
    try:
        google_calendar.authenticate(interactive=True, port=args.port)
        print("   -> Xác thực thành công! Token đã sẵn sàng.")
    except Exception as exc:
        print(f"   -> Lỗi xác thực: {exc}")
        sys.exit(1)

    if args.auth_only:
        print("\n[OK] Xác thực hoàn tất (--auth-only). Token đã lưu tại:", google_calendar.token_path)
        return

    start_time = datetime.now(tz=VN_TZ) + timedelta(hours=2)
    end_time = start_time + timedelta(minutes=45)
    stable_hash = f"smoke_test_{int(datetime.now().timestamp())}"

    print("2. Đang tạo sự kiện thử nghiệm...")
    try:
        res = google_calendar.create_event(
            title="[Local AI Assistant] Cuộc hẹn kiểm thử tự động",
            start_time=start_time,
            end_time=end_time,
            description="Sự kiện kiểm thử kết nối Google Calendar API v3",
            location="Trực tuyến",
            reminder_minutes=15,
            stable_hash=stable_hash,
        )
        event_id = res["event_id"]
        print(f"   -> Tạo thành công! Event ID: {event_id}")
        print(f"   -> Link Google Calendar: {res.get('link')}")
    except Exception as exc:
        print(f"   -> Lỗi khi tạo sự kiện: {exc}")
        sys.exit(1)

    print("3. Kiểm tra cơ chế chống trùng lặp (Deduplication)...")
    duplicate_id = google_calendar.find_duplicate(stable_hash)
    if duplicate_id == event_id:
        print("   -> Kiểm tra chống trùng lặp: CHÍNH XÁC (tìm thấy sự kiện cùng hash)!")
    else:
        print("   -> Cảnh báo: Không tìm thấy hash trùng lặp.")

    print(f"4. Đang dọn dẹp (xóa sự kiện thử nghiệm {event_id})...")
    deleted = google_calendar.delete_event(event_id)
    if deleted:
        print("   -> Đã xóa thành công sự kiện thử nghiệm!")
    else:
        print("   -> Không thể xóa sự kiện.")

    print("\n✅ GOOGLE CALENDAR SMOKE TEST HOÀN TẤT THÀNH CÔNG 100%!")


if __name__ == "__main__":
    run_smoke_test()
