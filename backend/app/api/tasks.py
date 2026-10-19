from datetime import datetime, timedelta
import logging
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import TaskRecord

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["Tasks Management"])


class TaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, description="Tiêu đề công việc")
    due_date: Optional[str] = Field(None, description="Thời hạn (ISO format YYYY-MM-DDTHH:MM:SS)")
    priority: Optional[str] = Field("medium", description="Mức độ ưu tiên: low, medium, high")
    source_type: Optional[str] = Field("prompt", description="Nguồn: email, pdf, prompt")
    source_reference: Optional[str] = Field(None, description="Định danh nguồn gốc (email id, pdf filename)")


class TaskUpdateRequest(BaseModel):
    title: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = Field(None, description="Trạng thái: pending, completed")


def _format_task(task: TaskRecord) -> Dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "priority": task.priority or "medium",
        "status": task.status or "pending",
        "source_type": task.source_type or "prompt",
        "source_reference": task.source_reference,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


@router.get("")
def list_tasks(
    status: Optional[str] = Query(None, description="Lọc trạng thái: pending, completed"),
    source_type: Optional[str] = Query(None, description="Lọc theo nguồn: email, pdf, prompt"),
    group: Optional[str] = Query(None, description="Nhóm thời gian: today, this_week"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns list of tasks with flexible filtering and grouping.
    """
    query = db.query(TaskRecord)

    if status and status != "all":
        query = query.filter(TaskRecord.status == status.lower().strip())

    if source_type and source_type != "all":
        query = query.filter(TaskRecord.source_type == source_type.lower().strip())

    now = datetime.utcnow()
    if group == "today":
        start_of_day = datetime(now.year, now.month, now.day)
        end_of_day = start_of_day + timedelta(days=1)
        query = query.filter(
            (TaskRecord.due_date >= start_of_day) & (TaskRecord.due_date < end_of_day)
        )
    elif group == "this_week":
        start_of_week = datetime(now.year, now.month, now.day) - timedelta(days=now.weekday())
        end_of_week = start_of_week + timedelta(days=7)
        query = query.filter(
            (TaskRecord.due_date >= start_of_week) & (TaskRecord.due_date < end_of_week)
        )

    tasks = query.order_by(TaskRecord.created_at.desc()).all()

    # Calculate summary counts
    total_count = db.query(func.count(TaskRecord.id)).scalar() or 0
    pending_count = db.query(func.count(TaskRecord.id)).filter(TaskRecord.status == "pending").scalar() or 0
    completed_count = db.query(func.count(TaskRecord.id)).filter(TaskRecord.status == "completed").scalar() or 0

    return {
        "items": [_format_task(t) for t in tasks],
        "stats": {
            "total": total_count,
            "pending": pending_count,
            "completed": completed_count,
        },
    }


@router.post("")
def create_task(req: TaskCreateRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Creates a new task extracted from prompt, email, or PDF.
    """
    parsed_due = None
    if req.due_date:
        try:
            parsed_due = datetime.fromisoformat(req.due_date.replace("Z", "+00:00"))
            if parsed_due.tzinfo is not None:
                parsed_due = parsed_due.replace(tzinfo=None)
        except Exception:
            try:
                parsed_due = datetime.strptime(req.due_date[:19], "%Y-%m-%dT%H:%M:%S")
            except Exception:
                pass

    rec = TaskRecord(
        id=str(uuid.uuid4()),
        title=req.title.strip(),
        due_date=parsed_due,
        priority=req.priority.lower().strip() if req.priority else "medium",
        status="pending",
        source_type=req.source_type.lower().strip() if req.source_type else "prompt",
        source_reference=req.source_reference,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return _format_task(rec)


@router.patch("/{task_id}")
def update_task(task_id: str, req: TaskUpdateRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Updates status, title, due_date, or priority of a task.
    """
    rec = db.query(TaskRecord).filter(TaskRecord.id == task_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Task không tồn tại")

    if req.title is not None:
        rec.title = req.title.strip()
    if req.status is not None:
        rec.status = req.status.lower().strip()
    if req.priority is not None:
        rec.priority = req.priority.lower().strip()
    if req.due_date is not None:
        try:
            parsed_due = datetime.fromisoformat(req.due_date.replace("Z", "+00:00"))
            rec.due_date = parsed_due.replace(tzinfo=None) if parsed_due.tzinfo else parsed_due
        except Exception:
            pass

    db.commit()
    db.refresh(rec)
    return _format_task(rec)


@router.delete("/{task_id}")
def delete_task(task_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Deletes a task by id.
    """
    rec = db.query(TaskRecord).filter(TaskRecord.id == task_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Task không tồn tại")

    db.delete(rec)
    db.commit()
    return {"success": True, "message": "Đã xóa công việc thành công", "id": task_id}
