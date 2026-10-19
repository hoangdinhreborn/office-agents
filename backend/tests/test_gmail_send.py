import base64
import email
from email.message import EmailMessage
import email.policy
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from google.oauth2.credentials import Credentials

from app.integrations.gmail import GmailService, SCOPES_GMAIL
from app.main import app

client = TestClient(app)


def test_gmail_send_email_success():
    service = GmailService()
    mock_api = MagicMock()
    service._service = mock_api

    mock_send = mock_api.users.return_value.messages.return_value.send
    mock_send.return_value.execute.return_value = {
        "id": "sent_msg_001",
        "threadId": "thread_001",
        "labelIds": ["SENT"],
    }

    res = service.send_email(
        to=["recipient@example.com"],
        subject="[Test] Tiêu đề tiếng Việt có dấu",
        body="Nội dung kiểm tra gửi email tự động.",
        cc=["cc@example.com"],
        bcc=["bcc@example.com"],
        is_html=False,
    )

    assert res["success"] is True
    assert res["provider"] == "gmail"
    assert res["message_id"] == "sent_msg_001"
    assert res["thread_id"] == "thread_001"
    assert "SENT" in res["label_ids"]

    # Verify message payload sent to API
    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args[1]
    assert call_kwargs.get("userId") == "me"
    raw_b64 = call_kwargs["body"]["raw"]
    raw_bytes = base64.urlsafe_b64decode(raw_b64.encode("ascii"))
    parsed_msg = email.message_from_bytes(raw_bytes, policy=email.policy.default)

    assert parsed_msg["To"] == "recipient@example.com"
    assert parsed_msg["Cc"] == "cc@example.com"
    assert parsed_msg["Bcc"] == "bcc@example.com"
    assert parsed_msg["Subject"] == "[Test] Tiêu đề tiếng Việt có dấu"
    assert "Nội dung kiểm tra" in parsed_msg.get_payload()


def test_gmail_send_email_validation():
    service = GmailService()

    # Empty to
    with pytest.raises(ValueError, match="ít nhất một địa chỉ"):
        service.send_email(to=[], subject="Test", body="Hello")

    # Invalid email address (no @)
    with pytest.raises(ValueError, match="không hợp lệ"):
        service.send_email(to=["invalid-address"], subject="Test", body="Hello")

    # Subject with newline
    with pytest.raises(ValueError, match="xuống dòng"):
        service.send_email(to=["valid@example.com"], subject="Test\nHeader Injection", body="Hello")


def test_gmail_token_scope_check(tmp_path):
    token_file = tmp_path / "test_token.json"
    # Token only containing readonly scope
    token_data = {
        "token": "fake_token",
        "refresh_token": "fake_refresh",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "test_client",
        "client_secret": "test_secret",
        "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
    }
    token_file.write_text(json.dumps(token_data), encoding="utf-8")

    service = GmailService()
    service.token_path = token_file

    # has_scopes fails because gmail.send is missing
    assert service.is_authenticated() is False

    with pytest.raises(PermissionError, match="Chưa đăng nhập Gmail"):
        service.authenticate(interactive=False)


def test_api_send_email_endpoints():
    # 1. Unauthenticated -> 401
    with patch("app.api.emails.gmail_service.is_authenticated", return_value=False):
        res = client.post(
            "/api/emails/send",
            json={
                "to": ["user@test.com"],
                "subject": "Test",
                "body": "Test body",
            },
        )
        assert res.status_code == 401
        assert "Chưa đăng nhập" in res.json()["detail"]

    # 2. Invalid input -> 400
    with patch("app.api.emails.gmail_service.is_authenticated", return_value=True):
        res = client.post(
            "/api/emails/send",
            json={
                "to": ["not-an-email"],
                "subject": "Test",
                "body": "Test body",
            },
        )
        assert res.status_code == 400

    # 3. Success -> 200
    with patch("app.api.emails.gmail_service.is_authenticated", return_value=True), \
         patch("app.api.emails.gmail_service.send_email") as mock_send:
        mock_send.return_value = {
            "success": True,
            "provider": "gmail",
            "message_id": "msg_999",
            "thread_id": "thread_999",
            "label_ids": ["SENT"],
        }
        res = client.post(
            "/api/emails/send",
            json={
                "to": ["target@example.com"],
                "subject": "Chào bạn",
                "body": "Nội dung tiếng Việt",
            },
        )
        assert res.status_code == 200
        assert res.json()["message_id"] == "msg_999"

    # 4. Gmail API runtime error -> 502
    with patch("app.api.emails.gmail_service.is_authenticated", return_value=True), \
         patch("app.api.emails.gmail_service.send_email", side_effect=RuntimeError("Gmail API lỗi HTTP 500")):
        res = client.post(
            "/api/emails/send",
            json={
                "to": ["target@example.com"],
                "subject": "Chào bạn",
                "body": "Nội dung",
            },
        )
        assert res.status_code == 502


def test_api_gmail_status():
    with patch("app.api.emails.gmail_service.is_authenticated", return_value=True), \
         patch("app.api.emails.gmail_service.get_profile_email", return_value="myuser@gmail.com"):
        res = client.get("/api/emails/gmail/status")
        assert res.status_code == 200
        data = res.json()
        assert data["authenticated"] is True
        assert data["email"] == "myuser@gmail.com"
        assert "credentials_path" in data
        assert "token_path" in data
