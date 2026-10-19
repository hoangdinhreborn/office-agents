from dataclasses import dataclass, field
from datetime import datetime, timedelta
import hashlib
import logging
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional
import uuid
from zoneinfo import ZoneInfo

from dateutil import parser as dt_parser
from app.config import settings

logger = logging.getLogger(__name__)

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


@dataclass
class CalendarEvent:
    title: str
    start_time: datetime
    end_time: datetime
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""
    location: str = ""
    attendees: List[str] = field(default_factory=list)
    reminder_minutes: int = 30
    source_type: str = "prompt"  # "email", "document", "prompt"
    source_reference: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(tz=VN_TZ))
    stable_hash: str = ""

    def __post_init__(self):
        # Ensure timezone awareness
        if self.start_time.tzinfo is None:
            self.start_time = self.start_time.replace(tzinfo=VN_TZ)
        else:
            self.start_time = self.start_time.astimezone(VN_TZ)

        if self.end_time.tzinfo is None:
            self.end_time = self.end_time.replace(tzinfo=VN_TZ)
        else:
            self.end_time = self.end_time.astimezone(VN_TZ)

        if not self.stable_hash:
            start_str = self.start_time.strftime("%Y%m%d%H%M")
            self.stable_hash = hashlib.sha256(f"{self.title.strip().lower()}:{start_str}".encode()).hexdigest()[:16]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat(),
            "timezone": "Asia/Ho_Chi_Minh",
            "description": self.description,
            "location": self.location,
            "attendees": self.attendees,
            "reminder_minutes": self.reminder_minutes,
            "source_type": self.source_type,
            "source_reference": self.source_reference,
            "created_at": self.created_at.isoformat(),
            "stable_hash": self.stable_hash,
        }


class CalendarService:
    """
    Manages calendar event creation, reminder triggers, deduplication, and Google Calendar sync.
    All datetimes are strictly pinned to Asia/Ho_Chi_Minh.
    Generates standard RFC-5545 .ics files for local backup.
    """

    def __init__(self):
        self.events_store: Dict[str, CalendarEvent] = {}
        from app.config import resolve_path
        self.ics_dir = resolve_path("data/calendar")
        self.ics_dir.mkdir(parents=True, exist_ok=True)

    def find_duplicate(self, title: str, start_time: datetime) -> Optional[CalendarEvent]:
        """
        Finds an existing event with identical title and start time (using stable hash).
        """
        if start_time.tzinfo is None:
            st = start_time.replace(tzinfo=VN_TZ)
        else:
            st = start_time.astimezone(VN_TZ)
        start_str = st.strftime("%Y%m%d%H%M")
        target_hash = hashlib.sha256(f"{title.strip().lower()}:{start_str}".encode()).hexdigest()[:16]

        for event in self.events_store.values():
            if event.stable_hash == target_hash:
                return event
        return None

    def generate_ics(self, event: CalendarEvent) -> str:
        """
        Generates standard RFC-5545 iCalendar content with VTIMEZONE and VALARM.
        Compatible with Google Calendar and standard iCalendar (RFC-5545) clients.
        """
        start_local = event.start_time.strftime("%Y%m%dT%H%M%S")
        end_local = event.end_time.strftime("%Y%m%dT%H%M%S")
        created_utc = event.created_at.astimezone(ZoneInfo("UTC")).strftime("%Y%m%dT%H%M%SZ")

        ics_lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Local AI Assistant//Calendar Agent//VI",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VTIMEZONE",
            "TZID:Asia/Ho_Chi_Minh",
            "BEGIN:STANDARD",
            "DTSTART:19700101T000000",
            "TZOFFSETFROM:+0700",
            "TZOFFSETTO:+0700",
            "TZNAME:ICT",
            "END:STANDARD",
            "END:VTIMEZONE",
            "BEGIN:VEVENT",
            f"UID:{event.id}@local-ai-assistant",
            f"DTSTAMP:{created_utc}",
            f"DTSTART;TZID=Asia/Ho_Chi_Minh:{start_local}",
            f"DTEND;TZID=Asia/Ho_Chi_Minh:{end_local}",
            f"SUMMARY:{event.title}",
            f"DESCRIPTION:{event.description.replace(chr(10), '\\n')}",
            f"LOCATION:{event.location}",
            "STATUS:CONFIRMED",
            # VALARM: Advance reminder
            "BEGIN:VALARM",
            f"TRIGGER:-PT{event.reminder_minutes}M",
            "ACTION:DISPLAY",
            f"DESCRIPTION:Nhắc hẹn: {event.title} (trước {event.reminder_minutes} phút)",
            "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
        return "\r\n".join(ics_lines)

    def create_event(
        self,
        title: str,
        start_time: Any,
        end_time: Optional[Any] = None,
        description: str = "",
        location: str = "",
        attendees: Optional[List[str]] = None,
        reminder_minutes: Optional[int] = None,
        source_type: str = "prompt",
        source_reference: Optional[str] = None,
        sync_to_cloud: bool = True,
        dry_run: bool = False,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Creates a calendar event with reminder, stores it locally, generates an .ics file,
        and synchronizes with Google Calendar if configured and authenticated.
        Deduplicates against existing events.
        If dry_run=True, previews without writing file or calling cloud APIs.
        """
        # Parse start datetime
        if isinstance(start_time, str):
            dt_start = dt_parser.parse(start_time)
        elif isinstance(start_time, datetime):
            dt_start = start_time
        else:
            dt_start = datetime.now(tz=VN_TZ) + timedelta(hours=1)

        if dt_start.tzinfo is None:
            dt_start = dt_start.replace(tzinfo=VN_TZ)
        else:
            dt_start = dt_start.astimezone(VN_TZ)

        # Parse end datetime (default 1 hour after start)
        if end_time:
            if isinstance(end_time, str):
                dt_end = dt_parser.parse(end_time)
            elif isinstance(end_time, datetime):
                dt_end = end_time
            else:
                dt_end = dt_start + timedelta(hours=1)
        else:
            dt_end = dt_start + timedelta(hours=1)

        if dt_end.tzinfo is None:
            dt_end = dt_end.replace(tzinfo=VN_TZ)
        else:
            dt_end = dt_end.astimezone(VN_TZ)

        rem_mins = reminder_minutes if reminder_minutes is not None else settings.calendar_default_reminder_minutes

        # Check deduplication
        existing = self.find_duplicate(title or "Cuộc hẹn mới", dt_start)
        if existing:
            ics_path = str(self.ics_dir / f"{existing.id}.ics")
            return {
                "success": True,
                "event": existing.to_dict(),
                "ics_path": ics_path,
                "cloud_synced": False,
                "is_duplicate": True,
                "message": f"Sự kiện '{existing.title}' vào lúc {existing.start_time.strftime('%H:%M %d/%m/%Y')} đã tồn tại (chống trùng lặp).",
            }

        event = CalendarEvent(
            title=title or "Cuộc hẹn mới",
            start_time=dt_start,
            end_time=dt_end,
            description=description,
            location=location,
            attendees=attendees or [],
            reminder_minutes=rem_mins,
            source_type=source_type,
            source_reference=source_reference,
        )

        if dry_run:
            return {
                "success": True,
                "event": event.to_dict(),
                "ics_path": "",
                "cloud_synced": False,
                "is_duplicate": False,
                "dry_run": True,
                "message": f"[DRY-RUN] Sự kiện '{event.title}' dự kiến tạo lúc {event.start_time.strftime('%H:%M %d/%m/%Y')} (nhắc trước {event.reminder_minutes}p).",
            }

        # Store in memory/registry
        self.events_store[event.id] = event

        # Generate .ics file with VTIMEZONE & VALARM
        ics_content = self.generate_ics(event)
        ics_path = self.ics_dir / f"{event.id}.ics"
        ics_path.write_text(ics_content, encoding="utf-8")

        cloud_synced = False
        sync_message = ""
        cloud_event_id = None
        cloud_link = None

        # Google Calendar API Cloud Sync
        if settings.calendar_provider == "google" and sync_to_cloud:
            try:
                from app.integrations.google_calendar import google_calendar
                if google_calendar.is_authenticated():
                    g_res = google_calendar.create_event(
                        title=event.title,
                        start_time=event.start_time,
                        end_time=event.end_time,
                        description=event.description,
                        location=event.location,
                        reminder_minutes=event.reminder_minutes,
                        stable_hash=event.stable_hash,
                    )
                    cloud_event_id = g_res.get("event_id")
                    cloud_link = g_res.get("link")
                    cloud_synced = True
                    sync_message = f"Đã đồng bộ Google Calendar thành công ({cloud_event_id})."
            except Exception as e:
                logger.warning(f"Không thể đồng bộ Google Calendar: {e}")

        if not sync_message:
            sync_message = f"Đã tạo file .ics chuẩn RFC-5545 (Asia/Ho_Chi_Minh) kèm nhắc hẹn trước {event.reminder_minutes} phút."

        return {
            "success": True,
            "event": event.to_dict(),
            "ics_path": str(ics_path),
            "cloud_synced": cloud_synced,
            "cloud_event_id": cloud_event_id,
            "cloud_link": cloud_link,
            "is_duplicate": False,
            "message": sync_message.strip(),
        }

    def list_events(self) -> List[Dict[str, Any]]:
        return [e.to_dict() for e in sorted(self.events_store.values(), key=lambda x: x.start_time)]

    def get_event(self, event_id: str) -> Optional[CalendarEvent]:
        return self.events_store.get(event_id)


calendar_service = CalendarService()
