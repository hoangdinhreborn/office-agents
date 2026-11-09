from datetime import datetime
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.agents.email_agent import (
    email_agent,
    parse_email_analysis,
    match_folder_rule,
    route_and_apply_folder,
)
from app.database.database import SessionLocal, init_db
from app.database.models import EmailFolderRuleRecord, EmailProcessedRecord
from app.main import app
from app.schemas.email import EmailAttachment, EmailMessage
from app.services.pdf_generator import pdf_generator

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    init_db()
    db = SessionLocal()
    db.query(EmailFolderRuleRecord).delete()
    db.query(EmailProcessedRecord).delete()
    db.commit()
    db.close()
    yield


def test_urgency_parsing_accuracy():
    """
    CRITICAL TEST: Ensures that normal/low/medium urgency is NEVER falsely classified as 'Khẩn cấp'.
    Root cause in older code was 'khẩn cấp' in text.lower() matching header '(Thấp / Trung bình / Cao / Khẩn cấp)'.
    """
    # 1. Output containing header template and low urgency
    sample_low = (
        "Phân tích email:\n"
        "1. Người gửi: Sinh viên Nguyễn Văn A <sv@student.edu.vn>\n"
        "2. Phân loại danh mục: Nộp bài\n"
        "3. Mức độ khẩn cấp: Thấp (Email nộp bài tập thông thường trước hạn)\n"
        "4. Nội dung: Em xin nộp bài tập tuần 5 môn Trí tuệ nhân tạo."
    )
    res_low = parse_email_analysis(sample_low)
    assert res_low["urgency"] == "Thấp", f"Expected 'Thấp' but got '{res_low['urgency']}'"
    assert res_low["category"] == "Nộp bài"

    # 2. Output containing medium urgency
    sample_med = (
        "Thông tin email:\n"
        "3. 🚨 Mức độ khẩn cấp: Trung bình\n"
        "Trao đổi tiến độ dự án tuần tới."
    )
    res_med = parse_email_analysis(sample_med)
    assert res_med["urgency"] == "Trung bình"

    # 3. Output containing high urgency
    sample_high = (
        "3. Mức độ khẩn cấp: Cao\n"
        "Cần hoàn tất báo cáo tài chính trong 24 giờ tới."
    )
    res_high = parse_email_analysis(sample_high)
    assert res_high["urgency"] == "Cao"

    # 4. Genuine urgent incident
    sample_urgent = (
        "3. 🚨 Mức độ khẩn cấp: Khẩn cấp\n"
        "Sự cố máy chủ sập diện rộng, khách hàng không thể đăng nhập thanh toán!"
    )
    res_urgent = parse_email_analysis(sample_urgent)
    assert res_urgent["urgency"] == "Khẩn cấp"
    assert res_urgent["has_issue"] is True


def test_category_parsing():
    sample_assignment = "Tiêu đề: Nộp bài tập lớn cuối kỳ môn Machine Learning\nEm đính kèm file báo cáo."
    res = parse_email_analysis(sample_assignment)
    assert res["category"] == "Nộp bài"

    sample_notice = "Thông báo học vụ về lịch thi chuẩn đầu ra tiếng Anh tháng 12"
    res2 = parse_email_analysis(sample_notice)
    assert res2["category"] == "Học vụ"

    sample_question = "Em có một số thắc mắc về đề tài khóa luận nhờ thầy hỗ trợ giải đáp giúp em ạ"
    res3 = parse_email_analysis(sample_question)
    assert res3["category"] == "Thắc mắc"


def test_match_folder_rule():
    db = SessionLocal()
    rule_submission = EmailFolderRuleRecord(
        folder_name="Nộp bài",
        description="Thư nộp bài tập",
        color="#3B82F6",
        auto_apply_gmail_label=False,
    )
    rule_submission.set_keywords(["bài tập", "nộp bài", "assignment"])
    rule_submission.set_senders(["*@student.edu.vn"])
    db.add(rule_submission)
    db.commit()

    # Match by sender wildcard
    msg_student = EmailMessage(
        id="gmail-001",
        subject="Chào thầy",
        sender_name="Sinh viên",
        sender_email="nguyenvana@student.edu.vn",
        received_time="2026-11-02 09:00:00",
        body="Em gửi lời chào",
        folder="INBOX",
    )
    matched = match_folder_rule(msg_student, [rule_submission])
    assert matched is not None
    assert matched.folder_name == "Nộp bài"

    # Match by keyword
    msg_other_domain = EmailMessage(
        id="gmail-002",
        subject="Nộp bài assignment 3",
        sender_name="Trần Văn B",
        sender_email="tranvanb@gmail.com",
        received_time="2026-11-02 09:30:00",
        body="File nộp bài đính kèm",
        folder="INBOX",
    )
    matched2 = match_folder_rule(msg_other_domain, [rule_submission])
    assert matched2 is not None
    assert matched2.folder_name == "Nộp bài"

    # No match -> None
    msg_spam = EmailMessage(
        id="gmail-003",
        subject="Quảng cáo dịch vụ du lịch",
        sender_name="Sales",
        sender_email="sales@travel.com",
        received_time="2026-11-02 10:00:00",
        body="Ưu đãi vé máy bay mùa hè",
        folder="INBOX",
    )
    matched3 = match_folder_rule(msg_spam, [rule_submission])
    assert matched3 is None

    db.close()


def test_folder_rules_api_crud():
    # 1. Create rule
    create_payload = {
        "folder_name": "Nộp bài tập",
        "description": "Thư nộp bài tập sinh viên",
        "keywords": ["bài tập", "nộp bài", "assignment", "lab"],
        "senders": ["*@student.edu.vn"],
        "color": "#3B82F6",
        "auto_apply_gmail_label": False,
    }
    res = client.post("/api/emails/rules", json=create_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["rule"]["folder_name"] == "Nộp bài tập"
    rule_id = data["rule"]["id"]

    # 2. List rules
    list_res = client.get("/api/emails/rules")
    assert list_res.status_code == 200
    rules = list_res.json()
    assert len(rules) == 1
    assert rules[0]["folder_name"] == "Nộp bài tập"

    # 3. Check folders endpoint reflects custom folder
    folders_res = client.get("/api/emails/folders")
    assert folders_res.status_code == 200
    f_data = folders_res.json()
    assert "Nộp bài tập" in f_data["folders"]

    # 4. Delete rule
    del_res = client.delete(f"/api/emails/rules/{rule_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # 5. List after delete
    list_after = client.get("/api/emails/rules").json()
    assert len(list_after) == 0


def test_email_pdf_attachment_summarization():
    dummy_pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    attachment = EmailAttachment(
        filename="bai_tap_lon_nhom_5.pdf",
        content_type="application/pdf",
        data=dummy_pdf_bytes,
        is_pdf=True,
    )

    msg = EmailMessage(
        id="gmail-pdf-101",
        subject="Nộp báo cáo đồ án môn AI",
        sender_name="Nhóm 5",
        sender_email="nhom5@student.edu.vn",
        received_time="2026-11-02 10:15:00",
        body="Kính gửi Thầy, nhóm 5 xin nộp file PDF báo cáo đồ án.",
        folder="INBOX",
        has_attachments=True,
        attachments=[attachment],
    )

    with patch("app.agents.summary_agent.summary_agent.summarize_pdf") as mock_sum:
        mock_res = MagicMock()
        mock_res.executive_summary = "Báo cáo đồ án xây dựng hệ thống trợ lý ảo đa tác tử."
        mock_res.full_markdown = "Báo cáo đầy đủ..."
        mock_sum.return_value = mock_res

        with patch("app.agents.email_agent.chat_with_llm") as mock_llm:
            mock_llm.return_value = MagicMock(
                thought="Phân tích email nộp bài",
                content=(
                    "1. Người gửi: Nhóm 5\n"
                    "2. Phân loại danh mục: Nộp bài\n"
                    "3. Mức độ khẩn cấp: Thấp\n"
                    "4. Nội dung: Nộp báo cáo đồ án."
                ),
            )

            analyzed = email_agent.analyze_single_email(msg, summarize_pdf_attachment=True)
            assert analyzed.pdf_filename == "bai_tap_lon_nhom_5.pdf"
            assert "trợ lý ảo" in analyzed.pdf_summary
            assert analyzed.urgency == "Thấp"
            assert analyzed.category == "Nộp bài"


def test_daily_digest_api_and_pdf_generation(tmp_path):
    # Seed 30 simulated emails for today
    today_str = "2026-11-02"
    simulated_emails = []

    # 10 Submissions
    for i in range(1, 11):
        simulated_emails.append({
            "id": f"mail-sub-{i}",
            "subject": f"Nộp bài tập lab {i} - Sinh viên {i}",
            "sender_email": f"sv{i}@student.edu.vn",
            "sender_name": f"Sinh viên {i}",
            "received_time": f"{today_str} 08:{i:02d}:00",
            "folder": "Nộp bài",
            "urgency": "Thấp",
            "category": "Nộp bài",
            "has_attachments": True,
            "pdf_filename": f"lab_{i}_report.pdf",
            "pdf_summary": f"Báo cáo kết quả thực hành bài lab {i}.",
            "body": f"Em nộp bài tập lab {i}.",
        })

    # 8 Notices / Academic
    for i in range(1, 9):
        simulated_emails.append({
            "id": f"mail-not-{i}",
            "subject": f"Thông báo học vụ số {i}/TB-ĐT",
            "sender_email": "daotao@truong.edu.vn",
            "sender_name": "Phòng Đào Tạo",
            "received_time": f"{today_str} 09:{i:02d}:00",
            "folder": "Học vụ",
            "urgency": "Trung bình",
            "category": "Học vụ",
            "has_attachments": False,
            "pdf_filename": None,
            "pdf_summary": None,
            "body": f"Nội dung thông báo học vụ số {i}.",
        })

    # 5 Inquiries
    for i in range(1, 6):
        simulated_emails.append({
            "id": f"mail-inq-{i}",
            "subject": f"Thắc mắc về đề tài đồ án môn học {i}",
            "sender_email": f"student{i}@gmail.com",
            "sender_name": f"Học viên {i}",
            "received_time": f"{today_str} 10:{i:02d}:00",
            "folder": "Thắc mắc",
            "urgency": "Trung bình",
            "category": "Thắc mắc",
            "has_attachments": False,
            "pdf_filename": None,
            "pdf_summary": None,
            "body": f"Em muốn hỏi về yêu cầu kỹ thuật của đề tài {i}.",
        })

    # 7 Urgent tasks / incidents
    for i in range(1, 8):
        simulated_emails.append({
            "id": f"mail-urg-{i}",
            "subject": f"[KHẨN CẤP] Sự cố hệ thống kiểm tra trực tuyến server {i}",
            "sender_email": "admin@local-ai.vn",
            "sender_name": "Quản Trị Hệ Thống",
            "received_time": f"{today_str} 11:{i:02d}:00",
            "folder": "Khẩn cấp",
            "urgency": "Khẩn cấp",
            "category": "Khẩn cấp",
            "has_attachments": False,
            "pdf_filename": None,
            "pdf_summary": None,
            "body": f"Cần khắc phục khẩn cấp sự cố tại cổng dịch vụ {i}.",
        })

    assert len(simulated_emails) == 30

    # 1. Test generate_daily_digest logic
    digest = email_agent.generate_daily_digest(target_date=today_str, email_items=simulated_emails)
    assert digest["total_emails"] == 30
    assert len(digest["categories"]["Nộp bài"]) == 10
    assert len(digest["categories"]["Học vụ"]) == 8
    assert len(digest["categories"]["Thắc mắc"]) == 5
    assert len(digest["categories"]["Khẩn cấp"]) == 7
    assert digest["urgent_count"] == 7
    assert digest["pdf_count"] == 10
    assert len(digest["action_items"]) > 0

    # 2. Test PDF file generation via PyMuPDF
    pdf_out = pdf_generator.generate_digest_pdf(
        target_date=today_str,
        digest_data=digest,
        output_filename="test_digest_30_emails.pdf",
    )
    assert pdf_out.exists()
    assert pdf_out.stat().st_size > 2000

    # 3. Test PDF file readability with PyMuPDF
    import pymupdf as fitz
    doc = fitz.open(str(pdf_out))
    assert len(doc) >= 1
    first_page_text = doc[0].get_text()
    normalized_text = first_page_text.replace("\xa0", " ")
    assert "BÁO CÁO TỔNG HỢP EMAIL TRONG NGÀY" in normalized_text
    doc.close()

    # 4. Test API Download Endpoint
    dl_res = client.get("/api/emails/daily-digest/download/test_digest_30_emails.pdf")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/pdf"
    assert len(dl_res.content) > 2000


def test_email_persistence_and_retrieval_retention():
    """
    CRITICAL TEST: Verifies that analyzing emails persists the full Markdown summary,
    full_analysis, sender, category, and urgency into SQLite database, and that
    querying /api/emails/processed restores all fields without losing content when switching tabs.
    """
    db = SessionLocal()
    # Clean previous records
    db.query(EmailProcessedRecord).delete()
    db.commit()
    db.close()

    mock_email = EmailMessage(
        id="gmail-persist-999",
        subject="[Báo Cáo] Tiến độ đồ án môn AI và nộp bài lab",
        sender_name="Nguyễn Văn A",
        sender_email="nva@student.edu.vn",
        received_time="2026-11-04 09:30:00",
        body="Kính gửi Thầy, em xin nộp bài tập lab 5 và báo cáo tiến độ đồ án.",
        folder="INBOX",
    )

    with patch("app.integrations.gmail.gmail_service.fetch_unread_emails", return_value=[mock_email]):
        with patch("app.agents.email_agent.chat_with_llm") as mock_llm:
            mock_llm.return_value = MagicMock(
                thought="Phân tích email nộp bài",
                content=(
                    "### Tóm Tắt Email\n\n"
                    "- **Người gửi**: Nguyễn Văn A\n"
                    "- **Danh mục**: Nộp bài\n"
                    "- **Mức độ khẩn cấp**: Thấp\n\n"
                    "Sinh viên nộp bài lab 5 và báo cáo đồ án đúng hạn."
                ),
            )

            # 1. Trigger analysis via API
            res = client.post(
                "/api/emails/analyze",
                json={"folder_name": "INBOX", "limit": 5, "unread_only": False},
            )
            assert res.status_code == 200
            data = res.json()
            assert "items" in data
            assert len(data["items"]) == 1
            item = data["items"][0]
            assert "Sinh viên nộp bài" in item["summary"]

            # 2. Query processed emails from DB via GET /api/emails/processed
            get_res = client.get("/api/emails/processed?page=1&page_size=10")
            assert get_res.status_code == 200
            db_data = get_res.json()
            assert db_data["total"] == 1
            saved_item = db_data["items"][0]

            # Verify that summary and all critical fields are retained in the database!
            assert saved_item["id"] == "gmail-persist-999"
            assert "Sinh viên nộp bài" in saved_item["summary"]
            assert saved_item["urgency"] == "Thấp"
            assert saved_item["category"] == "Nộp bài"
            assert "Nguyễn Văn A" in saved_item["sender"]
            assert saved_item["folder"] == "INBOX"
