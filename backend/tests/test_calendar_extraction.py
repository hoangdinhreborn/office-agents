from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
import pytest
from zoneinfo import ZoneInfo

from app.agents.calendar_agent import (
    CalendarAgent,
    CalendarEventSchema,
    parse_vietnamese_datetime,
    CONFIDENCE_THRESHOLD,
)
from app.integrations.calendar import calendar_service, VN_TZ
from app.llm.ollama import LLMResponse


def test_parse_vietnamese_datetime_expressions():
    # Anchor reference time: Monday 2026-10-05 10:00:00 in Asia/Ho_Chi_Minh
    ref_time = datetime(2026, 10, 5, 10, 0, 0, tzinfo=VN_TZ)

    # 1. ISO 8601
    dt_iso = parse_vietnamese_datetime("2026-10-05T14:00:00", ref=ref_time)
    assert dt_iso is not None
    assert dt_iso.year == 2026 and dt_iso.month == 10 and dt_iso.day == 5
    assert dt_iso.hour == 14 and dt_iso.minute == 0
    assert str(dt_iso.tzinfo) == "Asia/Ho_Chi_Minh"

    # 2. "15h30 chiều mai" -> Tuesday 2026-10-06 at 15:30
    dt_tomorrow_afternoon = parse_vietnamese_datetime("15h30 chiều mai", ref=ref_time)
    assert dt_tomorrow_afternoon is not None
    assert dt_tomorrow_afternoon.day == 6
    assert dt_tomorrow_afternoon.hour == 15
    assert dt_tomorrow_afternoon.minute == 30

    # 3. "thứ 6 tuần sau lúc 9:00 sáng" -> Friday next week: 2026-10-16 at 09:00
    dt_next_friday = parse_vietnamese_datetime("thứ 6 tuần sau lúc 9:00 sáng", ref=ref_time)
    assert dt_next_friday is not None
    assert dt_next_friday.weekday() == 4  # Friday
    assert dt_next_friday.day == 16
    assert dt_next_friday.hour == 9 and dt_next_friday.minute == 0

    # 4. "ngày mai 8:00" -> 2026-10-06 at 08:00
    dt_tomorrow_morning = parse_vietnamese_datetime("ngày mai 8:00", ref=ref_time)
    assert dt_tomorrow_morning is not None
    assert dt_tomorrow_morning.day == 6
    assert dt_tomorrow_morning.hour == 8

    # 5. "20/10/2026 lúc 14:00" -> 2026-10-20 at 14:00
    dt_specific = parse_vietnamese_datetime("20/10/2026 lúc 14:00", ref=ref_time)
    assert dt_specific is not None
    assert dt_specific.year == 2026 and dt_specific.month == 10 and dt_specific.day == 20
    assert dt_specific.hour == 14

    # 6. "tối nay 20h" -> 2026-10-05 at 20:00
    dt_tonight = parse_vietnamese_datetime("tối nay 20h", ref=ref_time)
    assert dt_tonight is not None
    assert dt_tonight.day == 5 and dt_tonight.hour == 20

    # 7. Empty or invalid text -> None
    assert parse_vietnamese_datetime("", ref=ref_time) is None
    assert parse_vietnamese_datetime("   ", ref=ref_time) is None


def test_calendar_event_schema_validation():
    # Valid schema with aliases
    data = {
        "title": "Họp rà soát kiến trúc",
        "start_time": "2026-10-08T14:30:00",
        "end_time": "2026-10-08T15:30:00",
        "reminder_minutes": 45,
        "source_type": "email",
        "confidence": 0.95,
    }
    schema = CalendarEventSchema(**data)
    assert schema.title == "Họp rà soát kiến trúc"
    assert schema.start == "2026-10-08T14:30:00"
    assert schema.end == "2026-10-08T15:30:00"
    assert schema.reminder_minutes == 45
    assert schema.source == "email"
    assert schema.confidence == 0.95
    assert schema.timezone == "Asia/Ho_Chi_Minh"


def test_low_confidence_and_ambiguous_event_needs_confirmation():
    agent = CalendarAgent()
    # Mock LLM returning an ambiguous event without a specific datetime
    mock_llm_json = """```json
    [
      {
        "title": "Đi cà phê trao đổi dự án",
        "start": null,
        "confidence": 0.4,
        "description": "Thời gian chưa xác định cụ thể"
      }
    ]
    ```"""
    mock_resp = LLMResponse(raw=mock_llm_json, thought="Thời gian mơ hồ", content=mock_llm_json)

    with patch("app.agents.calendar_agent.chat_with_llm_safe", return_value=mock_resp):
        res = agent.extract_and_schedule("Tuần sau khi nào rảnh thì đi cafe nhé", auto_schedule=True)
        assert len(res.extracted_events) == 1
        assert len(res.scheduled_events) == 0  # Should NOT be scheduled!
        assert len(res.needs_confirmation) == 1
        assert res.needs_confirmation[0]["status"] == "needs_confirmation"
        assert "Thiếu thời gian cụ thể" in res.needs_confirmation[0]["reason"] or "Độ tin cậy thấp" in res.needs_confirmation[0]["reason"]


def test_dry_run_does_not_create_ics():
    agent = CalendarAgent()
    mock_llm_json = """```json
    [
      {
        "title": "Cuộc hẹn chạy thử Dry-Run",
        "start": "2026-10-15T10:00:00",
        "end": "2026-10-15T11:00:00",
        "reminder_minutes": 30,
        "confidence": 0.95
      }
    ]
    ```"""
    mock_resp = LLMResponse(raw=mock_llm_json, thought="Trích xuất lịch", content=mock_llm_json)

    with patch("app.agents.calendar_agent.chat_with_llm_safe", return_value=mock_resp):
        res = agent.extract_and_schedule("Họp thử 10h ngày 15/10/2026", dry_run=True)
        assert len(res.scheduled_events) == 1
        evt = res.scheduled_events[0]
        assert "[DRY-RUN]" in evt.status_message
        assert evt.ics_file == ""


def test_ics_generation_vtimezone_and_deduplication():
    # Test creating event and verify RFC-5545 format
    start = datetime(2026, 11, 20, 15, 30, 0, tzinfo=VN_TZ)
    end = datetime(2026, 11, 20, 16, 30, 0, tzinfo=VN_TZ)

    res1 = calendar_service.create_event(
        title="Họp nghiệm thu dự án Local AI",
        start_time=start,
        end_time=end,
        reminder_minutes=30,
        location="Phòng họp Trực tuyến",
        description="Đánh giá kết quả triển khai toàn diện",
    )
    assert res1["success"] is True
    ics_path = Path(res1["ics_path"])
    assert ics_path.exists()

    ics_content = ics_path.read_text(encoding="utf-8")
    assert "BEGIN:VTIMEZONE" in ics_content
    assert "TZID:Asia/Ho_Chi_Minh" in ics_content
    assert "DTSTART;TZID=Asia/Ho_Chi_Minh:20261120T153000" in ics_content
    assert "BEGIN:VALARM" in ics_content
    assert "TRIGGER:-PT30M" in ics_content

    # Test deduplication: creating the same event again
    res2 = calendar_service.create_event(
        title="Họp nghiệm thu dự án Local AI",
        start_time=start,
        end_time=end,
        reminder_minutes=30,
    )
    assert res2["is_duplicate"] is True
    assert res2["event"]["id"] == res1["event"]["id"]

    # Cleanup
    if ics_path.exists():
        ics_path.unlink()
