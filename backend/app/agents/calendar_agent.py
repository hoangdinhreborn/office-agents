from dataclasses import dataclass
from datetime import datetime, timedelta, time
import logging
import re
from typing import Any, Dict, List, Literal, Optional
from zoneinfo import ZoneInfo
import dateparser
from pydantic import BaseModel, Field, model_validator

from app.integrations.calendar import calendar_service, VN_TZ
from app.llm.ollama import chat_with_llm_safe, extract_json_from_response, LLMResponse
from app.llm.prompts import SYSTEM_CALENDAR_PROMPT

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.7


class CalendarEventSchema(BaseModel):
    title: str = Field(default="Cuộc hẹn mới", description="Tiêu đề cuộc họp hoặc sự kiện")
    start: Optional[str] = Field(default=None, description="Thời gian bắt đầu (ISO 8601 hoặc chuỗi biểu đạt)")
    end: Optional[str] = Field(default=None, description="Thời gian kết thúc (ISO 8601 hoặc chuỗi biểu đạt)")
    timezone: str = Field(default="Asia/Ho_Chi_Minh")
    location: Optional[str] = Field(default="")
    description: Optional[str] = Field(default="")
    reminder_minutes: int = Field(default=30)
    source: Literal["email", "pdf", "prompt"] = Field(default="prompt")
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("location") is None:
                data["location"] = ""
            if data.get("description") is None:
                data["description"] = ""
            # Accept start_time as start
            if "start" not in data and "start_time" in data:
                data["start"] = data["start_time"]
            # Accept end_time as end
            if "end" not in data and "end_time" in data:
                data["end"] = data["end_time"]
            # Accept source_type as source
            if "source" not in data and "source_type" in data:
                data["source"] = data["source_type"]
            if "source" in data and isinstance(data["source"], str):
                s = data["source"].strip().lower()
                data["source"] = s if s in ["email", "pdf", "prompt"] else "prompt"
        return data


def parse_vietnamese_datetime(text: str, ref: Optional[datetime] = None) -> Optional[datetime]:
    """
    Parses Vietnamese datetime expressions (relative and absolute) and anchors
    them strictly to Asia/Ho_Chi_Minh timezone.
    Supports: "15h30 chiều mai", "thứ 6 tuần sau 9h", "ngày mai 8:00", "20/10 lúc 14:00", ISO 8601.
    """
    if not text or not str(text).strip():
        return None

    ref = ref or datetime.now(tz=VN_TZ)
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=VN_TZ)
    else:
        ref = ref.astimezone(VN_TZ)

    s = str(text).strip()

    # 1. Direct ISO 8601 check
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=VN_TZ)
        return dt.astimezone(VN_TZ)
    except Exception:
        pass

    s_lower = s.lower()

    # Extract time component: 15h30, 15:30, 9h sáng, 3h chiều, 14:00, 20h
    target_time: Optional[time] = None
    time_match = re.search(r"(\d{1,2})(?:h|:)(\d{1,2})?(?:\s*(sáng|chiều|tối))?", s_lower)
    if time_match:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2) or 0)
        period = time_match.group(3)
        if period == "chiều" and hour < 12:
            hour += 12
        elif period == "tối" and hour < 12:
            hour += 12
        elif period == "sáng" and hour == 12:
            hour = 0
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            target_time = time(hour=hour, minute=minute)

    # 2. Date extraction rules
    target_date = None

    # Case: hôm nay / chiều nay / tối nay / sáng nay
    if any(k in s_lower for k in ["hôm nay", "chiều nay", "tối nay", "sáng nay"]):
        target_date = ref.date()
        if not target_time:
            if "chiều nay" in s_lower:
                target_time = time(14, 0)
            elif "tối nay" in s_lower:
                target_time = time(20, 0)
            elif "sáng nay" in s_lower:
                target_time = time(9, 0)

    # Case: ngày mai / chiều mai / sáng mai / tối mai
    elif any(k in s_lower for k in ["ngày mai", "chiều mai", "sáng mai", "tối mai"]):
        target_date = ref.date() + timedelta(days=1)
        if not target_time:
            if "chiều mai" in s_lower:
                target_time = time(14, 0)
            elif "tối mai" in s_lower:
                target_time = time(20, 0)
            elif "sáng mai" in s_lower:
                target_time = time(9, 0)

    # Case: ngày kia
    elif "ngày kia" in s_lower:
        target_date = ref.date() + timedelta(days=2)

    # Case: thứ X tuần sau / thứ X tuần tới / thứ X này
    weekday_names = {
        "thứ hai": 0, "thứ 2": 0, "t2": 0,
        "thứ ba": 1, "thứ 3": 1, "t3": 1,
        "thứ tư": 2, "thứ 4": 2, "t4": 2,
        "thứ năm": 3, "thứ 5": 3, "t5": 3,
        "thứ sáu": 4, "thứ 6": 4, "t6": 4,
        "thứ bảy": 5, "thứ 7": 5, "t7": 5,
        "chủ nhật": 6, "cn": 6,
    }
    for w_name, w_idx in weekday_names.items():
        if w_name in s_lower:
            days_ahead = w_idx - ref.weekday()
            if "tuần sau" in s_lower or "tuần tới" in s_lower:
                days_ahead += 7
            elif days_ahead <= 0:
                days_ahead += 7
            target_date = ref.date() + timedelta(days=days_ahead)
            break

    # Case: dd/mm/yyyy or dd/mm
    date_match = re.search(r"(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?", s_lower)
    if date_match:
        try:
            d = int(date_match.group(1))
            m = int(date_match.group(2))
            y = int(date_match.group(3)) if date_match.group(3) else ref.year
            target_date = datetime(y, m, d).date()
        except ValueError:
            pass

    if target_date and target_time:
        return datetime.combine(target_date, target_time, tzinfo=VN_TZ)
    elif target_date:
        return datetime.combine(target_date, time(9, 0), tzinfo=VN_TZ)

    # 3. Fallback: dateparser with Vietnamese and English
    parsed = dateparser.parse(
        s,
        languages=["vi", "en"],
        settings={
            "TIMEZONE": "Asia/Ho_Chi_Minh",
            "RETURN_AS_TIMEZONE_AWARE": True,
            "RELATIVE_BASE": ref,
            "PREFER_DATES_FROM": "future",
        },
    )
    if parsed:
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=VN_TZ)
        return parsed.astimezone(VN_TZ)
    return None


@dataclass
class ScheduledEventResult:
    event_id: str
    title: str
    start_time: str
    end_time: str
    reminder_minutes: int
    ics_file: str
    status_message: str
    cloud_synced: bool = False


@dataclass
class CalendarExtractionResult:
    source_type: str
    extracted_events: List[Dict[str, Any]]
    scheduled_events: List[ScheduledEventResult]
    needs_confirmation: List[Dict[str, Any]]
    thinking_process: str


class CalendarAgent:
    """
    Agent responsible for extracting events and deadlines from prompts, emails,
    or documents and scheduling them to Calendar with advance reminders.
    Features:
    - Pydantic schema validation.
    - Strict Asia/Ho_Chi_Minh timezone awareness.
    - Low-confidence or ambiguous events sent to 'needs_confirmation'.
    - Dry-run mode for previewing events without writing files.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model

    def extract_and_schedule(
        self,
        input_text: str,
        source_type: str = "prompt",  # "prompt", "email", "document"
        source_reference: Optional[str] = None,
        default_reminder_minutes: int = 30,
        auto_schedule: bool = True,
        dry_run: bool = False,
    ) -> CalendarExtractionResult:
        now = datetime.now(tz=VN_TZ)
        current_time_str = now.strftime("%Y-%m-%d %H:%M:%S")
        day_of_week = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"][now.weekday()]

        prompt = (
            f"Thời điểm hiện tại của hệ thống: {day_of_week}, {current_time_str} (Múi giờ: Asia/Ho_Chi_Minh).\n"
            f"Nguồn dữ liệu: {source_type.upper()}.\n"
            f"Thời gian nhắc nhở mặc định (nếu không nói cụ thể): {default_reminder_minutes} phút.\n\n"
            f"Văn bản cần phân tích:\n"
            f"```text\n{input_text}\n```\n\n"
            f"Hãy trích xuất danh sách sự kiện cần lên lịch theo chuẩn JSON quy định. "
            f"Lưu ý quy đổi các mốc thời gian tương đối ('hôm nay', 'chiều nay', 'ngày mai', 'thứ Sáu tuần tới') "
            f"thành ngày giờ cụ thể chính xác theo thời điểm hiện tại. "
            f"Nếu sự kiện thiếu ngày hoặc giờ cụ thể, hãy đặt 'confidence' < 0.7 và 'start' là null."
        )

        response: LLMResponse = chat_with_llm_safe(
            message=prompt,
            system_prompt=SYSTEM_CALENDAR_PROMPT,
            model=self.model,
            timeout_secs=180.0,
        )

        raw_data = extract_json_from_response(response.content) or []
        if isinstance(raw_data, dict):
            raw_data = [raw_data]

        valid_events: List[CalendarEventSchema] = []
        needs_confirmation: List[Dict[str, Any]] = []
        scheduled_results: List[ScheduledEventResult] = []

        if isinstance(raw_data, list):
            for item in raw_data:
                try:
                    event_schema = CalendarEventSchema(**item)
                except Exception as exc:
                    logger.warning(f"Bỏ qua item do sai schema: {exc}")
                    continue

                valid_events.append(event_schema)

                # Check if event has valid datetime and high confidence
                dt_start = parse_vietnamese_datetime(event_schema.start, ref=now) if event_schema.start else None

                if not dt_start or event_schema.confidence < CONFIDENCE_THRESHOLD:
                    reason = "Thiếu thời gian cụ thể" if not dt_start else f"Độ tin cậy thấp ({event_schema.confidence:.2f} < {CONFIDENCE_THRESHOLD})"
                    needs_confirmation.append({
                        "event": event_schema.model_dump(),
                        "status": "needs_confirmation",
                        "reason": reason,
                    })
                    logger.info(f"Sự kiện '{event_schema.title}' chuyển sang trạng thái cần xác nhận: {reason}.")
                    continue

                # Parse end time (or default 1h)
                dt_end = parse_vietnamese_datetime(event_schema.end, ref=now) if event_schema.end else None
                if not dt_end:
                    dt_end = dt_start + timedelta(hours=1)

                rem_mins = event_schema.reminder_minutes or default_reminder_minutes

                # Process scheduling
                if auto_schedule:
                    try:
                        res = calendar_service.create_event(
                            title=event_schema.title,
                            start_time=dt_start,
                            end_time=dt_end,
                            description=event_schema.description,
                            location=event_schema.location,
                            reminder_minutes=rem_mins,
                            source_type=source_type,
                            source_reference=source_reference,
                            dry_run=dry_run,
                        )
                        evt = res["event"]
                        c_synced = res.get("cloud_synced", False)
                        scheduled_results.append(
                            ScheduledEventResult(
                                event_id=evt["id"],
                                title=evt["title"],
                                start_time=evt["start_time"],
                                end_time=evt["end_time"],
                                reminder_minutes=evt["reminder_minutes"],
                                cloud_synced=c_synced,
                                ics_file=res.get("ics_path", ""),
                                status_message=res.get("message", ""),
                            )
                        )
                    except Exception as exc:
                        logger.error(f"Lỗi khi lên lịch sự kiện '{event_schema.title}': {exc}")

        return CalendarExtractionResult(
            source_type=source_type,
            extracted_events=[e.model_dump() for e in valid_events],
            scheduled_events=scheduled_results,
            needs_confirmation=needs_confirmation,
            thinking_process=response.thought,
        )


calendar_agent = CalendarAgent()
