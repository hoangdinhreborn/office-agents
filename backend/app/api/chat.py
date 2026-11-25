from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional
import uuid
import time
from queue import Empty, Queue
from threading import Event, Thread
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse

from app.services.projects import owned_query, project_scope, require_project
from app.services.chat_runtime import run_project_chat
from app.services.calendar_workflow import add_drafts, draft_payload
from app.config import settings
from app.database.database import get_db, SessionLocal
from app.database.models import (
    CalendarDraftRecord,
    ChatMessageRecord,
    ChatSessionRecord,
    DocumentRecord,
    EmailProcessedRecord,
)
from app.llm.ollama import check_ollama_status
from app.services.llm_settings import LLMError, resolve_model
from app.schemas.chat import (
    ChatMessageItem,
    ChatRequest,
    ChatResponse,
    ChatSessionDetail,
    ChatSessionSummary,
    SessionCreateRequest,
    SessionUpdateRequest,
    SystemStatusResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat & Orchestrator"])


def _format_session_summary(session: ChatSessionRecord, message_count: int = 0) -> ChatSessionSummary:
    return ChatSessionSummary(
        id=session.id,
        project_id=session.project_id,
        title=session.title or "Cuộc trò chuyện mới",
        created_at=session.created_at.isoformat() if session.created_at else "",
        updated_at=session.updated_at.isoformat() if session.updated_at else "",
        message_count=message_count,
    )


def _format_message_item(msg: ChatMessageRecord, db: Session) -> ChatMessageItem:
    try:
        agents = json.loads(msg.agents_invoked_json) if msg.agents_invoked_json else []
    except Exception:
        agents = []
    try:
        metadata = json.loads(msg.metadata_json or "{}")
    except (ValueError, TypeError):
        metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}
    draft_ids = metadata.get("calendar_draft_ids", [])
    draft_ids = [item for item in draft_ids if isinstance(item, str)] if isinstance(draft_ids, list) else []
    source_names = metadata.get("source_names", [])
    source_names = [name for name in source_names if isinstance(name, str)] if isinstance(source_names, list) else []
    drafts = db.query(CalendarDraftRecord).filter(CalendarDraftRecord.id.in_(draft_ids), CalendarDraftRecord.session_id == msg.session_id).all() if draft_ids else []
    return ChatMessageItem(
        id=msg.id,
        session_id=msg.session_id,
        role=msg.role,
        content=msg.content,
        thinking_process=msg.thinking_process or "",
        provider_id=metadata.get("provider_id"), model_id=metadata.get("model_id"),
        fallback_used=bool(metadata.get("fallback_used")),
        processing_steps=metadata.get("processing_steps", []),
        duration_seconds=metadata.get("duration_seconds"),
        calendar_drafts=[draft_payload(db, item) for item in drafts],
        referenced_source_names=source_names,
        agents_invoked=agents,
        created_at=msg.created_at.isoformat() if msg.created_at else "",
    )


def _load_session_history(db: Session, session_id: str, limit: int = 12) -> List[Dict[str, str]]:
    records = (
        db.query(ChatMessageRecord)
        .filter(ChatMessageRecord.session_id == session_id)
        .order_by(ChatMessageRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    history = []
    for r in reversed(records):
        role_label = "user" if r.role == "user" else "assistant"
        history.append({"role": role_label, "content": r.content})
    return history


@router.get("/sessions", response_model=List[ChatSessionSummary])
def list_chat_sessions(project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> List[ChatSessionSummary]:
    """
    Returns list of saved chat sessions ordered by latest update.
    """
    sessions = (
        owned_query(db, ChatSessionRecord, project_id)
        .order_by(ChatSessionRecord.updated_at.desc())
        .all()
    )
    result = []
    for s in sessions:
        count = (
            db.query(func.count(ChatMessageRecord.id))
            .filter(ChatMessageRecord.session_id == s.id)
            .scalar()
            or 0
        )
        result.append(_format_session_summary(s, message_count=count))
    return result


@router.post("/sessions", response_model=ChatSessionSummary)
def create_chat_session(req: SessionCreateRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> ChatSessionSummary:
    """
    Creates a new empty chat session.
    """
    session = ChatSessionRecord(
        project_id=project_id,
        id=str(uuid.uuid4()),
        title=req.title.strip() if req.title else "Cuộc trò chuyện mới",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _format_session_summary(session, message_count=0)


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
def get_chat_session_detail(session_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> ChatSessionDetail:
    """
    Retrieves full message history of a specific chat session.
    """
    session = owned_query(db, ChatSessionRecord, project_id).filter(ChatSessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên trò chuyện")

    messages = (
        db.query(ChatMessageRecord)
        .filter(ChatMessageRecord.session_id == session_id)
        .order_by(ChatMessageRecord.created_at.asc())
        .all()
    )

    summary = _format_session_summary(session, message_count=len(messages))
    items = [_format_message_item(m, db) for m in messages]
    return ChatSessionDetail(session=summary, messages=items)


@router.patch("/sessions/{session_id}", response_model=ChatSessionSummary)
def update_chat_session(session_id: str, req: SessionUpdateRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> ChatSessionSummary:
    """
    Renames a chat session title.
    """
    session = owned_query(db, ChatSessionRecord, project_id).filter(ChatSessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên trò chuyện")

    session.title = req.title.strip()
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)

    count = (
        db.query(func.count(ChatMessageRecord.id))
        .filter(ChatMessageRecord.session_id == session.id)
        .scalar()
        or 0
    )
    return _format_session_summary(session, message_count=count)


@router.delete("/sessions/{session_id}")
def delete_chat_session(session_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Deletes a chat session along with all associated messages.
    """
    session = owned_query(db, ChatSessionRecord, project_id).filter(ChatSessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên trò chuyện")

    # Delete all messages belonging to session
    db.query(ChatMessageRecord).filter(ChatMessageRecord.session_id == session_id).delete()
    db.query(CalendarDraftRecord).filter_by(session_id=session.id).update({"session_id": None})
    db.delete(session)
    db.commit()
    return {"success": True, "message": "Đã xóa phiên trò chuyện thành công", "id": session_id}


@router.post("", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> ChatResponse:
    """Use the same scoped, validated runtime for streaming and regular chat."""
    return project_chat(request, project_id, db)


@router.post("/stream")
def stream_project_chat(request: ChatRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    # Fail request validation before sending SSE headers or starting a billed call.
    if not request.message.strip():
        raise HTTPException(422, "Tin nhắn không được trống.")
    resolve_model(db, request.model_id)
    if request.session_id and not owned_query(db, ChatSessionRecord, project_id).filter_by(id=request.session_id).first():
        raise HTTPException(404, "Không tìm thấy phiên trò chuyện trong dự án.")
    for resource_id in set(request.resource_ids):
        if not any(owned_query(db, model, project_id).filter_by(id=resource_id).first() for model in (DocumentRecord, EmailProcessedRecord)):
            raise HTTPException(404, "Nguồn ngữ cảnh không thuộc dự án.")
    queue, closed = Queue(maxsize=128), Event()

    def emit(event):
        from queue import Full
        while not closed.is_set():
            try:
                queue.put(event, timeout=0.5)
                return
            except Full:
                continue
        raise LLMError("Kết nối nhận câu trả lời đã đóng; chưa tự gửi lại yêu cầu.")

    def work():
        try:
            with SessionLocal() as worker_db:
                result = project_chat(request, project_id, worker_db, emit)
                emit({"type": "done", **result.model_dump(mode="json")})
        except (LLMError, HTTPException) as exc:
            if not closed.is_set():
                emit({"type": "error", "message": str(exc) if isinstance(exc, LLMError) else str(exc.detail)})
        except Exception:
            logger.exception("Lỗi xử lý chat stream")
            if not closed.is_set():
                emit({"type": "error", "message": "Chưa xác nhận được kết quả lưu câu trả lời. Mở lại lịch sử trước khi gửi lại."})

    def events():
        thread = Thread(target=work, daemon=True)
        try:
            yield 'data: {"type":"status","text":"Đã nhận yêu cầu, đang đọc nguồn đã chọn…"}\n\n'
            thread.start()
            while True:
                try:
                    event = queue.get(timeout=10)
                except Empty:
                    yield ": keep-alive\n\n"
                    continue
                yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
                if event["type"] in ("done", "error"):
                    return
        finally:
            closed.set()
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def project_chat(request: ChatRequest, project_id: str, db: Session, emit=None) -> ChatResponse:
    """Persist only validated runtime output and calendar drafts in this project."""
    if not request.message.strip():
        raise HTTPException(422, "Tin nhắn không được trống.")
    if request.session_id:
        session = owned_query(db, ChatSessionRecord, project_id).filter_by(id=request.session_id).first()
        if not session:
            raise HTTPException(404, "Không tìm thấy phiên trò chuyện trong dự án.")
    else:
        session = None
    started, steps = time.perf_counter(), []
    def progress(text):
        steps.append(text)
        if emit:
            emit({"type": "status", "text": text})
    history = _load_session_history(db, session.id) if session else []
    run = run_project_chat(
        db=db, project_id=project_id, resource_ids=request.resource_ids,
        message=request.message.strip(), history=history, model=request.model_id,
        progress=progress, emit=emit,
    )
    result, source_names = run.result, run.source_names
    if not result.content.strip():
        raise HTTPException(502, "Không nhận được câu trả lời từ LLM. Kiểm tra provider và model đã chọn.")
    progress("Đang lưu câu trả lời và nháp vào dự án…")
    completed_steps = steps + ["Đã lưu câu trả lời và nháp vào dự án."]
    require_project(db, project_id)
    if request.session_id:
        session = owned_query(db, ChatSessionRecord, project_id).filter_by(id=request.session_id).populate_existing().first()
        if session is None:
            raise HTTPException(409, "Phiên trò chuyện đã bị xóa trong lúc trả lời; chưa lưu tin nhắn mới.")
    if session is None:
        session = ChatSessionRecord(project_id=project_id, title=request.message.strip()[:80])
        db.add(session)
        db.flush()
    drafts = add_drafts(db, project_id, run.drafts,
                       request.resource_ids[0] if len(set(request.resource_ids)) == 1 else None,
                       session.id) if run.drafts else []
    db.add_all([
        ChatMessageRecord(session_id=session.id, role="user", content=request.message.strip()),
        ChatMessageRecord(session_id=session.id, role="ai", content=result.content, thinking_process=result.thought,
                          agents_invoked_json=json.dumps(["PROJECT_CHAT_RUNTIME"] + (["CALENDAR_AGENT"] if run.drafts else [])),
                          metadata_json=json.dumps({"provider_id": result.provider_id, "model_id": result.model_id,
                                                    "fallback_used": result.fallback_used, "usage": result.usage,
                                                    "processing_steps": completed_steps, "duration_seconds": round(time.perf_counter() - started, 1),
                                                    "calendar_draft_ids": [draft.id for draft in drafts], "source_names": source_names,
                                                    "runtime_version": "json-tools-v2", "selected_resource_ids": list(dict.fromkeys(request.resource_ids)),
                                                    "tool_receipts": run.receipts})),
    ])
    session.updated_at = datetime.utcnow()
    db.commit()
    return ChatResponse(response=result.content, intent=run.intent, agents_invoked=["PROJECT_CHAT_RUNTIME"] + (["CALENDAR_AGENT"] if run.drafts else []), thinking_process=result.thought, session_id=session.id,
                        referenced_source_names=source_names,
                        calendar_data={"drafts": [draft_payload(db, draft) for draft in drafts]} if drafts else None,
                        provider_id=result.provider_id, model_id=result.model_id, fallback_used=result.fallback_used,
                        processing_steps=completed_steps, duration_seconds=round(time.perf_counter() - started, 1))


@router.post("/with-file", response_model=ChatResponse)
async def chat_with_file_endpoint(
    message: str = Form(...),
    session_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    project_id: str = Depends(project_scope), db: Session = Depends(get_db),
) -> ChatResponse:
    raise HTTPException(410, "Upload PDF qua Tài nguyên của dự án rồi chọn nguồn trong chat.")


@router.get("/status", response_model=SystemStatusResponse)
def get_system_status() -> SystemStatusResponse:
    """
    Returns health and status of Ollama connection, Google Workspace configuration, and system variables.
    """
    ollama_info = check_ollama_status()
    senders = settings.get_effective_allowed_senders()
    return SystemStatusResponse(
        app_name=settings.app_name,
        ollama_status=ollama_info,
        email_provider="gmail",
        calendar_provider=settings.calendar_provider,
        allowed_senders=senders,
        calendar_default_reminder_minutes=settings.calendar_default_reminder_minutes,
    )
