from datetime import datetime, timedelta
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.calendar_agent import calendar_agent
from app.config import settings
from app.database.database import get_db
from app.database.models import CalendarRecord
from app.integrations.calendar import calendar_service
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/api/calendar", tags=["Calendar & Google Workspace Reminders"])


class ExtractScheduleRequest(BaseModel):
    text: str = Field(..., description="Văn bản, nội dung email hoặc prompt cần trích xuất lịch")
    source_type: str = Field("prompt", description="Nguồn dữ liệu: 'prompt', 'email', hoặc 'document'")
    source_reference: Optional[str] = Field(None, description="Tên file hoặc tiêu đề email nguồn")
    reminder_minutes: Optional[int] = Field(None, description="Thời gian nhắc trước (phút). Mặc định 30 phút")
    dry_run: bool = Field(False, description="Chế độ chạy thử: chỉ trích xuất và hiển thị xem trước, không tạo file .ics")


class ManualEventCreateRequest(BaseModel):
    title: str
    start_time: str
    end_time: Optional[str] = None
    reminder_minutes: Optional[int] = 30
    location: Optional[str] = ""
    description: Optional[str] = ""
    attendees: Optional[List[str]] = []
    source_type: Optional[str] = "prompt"


@router.post("/extract-and-schedule")
def extract_and_schedule_endpoint(
    req: ExtractScheduleRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Extracts events from text using DeepSeek-R1 reasoning and automatically schedules
    them to Calendar with advance reminders.
    Supports dry-run and sends ambiguous events to needs_confirmation.
    """
    rem = req.reminder_minutes if req.reminder_minutes is not None else settings.calendar_default_reminder_minutes
    result = calendar_agent.extract_and_schedule(
        input_text=req.text,
        source_type=req.source_type,
        source_reference=req.source_reference,
        default_reminder_minutes=rem,
        auto_schedule=True,
        dry_run=req.dry_run,
    )

    # Persist scheduled events to DB only if not dry_run
    if not req.dry_run:
        for se in result.scheduled_events:
            evt_obj = calendar_service.get_event(se.event_id)
            if evt_obj:
                rec = CalendarRecord(
                    id=evt_obj.id,
                    title=evt_obj.title,
                    start_time=evt_obj.start_time,
                    end_time=evt_obj.end_time,
                    reminder_minutes=evt_obj.reminder_minutes,
                    location=evt_obj.location,
                    description=evt_obj.description,
                    source_type=evt_obj.source_type,
                    source_reference=evt_obj.source_reference,
                    ics_path=se.ics_file,
                    synced_desktop=se.cloud_synced,
                )
                db.merge(rec)
        db.commit()

    return {
        "source_type": result.source_type,
        "extracted_events": result.extracted_events,
        "scheduled_events": [s.__dict__ for s in result.scheduled_events],
        "needs_confirmation": result.needs_confirmation,
        "dry_run": req.dry_run,
        "thinking_process": result.thinking_process,
    }


@router.post("/create")
@router.post("/events")
def create_manual_event_endpoint(
    req: ManualEventCreateRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Manually creates a calendar event with reminder and synchronizes to Google Calendar.
    """
    res = calendar_service.create_event(
        title=req.title,
        start_time=req.start_time,
        end_time=req.end_time,
        description=req.description or "",
        location=req.location or "",
        attendees=req.attendees,
        reminder_minutes=req.reminder_minutes,
        source_type=req.source_type or "prompt",
    )

    evt = res["event"]
    cloud_synced = res.get("cloud_synced", False)
    rec = CalendarRecord(
        id=evt["id"],
        title=evt["title"],
        start_time=calendar_service.get_event(evt["id"]).start_time,
        end_time=calendar_service.get_event(evt["id"]).end_time,
        reminder_minutes=evt["reminder_minutes"],
        location=evt["location"],
        description=evt["description"],
        source_type=evt["source_type"],
        ics_path=res["ics_path"],
        synced_desktop=cloud_synced,
    )
    db.add(rec)
    db.commit()

    return res


@router.get("/google/status")
def google_calendar_status() -> Dict[str, Any]:
    """
    Returns configuration and authentication status of Google Calendar.
    """
    from app.integrations.google_calendar import google_calendar
    return google_calendar.get_status()


@router.get("/upcoming")
def list_upcoming_events(
    hours: int = Query(48, ge=1, le=168, description="Số giờ tới để quét sự kiện sắp diễn ra"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns upcoming events within the next specified hours for notifications and alert badges.
    """
    now = datetime.utcnow()
    limit_time = now + timedelta(hours=hours)
    records = db.query(CalendarRecord).filter(
        CalendarRecord.start_time >= now - timedelta(minutes=30),
        CalendarRecord.start_time <= limit_time,
    ).order_by(CalendarRecord.start_time.asc()).limit(20).all()

    items = []
    for r in records:
        mins_until = int((r.start_time - now).total_seconds() / 60)
        items.append({
            "id": r.id,
            "title": r.title,
            "start_time": r.start_time.isoformat() if r.start_time else None,
            "end_time": r.end_time.isoformat() if r.end_time else None,
            "reminder_minutes": r.reminder_minutes,
            "location": r.location,
            "description": r.description,
            "minutes_until": mins_until,
            "is_imminent": 0 <= mins_until <= (r.reminder_minutes or 30),
        })

    return {
        "upcoming_count": len(items),
        "items": items,
        "imminent_count": sum(1 for it in items if it["is_imminent"]),
    }


@router.get("/events")
def list_events_endpoint(
    page: Optional[int] = Query(None, ge=1, description="Số trang (bắt đầu từ 1, để trống = trả về toàn bộ list)"),
    page_size: int = Query(10, ge=1, le=100, description="Số lượng sự kiện mỗi trang"),
    db: Session = Depends(get_db),
) -> Any:
    """
    Lists scheduled calendar events with optional pagination.
    """
    query = db.query(CalendarRecord).order_by(CalendarRecord.start_time.asc())
    total = query.count()

    if page is not None:
        offset = (page - 1) * page_size
        records = query.offset(offset).limit(page_size).all()
        items = [
            {
                "id": r.id,
                "title": r.title,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "reminder_minutes": r.reminder_minutes,
                "location": r.location,
                "description": r.description,
                "source_type": r.source_type,
                "ics_path": r.ics_path,
                "synced_desktop": r.synced_desktop,
            }
            for r in records
        ]
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    records = query.all()
    if records:
        return [
            {
                "id": r.id,
                "title": r.title,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "reminder_minutes": r.reminder_minutes,
                "location": r.location,
                "description": r.description,
                "source_type": r.source_type,
                "ics_path": r.ics_path,
                "synced_desktop": r.synced_desktop,
            }
            for r in records
        ]
    return calendar_service.list_events()


@router.get("/download-ics/{event_id}")
def download_ics_endpoint(event_id: str):
    """
    Downloads RFC-5545 .ics file for calendar import.
    """
    ics_file = Path("data/calendar") / f"{event_id}.ics"
    if not ics_file.exists():
        raise HTTPException(status_code=404, detail="File .ics không tồn tại")
    return FileResponse(
        path=str(ics_file),
        filename=f"event_{event_id[:8]}.ics",
        media_type="text/calendar",
    )
