from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import CalendarDraftRecord, CalendarRecord, ProjectRecord
from app.integrations.google_calendar import google_calendar
from app.schemas.calendar import CalendarDraft, DraftCreate, DraftUpdate, EventCreate
from app.services import calendar_workflow as workflow
from app.services.projects import owned_query, project_scope

router = APIRouter(prefix="/api/calendar", tags=["Calendar drafts & Google Calendar"])


class ExtractScheduleRequest(BaseModel):
    text: Optional[str] = Field(None, max_length=2_000_000)
    resource_id: Optional[str] = Field(None, max_length=128)
    source_type: str = "prompt"
    source_reference: Optional[str] = None
    reminder_minutes: Optional[int] = None
    dry_run: bool = True


class ConflictRequest(BaseModel):
    draft: CalendarDraft
    exclude_event_id: Optional[str] = None


@router.post("/drafts")
def create_draft(req: DraftCreate, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    rows = workflow.add_drafts(db, project_id, [req.draft.model_dump(mode="json", by_alias=True)], req.resource_id)
    db.commit()
    return workflow.draft_payload(db, rows[0])


@router.get("/drafts")
def list_drafts(resource_id: Optional[str] = None, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    query = owned_query(db, CalendarDraftRecord, project_id)
    if resource_id:
        workflow.resource(db, project_id, resource_id)
        query = query.filter_by(resource_id=resource_id)
    return [workflow.draft_payload(db, row) for row in query.order_by(CalendarDraftRecord.created_at.desc()).all()]


@router.get("/drafts/{draft_id}")
def read_draft(draft_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    return workflow.draft_payload(db, workflow.get_draft(db, project_id, draft_id))


@router.patch("/drafts/{draft_id}")
def save_draft(draft_id: str, req: DraftUpdate, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    return workflow.update_draft(db, workflow.get_draft(db, project_id, draft_id), req.draft, req.expected_revision)


@router.post("/drafts/extract")
@router.post("/extract-and-schedule")
def extract_schedule(req: ExtractScheduleRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    # Compatibility path is draft-only even if a legacy client supplies dry_run=false.
    return workflow.extract_drafts(db, project_id, req.resource_id, req.text)


@router.post("/conflicts")
def check_conflicts(req: ConflictRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    exclude = None
    if req.exclude_event_id:
        exclude = owned_query(db, CalendarRecord, project_id).filter_by(id=req.exclude_event_id).first()
        if exclude is None:
            raise HTTPException(404, "Không tìm thấy lịch cần đối chiếu trong dự án.")
    try:
        return {"conflicts": workflow.conflicts(db, req.draft, exclude)}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


@router.post("/events")
def approve_draft(req: EventCreate, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    return workflow.approve(db, project_id, req.draft_id, req.expected_revision, req.allow_conflicts)


@router.post("/create")
def retired_create():
    raise HTTPException(410, "Tạo và duyệt nháp qua /api/calendar/drafts rồi /api/calendar/events; không tạo lịch trực tiếp từ AI.")


@router.post("/events/{event_id}/verify")
def verify_event(event_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    return workflow.verify_event(db, project_id, event_id)


@router.delete("/events/{event_id}", status_code=204)
def undo_event(event_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    workflow.delete_event(db, project_id, event_id)
    return Response(status_code=204)


@router.get("/events")
def list_events(project_id: Optional[str] = None, all_projects: bool = False,
                page: Optional[int] = Query(None, ge=1), page_size: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)):
    query = db.query(CalendarRecord).filter(CalendarRecord.status != "deleted")
    if all_projects:
        query = query.join(ProjectRecord, ProjectRecord.id == CalendarRecord.project_id).filter(ProjectRecord.deleted_at.is_(None))
    else:
        selected = project_scope(project_id, db)
        query = query.filter(CalendarRecord.project_id == selected)
    query = query.order_by(CalendarRecord.start_time)
    if page is None:
        return [workflow.event_payload(row) for row in query.all()]
    total = query.count()
    return {"items": [workflow.event_payload(row) for row in query.offset((page - 1) * page_size).limit(page_size).all()],
            "total": total, "page": page, "page_size": page_size, "total_pages": max(1, (total + page_size - 1) // page_size)}


@router.get("/upcoming")
def list_upcoming(hours: int = Query(48, ge=1, le=168), project_id: Optional[str] = None,
                  all_projects: bool = False, db: Session = Depends(get_db)):
    selected = None if all_projects else project_scope(project_id, db)
    return workflow.upcoming(db, selected, hours)


@router.get("/google/status")
def google_calendar_status():
    return google_calendar.get_status()


@router.get("/download-ics/{event_id}")
def download_ics(event_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    record = owned_query(db, CalendarRecord, project_id).filter_by(id=event_id).first()
    if record is None or record.status not in ("confirmed", "legacy"):
        raise HTTPException(404, "Không tìm thấy lịch đã xác nhận trong dự án.")
    return Response(content=workflow.ics_bytes(record), media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="event-{record.id}.ics"'})
