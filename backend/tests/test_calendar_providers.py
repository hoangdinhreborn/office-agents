from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
import pytest
from zoneinfo import ZoneInfo

from app.integrations.google_calendar import GoogleCalendarProvider, VN_TZ


def test_google_calendar_provider_create_and_duplicate():
    provider = GoogleCalendarProvider()
    mock_service = MagicMock()
    provider._service = mock_service

    # Setup mock responses
    mock_events = mock_service.events.return_value
    mock_insert = mock_events.insert.return_value
    mock_insert.execute.return_value = {
        "id": "gcal-123456",
        "htmlLink": "https://calendar.google.com/event?eid=gcal-123456",
    }

    # Case 1: First creation (no duplicate)
    mock_list = mock_events.list.return_value
    mock_list.execute.return_value = {"items": []}

    start = datetime(2026, 11, 15, 14, 0, 0, tzinfo=VN_TZ)
    end = datetime(2026, 11, 15, 15, 0, 0, tzinfo=VN_TZ)

    res = provider.create_event(
        title="Họp kỹ thuật Google",
        start_time=start,
        end_time=end,
        description="Nội dung họp kỹ thuật",
        location="Phòng A",
        reminder_minutes=20,
        stable_hash="hash_tech_001",
    )

    assert res["success"] is True
    assert res["event_id"] == "gcal-123456"
    assert res["is_duplicate"] is False
    assert mock_events.insert.called

    # Verify body structure
    call_kwargs = mock_events.insert.call_args[1]
    body = call_kwargs["body"]
    assert body["summary"] == "Họp kỹ thuật Google"
    assert body["reminders"]["overrides"] == [{"method": "popup", "minutes": 20}]
    assert body["extendedProperties"]["private"]["stable_hash"] == "hash_tech_001"

    # Case 2: Duplicate detection
    mock_list.execute.return_value = {"items": [{"id": "gcal-123456"}]}
    res_dup = provider.create_event(
        title="Họp kỹ thuật Google",
        start_time=start,
        end_time=end,
        stable_hash="hash_tech_001",
    )
    assert res_dup["is_duplicate"] is True
    assert res_dup["event_id"] == "gcal-123456"


def test_google_calendar_provider_delete():
    provider = GoogleCalendarProvider()
    mock_service = MagicMock()
    provider._service = mock_service

    mock_events = mock_service.events.return_value
    mock_events.delete.return_value.execute.return_value = None

    success = provider.delete_event("gcal-123456")
    assert success is True
    assert mock_events.delete.called


def test_google_calendar_provider_list_events():
    provider = GoogleCalendarProvider()
    mock_service = MagicMock()
    provider._service = mock_service

    mock_events = mock_service.events.return_value
    mock_events.list.return_value.execute.return_value = {
        "items": [
            {
                "id": "event_001",
                "summary": "Review mã nguồn",
                "start": {"dateTime": "2026-11-20T10:00:00+07:00"},
                "end": {"dateTime": "2026-11-20T11:00:00+07:00"},
            }
        ]
    }

    events = provider.list_events(max_results=5)
    assert len(events) == 1
    assert events[0]["id"] == "event_001"
    assert events[0]["summary"] == "Review mã nguồn"
