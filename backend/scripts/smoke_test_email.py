"""
Smoke Test script for Outbound Email Polling & Analysis.
Tests Gmail API v1 and Local EML drop folder processing.
"""

from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
import sys

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
from app.database.database import SessionLocal, init_db
from app.database.models import CalendarRecord, EmailProcessedRecord
from app.integrations.gmail import gmail_service
from app.services.email_poller import email_poller


def create_sample_eml(destination_path: Path):
    """Creates a sample .eml message for local offline verification."""
    msg = EmailMessage()
    msg["Subject"] = "[Thử nghiệm] Kế hoạch họp bàn giao hệ thống AI"
    msg["From"] = "lead-dev@company.vn"
    msg["To"] = "team@company.vn"
    msg["Date"] = datetime.now().strftime("%a, %d %b %Y %H:%M:%S +0700")

    body_content = (
        "Chào toàn thể đội ngũ,\n\n"
        "Chúng ta sẽ có buổi họp rà soát và bàn giao dự án Local AI Assistant vào lúc "
        "15h30 chiều mai tại phòng họp chính.\n"
        "Vui lòng chuẩn bị tài liệu báo cáo đầy đủ.\n\n"
        "Trân trọng,\nTech Lead"
    )
    msg.set_content(body_content)

    # Optional dummy PDF attachment
    dummy_pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    msg.add_attachment(
        dummy_pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename="Bien_ban_ban_giao.pdf",
    )

    destination_path.write_bytes(msg.as_bytes())
    print(f"   -> Đã tạo email mẫu thử nghiệm: {destination_path}")


def run_smoke_test():
    print("=" * 70)
    print("      OUTBOUND EMAIL POLLING SMOKE TEST (GMAIL API / EML)      ")
    print("=" * 70)

    # 1. Initialize DB
    init_db()

    # 2. Check Provider Status
    print("\n1. Trạng thái kết nối các nhà cung cấp email:")
    print(f"   - Gmail API: {'Sẵn sàng (Đã xác thực)' if gmail_service.is_authenticated() else 'Chưa đăng nhập (cần credentials.json)'}")
    print(f"   - Local EML Drop Folder: {email_poller.inbox_dir} (Luôn khả dụng)")

    # 3. Create a synthetic test .eml in inbox folder
    print("\n2. Tạo email thử nghiệm vào thư mục data/emails_inbox...")
    test_eml_path = email_poller.inbox_dir / f"test_meeting_{int(datetime.now().timestamp())}.eml"
    create_sample_eml(test_eml_path)

    # 4. Run poller cycle
    print("\n3. Đang thực thi chu kỳ quét email (email_poller.poll_once())...")
    result = email_poller.poll_once()
    print(f"   -> Kết quả: Tổng kiểm tra={result['total_checked']}, "
          f"Đã xử lý mới={result['new_processed']}, "
          f"Sự kiện lịch đã tạo={result['events_scheduled']}")

    # 5. Verify database records
    db = SessionLocal()
    try:
        proc_records = db.query(EmailProcessedRecord).all()
        print(f"\n4. Kiểm tra lịch sử xử lý (Bảng emails_processed): {len(proc_records)} bản ghi.")
        for r in proc_records[-3:]:
            print(f"   - [{r.source}] {r.subject[:40]}... | Sự kiện: {r.calendar_events_count} | PDF: {r.pdf_attachments_count}")

        cal_records = db.query(CalendarRecord).all()
        print(f"\n5. Kiểm tra sự kiện lịch đã trích xuất (Bảng calendar_events): {len(cal_records)} bản ghi.")
        for c in cal_records[-3:]:
            print(f"   - {c.title} lúc {c.start_time} (nhắc trước {c.reminder_minutes}p)")
    finally:
        db.close()

    # 6. Clean up test eml
    if test_eml_path.exists():
        test_eml_path.unlink()
        print("\n6. Đã dọn dẹp file thử nghiệm tạm thời.")

    print("\n✅ EMAIL POLLING SMOKE TEST HOÀN TẤT THÀNH CÔNG!")


if __name__ == "__main__":
    run_smoke_test()
