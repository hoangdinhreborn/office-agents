"""Delete project-owned records and files; leave shared infrastructure intact."""
from datetime import datetime
from pathlib import Path
import shutil
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import resolve_path
from app.database.models import (
    CalendarDraftRecord, CalendarRecord, ChatMessageRecord, ChatSessionRecord,
    DocumentRecord, EmailProcessedRecord, ProjectMemberRecord, ProjectRecord,
    RLFeedbackRecord, SentMailRecord, SolutionRecord, TaskRecord,
)
from app.services.calendar_workflow import calendar_operation
from app.services.email_ingest import stored_email_pdfs
from app.services.email_sync_jobs import forget_job
from app.services.projects import owned_query


def project_directory(root: str, project_id: str) -> Path:
    base = resolve_path(root).resolve()
    path = (base / project_id).resolve()
    if path.parent != base or path.name != project_id:
        raise HTTPException(422, "Mã dự án không hợp lệ để dọn file.")
    return path


def purge_trash(trash: Path):
    try:
        if trash.exists():
            shutil.rmtree(trash)
    except OSError as exc:
        raise HTTPException(503, "Dữ liệu DB đã xóa nhưng chưa dọn hết file tạm. Bấm Xóa lại để tiếp tục dọn file.") from exc


@calendar_operation
def delete_project_data(db: Session, project_id: str):
    trash = project_directory("data/deleted_projects", project_id)
    project = db.get(ProjectRecord, project_id, populate_existing=True)
    if project is None:
        # A prior request may have committed before its file cleanup completed.
        purge_trash(trash)
        return
    events = owned_query(db, CalendarRecord, project_id).all()
    # Resolve only paths already owned by this project's records. Never accept
    # filesystem paths from the client or delete another project's shared file.
    paths = [project_directory(root, project_id) for root in ("data/documents", "data/email_attachments", "data/reports")]
    file_paths = [d.file_path for d in owned_query(db, DocumentRecord, project_id).all() if d.file_path]
    for mail in owned_query(db, EmailProcessedRecord, project_id).all():
        file_paths.extend(pdf["file_path"] for pdf in stored_email_pdfs(mail) if pdf.get("file_path"))
    file_paths.extend(event.ics_path for event in events if event.ics_path)
    roots = [resolve_path(root).resolve() for root in ("data/documents", "data/email_attachments", "data/calendar")]
    for name in file_paths:
        path = Path(name).resolve()
        if not any(path.is_relative_to(root) and path != root for root in roots):
            raise HTTPException(409, "Có file nằm ngoài thư mục dữ liệu; chưa xóa dự án để tránh xóa nhầm.")
        if not any(path.is_relative_to(folder) for folder in paths):
            paths.append(path)
    # Soft-lock the project during deletion so background ingestion cannot add
    # new work while files and database rows are being removed.
    project.deleted_at = datetime.utcnow()
    db.commit()
    forget_job(project_id)
    moved: list[tuple[Path, Path]] = []
    try:
        trash.mkdir(parents=True, exist_ok=True)
        for path in paths:
            if path.exists():
                destination = trash / str(uuid4())
                path.rename(destination)
                moved.append((path, destination))
        session_ids = owned_query(db, ChatSessionRecord, project_id).with_entities(ChatSessionRecord.id)
        db.query(ChatMessageRecord).filter(ChatMessageRecord.session_id.in_(session_ids)).delete(synchronize_session=False)
        # Calendar events and drafts reference each other, so clear both links
        # before deleting either side. Existing SQLite databases keep their FKs.
        owned_query(db, CalendarDraftRecord, project_id).update({"approved_event_id": None}, synchronize_session=False)
        owned_query(db, CalendarRecord, project_id).update({"draft_id": None}, synchronize_session=False)
        for model in (CalendarRecord, CalendarDraftRecord, ChatSessionRecord, SentMailRecord, DocumentRecord,
                      EmailProcessedRecord, SolutionRecord, TaskRecord, RLFeedbackRecord, ProjectMemberRecord):
            owned_query(db, model, project_id).delete(synchronize_session=False)
        db.delete(project)
        db.commit()
    except Exception:
        db.rollback()
        for original, staged in reversed(moved):
            if staged.exists():
                original.parent.mkdir(parents=True, exist_ok=True)
                staged.rename(original)
        project = db.get(ProjectRecord, project_id, populate_existing=True)
        if project:
            project.deleted_at = None
            db.commit()
        raise
    # If filesystem cleanup fails, keep the staged files for a retry of DELETE;
    # never report successful deletion while bytes are still on disk.
    purge_trash(trash)
