from datetime import datetime, timedelta
import pytest

from app.integrations.calendar import CalendarEvent, calendar_service
from app.integrations.google_calendar import google_calendar


def test_calendar_event_and_ics_generation():
    start = datetime(2026, 10, 5, 14, 0, 0)
    end = datetime(2026, 10, 5, 15, 30, 0)
    event = CalendarEvent(
        title="Họp bàn giao giải pháp AI",
        start_time=start,
        end_time=end,
        description="Bàn giao mã nguồn và hướng dẫn sử dụng",
        location="Phòng họp 1",
        reminder_minutes=30,
        source_type="prompt",
    )

    ics = calendar_service.generate_ics(event)
    # Check essential iCalendar RFC-5545 elements
    assert "BEGIN:VCALENDAR" in ics
    assert "BEGIN:VEVENT" in ics
    assert "SUMMARY:Họp bàn giao giải pháp AI" in ics
    assert "BEGIN:VALARM" in ics
    assert "TRIGGER:-PT30M" in ics
    assert "ACTION:DISPLAY" in ics
    assert "END:VALARM" in ics
    assert "END:VCALENDAR" in ics
    assert "Asia/Ho_Chi_Minh" in ics


def test_calendar_service_create():
    res = calendar_service.create_event(
        title="Cuộc họp kiểm thử Google Calendar",
        start_time="2026-10-10T09:00:00",
        end_time="2026-10-10T10:00:00",
        reminder_minutes=45,
    )
    assert res["success"] is True
    assert res["event"]["reminder_minutes"] == 45
    assert res["event"]["title"] == "Cuộc họp kiểm thử Google Calendar"
    assert "ics_path" in res


def test_calendar_service_deduplication():
    # Calling create_event with exact title and start time should trigger deduplication
    start_str = "2026-11-15T10:00:00"
    res1 = calendar_service.create_event(
        title="Họp bàn trùng lặp",
        start_time=start_str,
        reminder_minutes=15,
    )
    assert res1["success"] is True
    assert res1.get("is_duplicate", False) is False

    res2 = calendar_service.create_event(
        title="Họp bàn trùng lặp",
        start_time=start_str,
        reminder_minutes=15,
    )
    assert res2["success"] is True
    assert res2.get("is_duplicate") is True


def test_google_calendar_status():
    status = google_calendar.get_status()
    assert "configured" in status
    assert "authenticated" in status
