from datetime import date as Date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
Repeat = Literal["Does not repeat", "Daily", "Weekly on Wednesday", "Monthly on the fourth Wednesday",
                 "Monthly on the last Wednesday", "Annually on November 25", "Every weekday (Monday to Friday)", "Custom..."]


class CustomRepeat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    interval: int = Field(1, ge=1, le=999)
    unit: Literal["ngày", "tuần", "tháng", "năm"] = "tuần"
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    end_type: Literal["never", "on_date", "after_count"] = "never"
    end_date: Date | None = None
    end_count: int = Field(1, ge=1, le=10000)

    @field_validator("weekdays")
    @classmethod
    def valid_weekdays(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value) or len(set(value)) != len(value):
            raise ValueError("Thứ lặp phải nằm trong 0–6 và không trùng nhau.")
        return sorted(value)

    @field_validator("end_date", mode="before")
    @classmethod
    def blank_date(cls, value):
        return None if value == "" else value


class CalendarDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, populate_by_name=True)
    title: str = Field("", max_length=255)
    day: Date | None = Field(None, alias="date")
    start_time: str = Field("", pattern=r"^(?:[0-2][0-9]:[0-5][0-9])?$")
    end_time: str = Field("", pattern=r"^(?:[0-2][0-9]:[0-5][0-9])?$")
    all_day: bool = False
    repeat: Repeat = "Does not repeat"
    custom_repeat: CustomRepeat = Field(default_factory=CustomRepeat)
    has_deadline: bool = False
    deadline_date: Date | None = None
    deadline_at: datetime | None = None
    description: str = Field("", max_length=20000)
    needs_confirmation: bool = False
    confidence: float | None = Field(None, ge=0, le=1)

    @field_validator("day", "deadline_date", mode="before")
    @classmethod
    def blank_date(cls, value):
        return None if value == "" else value

    @field_validator("deadline_at")
    @classmethod
    def aware_deadline(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Hạn chót có giờ phải kèm múi giờ.")
        return value.astimezone(VN_TZ) if value is not None else None

    @field_validator("start_time", "end_time")
    @classmethod
    def valid_clock(cls, value: str) -> str:
        if value:
            time.fromisoformat(value)
        return value

    def time_range(self) -> tuple[datetime, datetime]:
        if not self.title or self.day is None:
            raise ValueError("Cần nhập tiêu đề và ngày diễn ra trước khi duyệt.")
        if self.has_deadline and self.deadline_date is None:
            raise ValueError("Cần chọn ngày hạn chót hoặc bỏ tùy chọn hạn chót.")
        if self.all_day:
            start = datetime.combine(self.day, time.min, VN_TZ)
            return start, start + timedelta(days=1)
        if not self.start_time or not self.end_time:
            raise ValueError("Cần bổ sung đầy đủ giờ bắt đầu và kết thúc trước khi duyệt.")
        start = datetime.combine(self.day, time.fromisoformat(self.start_time), VN_TZ)
        end = datetime.combine(self.day, time.fromisoformat(self.end_time), VN_TZ)
        if end <= start:
            raise ValueError("Giờ kết thúc phải lớn hơn giờ bắt đầu.")
        return start, end

    def recurrence(self) -> list[str]:
        if self.repeat == "Does not repeat":
            return []
        if self.day is None:
            raise ValueError("Cần chọn ngày bắt đầu trước khi cấu hình lặp.")
        weekday = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")[self.day.weekday()]
        rules = {
            "Daily": "FREQ=DAILY",
            "Weekly on Wednesday": f"FREQ=WEEKLY;BYDAY={weekday}",
            "Monthly on the fourth Wednesday": f"FREQ=MONTHLY;BYDAY={(self.day.day - 1) // 7 + 1}{weekday}",
            "Monthly on the last Wednesday": f"FREQ=MONTHLY;BYDAY=-1{weekday}",
            "Annually on November 25": f"FREQ=YEARLY;BYMONTH={self.day.month};BYMONTHDAY={self.day.day}",
            "Every weekday (Monday to Friday)": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        }
        if self.repeat != "Custom...":
            return ["RRULE:" + rules[self.repeat]]
        custom = self.custom_repeat
        freq = {"ngày": "DAILY", "tuần": "WEEKLY", "tháng": "MONTHLY", "năm": "YEARLY"}[custom.unit]
        rule = f"FREQ={freq};INTERVAL={custom.interval}"
        if custom.unit == "tuần":
            days = [("SU", "MO", "TU", "WE", "TH", "FR", "SA")[day] for day in custom.weekdays] or [weekday]
            rule += ";BYDAY=" + ",".join(days)
        if custom.end_type == "after_count":
            rule += f";COUNT={custom.end_count}"
        elif custom.end_type == "on_date":
            if custom.end_date is None or custom.end_date < self.day:
                raise ValueError("Ngày kết thúc lặp phải bằng hoặc sau ngày bắt đầu.")
            until = custom.end_date.strftime("%Y%m%d") if self.all_day else datetime.combine(
                custom.end_date, time(23, 59, 59), VN_TZ).astimezone(ZoneInfo("UTC")).strftime("%Y%m%dT%H%M%SZ")
            rule += ";UNTIL=" + until
        return ["RRULE:" + rule]


class DraftCreate(BaseModel):
    resource_id: str | None = Field(None, max_length=128)
    draft: CalendarDraft


class DraftUpdate(BaseModel):
    draft: CalendarDraft
    expected_revision: int = Field(ge=1)


class EventCreate(BaseModel):
    draft_id: str = Field(min_length=1, max_length=128)
    expected_revision: int = Field(ge=1)
    allow_conflicts: bool = False
