import base64
from datetime import datetime
from email.message import EmailMessage as StdEmailMessage
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from app.database.database import SessionLocal, init_db
from app.database.models import CalendarRecord, EmailProcessedRecord
from app.integrations.eml_parser import parse_eml_bytes
from app.integrations.gmail import GmailService
from app.schemas.email import EmailAttachment, EmailMessage
from app.services.email_poller import EmailPoller


@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    db = SessionLocal()
    # Clean up test table
    db.query(EmailProcessedRecord).delete()
    db.commit()
    db.close()
    yield


def test_eml_parser_multipart_with_pdf_attachment():
    msg = StdEmailMessage()
    msg["Subject"] = "Thư mời họp dự án Local AI"
    msg["From"] = "Trưởng dự án <lead@local-ai.vn>"
    msg["To"] = "dev@local-ai.vn"
    msg["Date"] = "Mon, 10 Nov 2026 09:30:00 +0700"

    body_text = "Cuộc họp sẽ diễn ra vào lúc 14h00 ngày 25/11/2026."
    msg.set_content(body_text)

    # Attach dummy PDF
    pdf_content = b"%PDF-1.4\ntest pdf content\n%%EOF"
    msg.add_attachment(
        pdf_content,
        maintype="application",
        subtype="pdf",
        filename="ke_hoach_hop.pdf",
    )

    eml_bytes = msg.as_bytes()
    parsed = parse_eml_bytes(eml_bytes, fallback_id="test-eml-001")

    assert parsed.id == "test-eml-001"
    assert parsed.subject == "Thư mời họp dự án Local AI"
    assert parsed.sender_email == "lead@local-ai.vn"
    assert "14h00" in parsed.body
    assert parsed.has_attachments is True
    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].filename == "ke_hoach_hop.pdf"
    assert parsed.attachments[0].is_pdf is True
    assert parsed.attachments[0].data == pdf_content


def test_gmail_service_fetch_and_attachment():
    service = GmailService()
    mock_api = MagicMock()
    service._service = mock_api

    # 1. Mock messages list
    mock_users = mock_api.users.return_value
    mock_messages = mock_users.messages.return_value
    mock_messages.list.return_value.execute.return_value = {
        "messages": [{"id": "gmail_msg_101"}]
    }

    # 2. Mock message get
    b64_body = base64.urlsafe_b64encode("Nội dung email thử nghiệm Gmail".encode("utf-8")).decode("utf-8")
    b64_pdf = base64.urlsafe_b64encode(b"%PDF-1.4\nsample pdf\n%%EOF").decode("utf-8")

    mock_messages.get.return_value.execute.return_value = {
        "id": "gmail_msg_101",
        "payload": {
            "headers": [
                {"name": "Subject", "value": "Thư kiểm tra Gmail API"},
                {"name": "From", "value": "Partner <partner@domain.com>"},
                {"name": "Date", "value": "Thu, 15 Oct 2026 10:00:00 +0700"},
            ],
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": b64_body},
                },
                {
                    "mimeType": "application/pdf",
                    "filename": "dinh_kem.pdf",
                    "body": {"attachmentId": "att_999"},
                },
            ],
        },
    }

    # 3. Mock attachment get
    mock_attachments = mock_messages.attachments.return_value
    mock_attachments.get.return_value.execute.return_value = {
        "data": b64_pdf,
    }

    emails = service.fetch_unread_emails(label="INBOX")
    assert len(emails) == 1
    msg = emails[0]
    assert msg.id == "gmail-gmail_msg_101"
    assert msg.subject == "Thư kiểm tra Gmail API"
    assert msg.sender_email == "partner@domain.com"
    assert "Nội dung email thử nghiệm" in msg.body
    assert msg.has_attachments is True
    assert len(msg.attachments) == 1
    assert msg.attachments[0].filename == "dinh_kem.pdf"
    assert msg.attachments[0].is_pdf is True
    assert msg.attachments[0].data == b"%PDF-1.4\nsample pdf\n%%EOF"


def test_email_poller_deduplication_and_processing(tmp_path):
    poller = EmailPoller()
    poller.inbox_dir = tmp_path

    # Create a synthetic .eml file in tmp_path
    eml_file = tmp_path / "test_poller.eml"
    msg = StdEmailMessage()
    msg["Subject"] = "Họp triển khai module mới"
    msg["From"] = "dev-lead@company.vn"
    msg["Date"] = "Fri, 20 Nov 2026 10:00:00 +0700"
    msg.set_content("Kế hoạch họp lúc 10h00 sáng mai.")
    eml_file.write_bytes(msg.as_bytes())

    # Cycle 1: First time polling (patch allowed_senders to allow all and disable external Gmail API)
    with patch("app.services.email_poller.settings.allowed_senders", []), \
         patch("app.services.email_poller.gmail_service.is_authenticated", return_value=False), \
         patch("app.agents.calendar_agent.calendar_agent.extract_and_schedule") as mock_extract:
        mock_result = MagicMock()
        mock_result.scheduled_events = []
        mock_extract.return_value = mock_result

        stats1 = poller.poll_once()
        assert stats1["total_checked"] >= 1
        assert stats1["new_processed"] == 1
        assert mock_extract.called

    # Verify DB record
    db = SessionLocal()
    records = db.query(EmailProcessedRecord).all()
    assert len(records) == 1
    assert records[0].subject == "Họp triển khai module mới"
    assert records[0].status == "processed"
    db.close()

    # Cycle 2: Second time polling -> must be deduplicated
    with patch("app.services.email_poller.settings.allowed_senders", []), \
         patch("app.services.email_poller.gmail_service.is_authenticated", return_value=False), \
         patch("app.agents.calendar_agent.calendar_agent.extract_and_schedule") as mock_extract2:
        stats2 = poller.poll_once()
        assert stats2["new_processed"] == 0  # Deduplicated!
        assert not mock_extract2.called
