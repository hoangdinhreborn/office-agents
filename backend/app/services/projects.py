from fastapi import Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import ProjectRecord


def require_project(db: Session, project_id: str, *, include_deleted: bool = False) -> ProjectRecord:
    project = db.get(ProjectRecord, project_id, populate_existing=True)
    if project is None or (project.deleted_at is not None and not include_deleted):
        raise HTTPException(404, "Không tìm thấy dự án.")
    return project


def project_scope(project_id: str | None = Query(None), db: Session = Depends(get_db)) -> str:
    # Old API calls address only legacy data; omission never means all projects.
    if project_id is None:
        project = db.get(ProjectRecord, "legacy")
        if project is None:
            db.add(ProjectRecord(id="legacy", title="Dữ liệu cũ", icon="folder"))
            db.commit()
        project_id = "legacy"
    require_project(db, project_id)
    return project_id


def owned_query(db: Session, model, project_id: str):
    ownership = model.project_id == project_id
    if project_id == "legacy":
        ownership = or_(ownership, model.project_id.is_(None))
    return db.query(model).filter(ownership)
