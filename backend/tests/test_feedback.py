import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.database.database import SessionLocal, init_db
from app.database.models import RLFeedbackRecord
from app.main import app
from app.rag.export_dataset import export_dpo_dataset, export_grpo_dataset
from app.security.token_store import SecureTokenStore

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_test_feedback():
    init_db()
    db = SessionLocal()
    db.query(RLFeedbackRecord).delete()
    db.commit()
    db.close()
    yield


def test_secure_token_store(tmp_path):
    store = SecureTokenStore(storage_dir=tmp_path)
    token_payload = {
        "access_token": "secret_access_xyz_123",
        "refresh_token": "secret_refresh_abc_789",
        "expires_in": 3600,
    }

    # 1. Save token
    saved_path = store.save_token("test_provider", token_payload)
    assert saved_path.exists()
    assert saved_path.suffix == ".enc"

    # Verify that stored file is encrypted (not raw JSON)
    raw_content = saved_path.read_text(encoding="utf-8")
    assert "secret_access_xyz_123" not in raw_content

    # 2. Load token
    loaded = store.load_token("test_provider")
    assert isinstance(loaded, dict)
    assert loaded["access_token"] == "secret_access_xyz_123"
    assert loaded["refresh_token"] == "secret_refresh_abc_789"

    # 3. Check existence & delete
    assert store.has_token("test_provider") is True
    deleted = store.delete_token("test_provider")
    assert deleted is True
    assert store.has_token("test_provider") is False
    assert store.load_token("test_provider") is None


def test_feedback_api_submit_and_stats():
    # 1. Submit feedback 1 (with human correction)
    payload1 = {
        "agent_type": "solution",
        "prompt": "Máy chủ cơ sở dữ liệu bị quá tải kết nối lúc 14h",
        "response": "Khởi động lại máy chủ ngay lập tức.",
        "corrected_response": "1. Giảm max connections tạm thời. 2. Kiểm tra query bị treo. 3. Thêm connection pool.",
        "rating": 1,
        "feedback_notes": "Cần phương án an toàn không gây gián đoạn dịch vụ",
        "metadata": {"model": "deepseek-r1:8b", "execution_time": 2.5},
    }
    res1 = client.post("/api/feedback", json=payload1)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["success"] is True
    assert data1["agent_type"] == "solution"

    # 2. Submit feedback 2 (without correction, thumbs down)
    payload2 = {
        "agent_type": "summary",
        "prompt": "Tóm tắt báo cáo tài chính quý 3",
        "response": "Tóm tắt không đầy đủ thông tin",
        "rating": -1,
        "feedback_notes": "Thiếu số liệu doanh thu",
    }
    res2 = client.post("/api/feedback", json=payload2)
    assert res2.status_code == 200

    # 3. List feedback
    list_res = client.get("/api/feedback")
    assert list_res.status_code == 200
    feedbacks = list_res.json()
    assert len(feedbacks) == 2

    # Filter by agent_type
    filtered_res = client.get("/api/feedback?agent_type=solution")
    assert filtered_res.status_code == 200
    assert len(filtered_res.json()) == 1

    # 4. Check stats
    stats_res = client.get("/api/feedback/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_feedback"] == 2
    assert stats["with_corrections_count"] == 1
    assert stats["positive_count"] == 1
    assert stats["negative_count"] == 1
    assert stats["by_agent"]["solution"] == 1
    assert stats["by_agent"]["summary"] == 1


def test_export_dpo_and_grpo_datasets(tmp_path):
    # Insert test data into DB
    db = SessionLocal()
    rec1 = RLFeedbackRecord(
        id="fb-001",
        agent_type="solution",
        prompt="Hệ thống báo lỗi Out of Memory",
        response="Tăng RAM cho server.",
        corrected_response="1. Kiểm tra memory leak. 2. Tinh chỉnh garbage collector. 3. Phân tải sang worker.",
        rating=1,
    )
    rec2 = RLFeedbackRecord(
        id="fb-002",
        agent_type="calendar",
        prompt="Hẹn họp 15h chiều mai",
        response="Cuộc hẹn lúc 15h ngày 2026-10-06.",
        corrected_response=None,  # No correction
        rating=1,
    )
    db.add(rec1)
    db.add(rec2)
    db.commit()
    db.close()

    # 1. Test DPO Export: Only records with human corrections
    dpo_file = tmp_path / "dataset_dpo.jsonl"
    count_dpo = export_dpo_dataset(dpo_file)
    assert count_dpo == 1
    assert dpo_file.exists()

    dpo_lines = [json.loads(line) for line in dpo_file.read_text(encoding="utf-8").strip().split("\n")]
    assert len(dpo_lines) == 1
    dpo_sample = dpo_lines[0]
    assert dpo_sample["prompt"] == "Hệ thống báo lỗi Out of Memory"
    assert "leak" in dpo_sample["chosen"]
    assert "Tăng RAM" in dpo_sample["rejected"]

    # 2. Test GRPO Export: All records with rewards assigned
    grpo_file = tmp_path / "dataset_grpo.jsonl"
    count_grpo = export_grpo_dataset(grpo_file)
    assert count_grpo == 2
    assert grpo_file.exists()

    grpo_lines = [json.loads(line) for line in grpo_file.read_text(encoding="utf-8").strip().split("\n")]
    assert len(grpo_lines) == 2
    grpo_sample = next(item for item in grpo_lines if item["id"] == "fb-001")
    assert len(grpo_sample["responses"]) == 2
    assert any(r["reward"] == 1.0 and r["source"] == "human_corrected" for r in grpo_sample["responses"])
