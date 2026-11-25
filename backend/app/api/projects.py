from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import DocumentRecord, EmailProcessedRecord, ProjectMemberRecord, ProjectRecord
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.projects import require_project

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
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Nhãn Gmail đã thuộc một dự án khác (kể cả dự án đang xóa để có thể hoàn tác).") from exc
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
    project = require_project(db, project_id)
    project.deleted_at = datetime.utcnow()
    db.commit()
    return Response(status_code=204)


@router.post("/{project_id}/restore")
def restore_project(project_id: str, db: Session = Depends(get_db)):
    project = require_project(db, project_id, include_deleted=True)
    project.deleted_at = None
    db.commit()
    return serialize_project(db, project)


@router.get("/{project_id}/resources")
def list_resources(project_id: str, db: Session = Depends(get_db)):
    require_project(db, project_id)
    documents = db.query(DocumentRecord).filter_by(project_id=project_id).all()
    emails = db.query(EmailProcessedRecord).filter_by(project_id=project_id).all()
    roles = {m.email: m.role for m in db.query(ProjectMemberRecord).filter_by(project_id=project_id).all()}
    return {
        "documents": [{"id": d.id, "filename": d.filename, "total_pages": d.total_pages,
                       "summary": d.full_markdown or d.executive_summary or "", "file_size": d.file_size,
                       "has_file": bool(d.file_path), "created_at": d.created_at.isoformat() + "Z"} for d in documents],
        "emails": [{"id": e.id, "subject": e.subject, "sender_email": e.sender_email,
                    "sender_role": roles.get((e.sender_email or "").lower(), "khách"),
                    "summary": e.summary or e.full_analysis or "", "folder": e.folder,
                    "created_at": e.processed_at.isoformat() + "Z"} for e in emails],
    }
