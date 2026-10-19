from datetime import datetime, timedelta
from fastapi.testclient import TestClient
import pytest

from app.database.database import SessionLocal, init_db
from app.database.models import CalendarRecord, TaskRecord
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def test_task_crud_lifecycle():
    # 1. Create task
    create_payload = {
        "title": "Soạn thảo báo cáo tài chính Q4",
        "due_date": (datetime.utcnow() + timedelta(days=1)).isoformat(),
        "priority": "high",
        "source_type": "email",
        "source_reference": "gmail_msg_12345",
    }
    res = client.post("/api/tasks", json=create_payload)
    assert res.status_code == 200
    task_data = res.json()
    task_id = task_data["id"]
    assert task_data["title"] == "Soạn thảo báo cáo tài chính Q4"
    assert task_data["status"] == "pending"
    assert task_data["priority"] == "high"
    assert task_data["source_type"] == "email"

    # 2. Get list of tasks
    list_res = client.get("/api/tasks")
    assert list_res.status_code == 200
    list_json = list_res.json()
    assert "items" in list_json
    assert "stats" in list_json
    assert any(t["id"] == task_id for t in list_json["items"])

    # 3. Patch task to completed
    patch_res = client.patch(f"/api/tasks/{task_id}", json={"status": "completed"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "completed"

    # 4. Filter by status completed
    filtered_res = client.get("/api/tasks?status=completed")
    assert filtered_res.status_code == 200
    assert any(t["id"] == task_id for t in filtered_res.json()["items"])

    # 5. Delete task
    del_res = client.delete(f"/api/tasks/{task_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # 6. Verify task no longer exists
    check_del = client.delete(f"/api/tasks/{task_id}")
    assert check_del.status_code == 404


def test_task_filters_and_grouping():
    # Create distinct tasks
    t1 = client.post("/api/tasks", json={"title": "Review PDF Contract", "source_type": "pdf"}).json()
    t2 = client.post("/api/tasks", json={"title": "Họp triển khai prompt", "source_type": "prompt"}).json()

    # Filter by pdf
    pdf_res = client.get("/api/tasks?source_type=pdf")
    assert pdf_res.status_code == 200
    items = pdf_res.json()["items"]
    assert any(t["id"] == t1["id"] for t in items)
    assert not any(t["id"] == t2["id"] for t in items)

    # Cleanup
    client.delete(f"/api/tasks/{t1['id']}")
    client.delete(f"/api/tasks/{t2['id']}")


def test_calendar_upcoming_events():
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        dummy_event = CalendarRecord(
            id="test_upcoming_evt_001",
            title="Họp nghiệm thu dự án",
            start_time=now + timedelta(hours=3),
            end_time=now + timedelta(hours=4),
            reminder_minutes=30,
            location="Phòng họp A",
            description="Đánh giá kết quả sprint",
            source_type="prompt",
        )
        db.merge(dummy_event)
        db.commit()

        res = client.get("/api/calendar/upcoming?hours=24")
        assert res.status_code == 200
        data = res.json()
        assert "upcoming_count" in data
        assert "items" in data
        assert any(e["id"] == "test_upcoming_evt_001" for e in data["items"])
    finally:
        db.query(CalendarRecord).filter(CalendarRecord.id == "test_upcoming_evt_001").delete()
        db.commit()
        db.close()


def test_feedback_dpo_train_and_reload_model():
    # Test DPO training endpoint
    train_res = client.post("/api/feedback/train-dpo", json={"epochs": 3, "lora_rank": 16})
    assert train_res.status_code == 200
    data = train_res.json()
    assert data["success"] is True
    assert "logs" in data
    assert len(data["logs"]) == 3
    assert "dataset_path" in data

    # Test reload model endpoint
    reload_res = client.post("/api/feedback/reload-model")
    assert reload_res.status_code == 200
    reload_data = reload_res.json()
    assert reload_data["success"] is True
    assert "model_name" in reload_data
    assert "vram_estimate" in reload_data
    assert "context_window" in reload_data
