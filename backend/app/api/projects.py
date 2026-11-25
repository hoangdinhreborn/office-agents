import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import CalendarDraftRecord, DocumentRecord, EmailProcessedRecord, ProjectMemberRecord, ProjectRecord
from app.services.calendar_workflow import draft_payload
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.projects import require_project
from app.services.email_ingest import email_payload
from app.services.daily_overview import daily_overview
from app.services.project_deletion import delete_project_data

router = APIRouter(prefix="/api/projects", tags=["Projects"])


def serialize_project(db: Session, project: ProjectRecord) -> dict:
    members = db.query(ProjectMemberRecord).filter_by(project_id=project.id).order_by(ProjectMemberRecord.email).all()
    return {
        "id": project.id, "title": project.title, "icon": project.icon,
        "created_at": project.created_at.isoformat() + "Z",
        "members": [{"id": m.id, "email": m.email, "role": m.role} for m in members],
        "config": {
            "mail_label_id": project.mail_label_id, "mail_label_name": project.mail_label_name,
            "mail_sync_interval_minutes": project.mail_sync_interval_minutes,
            "default_reminder_minutes": project.default_reminder_minutes,
            "collect_rl_feedback": project.collect_rl_feedback,
        },
    }


def write_project(db: Session, project: ProjectRecord, values: ProjectCreate | ProjectUpdate) -> dict:
    if project.id != "legacy" and values.config is not None and not values.config.mail_label_id:
        raise HTTPException(422, "Dự án cần một nhãn Gmail liên kết.")
    if values.title is not None:
        project.title = values.title
    if values.icon is not None:
        project.icon = values.icon
    if values.config is not None:
        for key, value in values.config.model_dump().items():
            setattr(project, key, value)
        project.mail_label_key = project.mail_label_name.casefold() if project.mail_label_name else None
    try:
        db.add(project)
        db.flush()
        if values.members is not None:
            db.query(ProjectMemberRecord).filter_by(project_id=project.id).delete()
            db.add_all([ProjectMemberRecord(project_id=project.id, email=m.email, role=m.role) for m in values.members])
            roles = {m.email.lower(): m.role for m in values.members}
            for email in db.query(EmailProcessedRecord).filter_by(project_id=project.id).all():
                email.sender_role = roles.get((email.sender_email or "").lower(), "khách")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Nhãn Gmail đã thuộc một dự án khác.") from exc
    return serialize_project(db, project)


@router.get("")
def list_projects(q: str = Query("", max_length=80), sort: str = Query("date_desc", pattern="^(date|name)_(asc|desc)$"), db: Session = Depends(get_db)):
    projects = db.query(ProjectRecord).filter(ProjectRecord.deleted_at.is_(None)).all()
    projects = [p for p in projects if q.strip().casefold() in p.title.casefold()]
    projects.sort(key=lambda p: p.title.casefold() if sort.startswith("name") else (p.created_at, p.id), reverse=sort.endswith("desc"))
    return [serialize_project(db, p) for p in projects]


@router.post("", status_code=201)
def create_project(req: ProjectCreate, db: Session = Depends(get_db)):
    if not req.config.mail_label_id:
        raise HTTPException(422, "Dự án cần một nhãn Gmail liên kết.")
    return write_project(db, ProjectRecord(), req)


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    return serialize_project(db, require_project(db, project_id))


@router.patch("/{project_id}")
def update_project(project_id: str, req: ProjectUpdate, db: Session = Depends(get_db)):
    return write_project(db, require_project(db, project_id), req)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    delete_project_data(db, project_id)
    return Response(status_code=204)


@router.post("/{project_id}/restore")
def restore_project(project_id: str, db: Session = Depends(get_db)):
    raise HTTPException(410, "Dự án được xóa vĩnh viễn cùng dữ liệu; không hỗ trợ hoàn tác.")


@router.get("/{project_id}/resources")
def list_resources(project_id: str, include_pages: bool = False, db: Session = Depends(get_db)):
    require_project(db, project_id)
    documents = db.query(DocumentRecord).filter_by(project_id=project_id).all()
    emails = db.query(EmailProcessedRecord).filter_by(project_id=project_id).all()
    roles = {m.email: m.role for m in db.query(ProjectMemberRecord).filter_by(project_id=project_id).all()}
    drafts = {}
    for row in db.query(CalendarDraftRecord).filter_by(project_id=project_id).order_by(CalendarDraftRecord.created_at.desc()).all():
        if row.resource_id:
            drafts.setdefault(row.resource_id, []).append(draft_payload(db, row))
    return {
        "daily_overview": daily_overview(db, project_id),
        "documents": [{"id": d.id, "filename": d.filename, "total_pages": d.total_pages,
                       "summary": d.full_markdown or d.executive_summary or "", "file_size": d.file_size,
                       "has_file": bool(d.file_path), "pages": json.loads(d.pages_json or "[]") if include_pages else [],
                       "is_ocr": bool(d.is_ocr), "is_map_reduce": bool(d.is_map_reduce),
                       "processing_warning": d.processing_warning,
                       "schedule_drafts": drafts.get(d.id, []),
                       "solution_options": json.loads(d.solution_options_json or "[]"),
                       "constraint_history": json.loads(d.constraint_history_json or "[]"),
                       "solution_revision": d.solution_revision or 0,
                       "selected_solution_id": d.selected_solution_id,
                       "replied_at": d.replied_at.isoformat() + "Z" if d.replied_at else None,
                       "created_at": d.created_at.isoformat() + "Z"} for d in documents],
        "emails": [{**{key: value for key, value in email_payload(e, include_pages=include_pages).items() if key in (
                        "id", "subject", "sender_email", "sender_role", "summary", "folder", "urgency", "has_issue_to_solve", "has_calendar_event",
                        "attached_pdfs", "status", "processing_stage", "processing_error", "solution_options", "constraint_history", "solution_revision", "selected_solution_id", "replied_at")},
                    "schedule_drafts": drafts.get(e.id, []),
                    "sender_role": roles.get((e.sender_email or "").lower(), e.sender_role or "khách"),
                    "created_at": e.processed_at.isoformat() + "Z"} for e in emails],
    }
