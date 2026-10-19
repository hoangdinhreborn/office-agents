from fastapi.testclient import TestClient
import pytest

from app.llm.ollama import parse_thinking_and_content, extract_json_from_response
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_system_status():
    response = client.get("/api/chat/status")
    assert response.status_code == 200
    data = response.json()
    assert "ollama_status" in data
    assert data.get("email_provider") == "gmail"
    assert data.get("calendar_provider") in ["google", "local"]
    assert "outlook_mode" not in data


def test_reasoning_trace_parsing():
    raw_response = (
        "<think>\n"
        "1. Phân tích văn bản của sếp.\n"
        "2. Phát hiện thời gian họp lúc 15h30.\n"
        "3. Đặt thời gian nhắc trước 30 phút.\n"
        "</think>\n\n"
        "Đã tìm thấy lịch họp vào lúc 15:30."
    )
    thought, content = parse_thinking_and_content(raw_response)
    assert "Phân tích văn bản" in thought
    assert content == "Đã tìm thấy lịch họp vào lúc 15:30."


def test_extract_json_from_markdown():
    text = (
        "<think>Suy nghĩ</think>\n"
        "Dưới đây là kết quả:\n"
        "```json\n"
        "[\n"
        "  {\"title\": \"Họp tuần\", \"reminder_minutes\": 15}\n"
        "]\n"
        "```"
    )
    data = extract_json_from_response(text)
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["title"] == "Họp tuần"
    assert data[0]["reminder_minutes"] == 15


def test_calendar_endpoints():
    response = client.get("/api/calendar/events")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_email_folders_endpoint():
    response = client.get("/api/emails/folders")
    assert response.status_code == 200
    data = response.json()
    assert "folders" in data
    assert len(data["folders"]) > 0
