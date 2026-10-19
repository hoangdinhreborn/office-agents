import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.database import get_db, SessionLocal
from app.database.models import CalendarRecord, EmailProcessedRecord, RLFeedbackRecord, SolutionRecord
from datetime import datetime, timezone


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_records():
    db = SessionLocal()
    try:
        db.query(CalendarRecord).delete()
        db.query(EmailProcessedRecord).delete()
        db.query(RLFeedbackRecord).delete()
        db.query(SolutionRecord).delete()
        db.commit()
    finally:
        db.close()


def test_calendar_pagination(client):
    db = SessionLocal()
    try:
        for i in range(5):
            rec = CalendarRecord(
                title=f"Meeting {i+1}",
                start_time=datetime(2026, 10, 5, 10 + i, 0, tzinfo=timezone.utc),
                end_time=datetime(2026, 10, 5, 11 + i, 0, tzinfo=timezone.utc),
                reminder_minutes=30,
                location="Room 101",
                source_type="prompt",
            )
            db.add(rec)
        db.commit()
    finally:
        db.close()

    # Test page 1 with page_size=2
    res = client.get("/api/calendar/events?page=1&page_size=2")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 5
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total_pages"] == 3
    assert len(data["items"]) == 2
    assert data["items"][0]["title"] == "Meeting 1"

    # Test page 3 with page_size=2
    res3 = client.get("/api/calendar/events?page=3&page_size=2")
    assert res3.status_code == 200
    data3 = res3.json()
    assert len(data3["items"]) == 1
    assert data3["items"][0]["title"] == "Meeting 5"

    # Test without page parameter (returns list directly for backward compatibility)
    res_all = client.get("/api/calendar/events")
    assert res_all.status_code == 200
    assert isinstance(res_all.json(), list)
    assert len(res_all.json()) == 5


def test_processed_emails_pagination(client):
    db = SessionLocal()
    try:
        for i in range(7):
            rec = EmailProcessedRecord(
                id=f"msg_test_{i+1}",
                source="gmail",
                subject=f"Urgent task {i+1}",
                sender_email="boss@company.com",
                calendar_events_count=1,
                pdf_attachments_count=0,
                status="processed",
            )
            db.add(rec)
        db.commit()
    finally:
        db.close()

    res = client.get("/api/emails/processed?page=1&page_size=3")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 7
    assert data["page"] == 1
    assert data["page_size"] == 3
    assert data["total_pages"] == 3
    assert len(data["items"]) == 3

    # Backward compatibility
    res_list = client.get("/api/emails/processed")
    assert res_list.status_code == 200
    assert isinstance(res_list.json(), list)
    assert len(res_list.json()) == 7


def test_feedback_pagination(client):
    db = SessionLocal()
    try:
        for i in range(6):
            rec = RLFeedbackRecord(
                agent_type="solution" if i % 2 == 0 else "summary",
                prompt=f"Prompt {i+1}",
                response=f"Response {i+1}",
                rating=1 if i % 2 == 0 else -1,
            )
            db.add(rec)
        db.commit()
    finally:
        db.close()

    res = client.get("/api/feedback?page=1&page_size=4")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 6
    assert data["page"] == 1
    assert data["page_size"] == 4
    assert data["total_pages"] == 2
    assert len(data["items"]) == 4

    # With filter and pagination
    res_filtered = client.get("/api/feedback?agent_type=solution&page=1&page_size=2")
    assert res_filtered.status_code == 200
    data_fil = res_filtered.json()
    assert data_fil["total"] == 3
    assert len(data_fil["items"]) == 2


def test_solutions_pagination(client):
    db = SessionLocal()
    try:
        for i in range(5):
            rec = SolutionRecord(
                problem=f"Memory leak in service {i+1}",
                root_cause=f"Unbounded cache {i+1}",
                full_markdown=f"# Solution {i+1}\n\nClear cache.",
            )
            db.add(rec)
        db.commit()
    finally:
        db.close()

    res = client.get("/api/solutions?page=1&page_size=2")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 5
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total_pages"] == 3
    assert len(data["items"]) == 2

    # Backward compatibility
    res_list = client.get("/api/solutions")
    assert res_list.status_code == 200
    assert isinstance(res_list.json(), list)
    assert len(res_list.json()) == 5
