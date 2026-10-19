import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.agents.orchestrator import OrchestratorResponse

client = TestClient(app)


def test_chat_session_crud():
    # 1. Create a session explicitly
    res = client.post("/api/chat/sessions", json={"title": "Test Phiên 1"})
    assert res.status_code == 200
    sess = res.json()
    assert sess["title"] == "Test Phiên 1"
    sess_id = sess["id"]

    # 2. List sessions
    res_list = client.get("/api/chat/sessions")
    assert res_list.status_code == 200
    items = res_list.json()
    assert any(s["id"] == sess_id for s in items)

    # 3. Rename session
    res_patch = client.patch(f"/api/chat/sessions/{sess_id}", json={"title": "Phiên Đã Đổi Tên"})
    assert res_patch.status_code == 200
    assert res_patch.json()["title"] == "Phiên Đã Đổi Tên"

    # 4. Get detail of empty session
    res_detail = client.get(f"/api/chat/sessions/{sess_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["session"]["title"] == "Phiên Đã Đổi Tên"
    assert len(detail["messages"]) == 0

    # 5. Delete session
    res_del = client.delete(f"/api/chat/sessions/{sess_id}")
    assert res_del.status_code == 200
    assert res_del.json()["success"] is True

    # 6. Verify 404 after deletion
    res_not_found = client.get(f"/api/chat/sessions/{sess_id}")
    assert res_not_found.status_code == 404


@patch("app.api.chat.orchestrator.route_and_execute")
def test_chat_endpoint_persistence(mock_route):
    mock_route.return_value = OrchestratorResponse(
        reply="Chào bạn! Tôi có thể giúp gì cho bạn?",
        intent="general",
        agents_invoked=["advisor"],
        thinking_process="Phân tích câu hỏi...",
    )

    # Gửi tin nhắn đầu tiên (không có session_id) -> Backend tự tạo session mới
    prompt = "Xin chào trợ lý ảo"
    res = client.post("/api/chat", json={"message": prompt})
    assert res.status_code == 200
    data = res.json()
    assert "session_id" in data
    sess_id = data["session_id"]
    assert sess_id is not None
    assert data["response"] == "Chào bạn! Tôi có thể giúp gì cho bạn?"

    # Kiểm tra session vừa tạo có chứa tiêu đề trích từ prompt
    res_detail = client.get(f"/api/chat/sessions/{sess_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert len(detail["messages"]) == 2  # 1 user + 1 ai
    assert detail["messages"][0]["role"] == "user"
    assert detail["messages"][0]["content"] == prompt
    assert detail["messages"][1]["role"] == "ai"
    assert detail["messages"][1]["content"] == "Chào bạn! Tôi có thể giúp gì cho bạn?"
    assert detail["messages"][1]["thinking_process"] == "Phân tích câu hỏi..."
    assert "advisor" in detail["messages"][1]["agents_invoked"]

    # Gửi tin nhắn thứ 2 vào cùng session_id
    mock_route.return_value = OrchestratorResponse(
        reply="Câu trả lời số 2",
        intent="general",
        agents_invoked=["summarizer"],
    )
    res2 = client.post("/api/chat", json={"message": "Câu hỏi tiếp theo", "session_id": sess_id})
    assert res2.status_code == 200
    assert res2.json()["session_id"] == sess_id

    # Lấy lại detail để kiểm tra lịch sử đã có 4 tin nhắn
    res_detail2 = client.get(f"/api/chat/sessions/{sess_id}")
    detail2 = res_detail2.json()
    assert len(detail2["messages"]) == 4

    # Dọn dẹp session
    client.delete(f"/api/chat/sessions/{sess_id}")
