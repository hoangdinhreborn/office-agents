from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agents.orchestrator import orchestrator
from app.config import settings
from app.database.database import get_db
from app.database.models import CalendarRecord, ChatMessageRecord, ChatSessionRecord
from app.integrations.calendar import calendar_service
from app.llm.ollama import check_ollama_status
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
        title=session.title or "Cuộc trò chuyện mới",
        created_at=session.created_at.isoformat() if session.created_at else "",
        updated_at=session.updated_at.isoformat() if session.updated_at else "",
        message_count=message_count,
    )


def _format_message_item(msg: ChatMessageRecord) -> ChatMessageItem:
    try:
        agents = json.loads(msg.agents_invoked_json) if msg.agents_invoked_json else []
    except Exception:
        agents = []
    return ChatMessageItem(
        id=msg.id,
        session_id=msg.session_id,
        role=msg.role,
        content=msg.content,
        thinking_process=msg.thinking_process or "",
        agents_invoked=agents,
        created_at=msg.created_at.isoformat() if msg.created_at else "",
    )


def _get_or_create_session(
    db: Session,
    session_id: Optional[str] = None,
    first_prompt: Optional[str] = None,
) -> ChatSessionRecord:
    session = None
    if session_id:
        session = db.query(ChatSessionRecord).filter(ChatSessionRecord.id == session_id).first()

    if not session:
        initial_title = "Cuộc trò chuyện mới"
        if first_prompt and first_prompt.strip():
            clean_p = first_prompt.strip().replace("\n", " ")
            initial_title = clean_p[:40] + ("..." if len(clean_p) > 40 else "")
        session = ChatSessionRecord(
            id=str(uuid.uuid4()),
            title=initial_title,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    elif session.title == "Cuộc trò chuyện mới" and first_prompt and first_prompt.strip():
        clean_p = first_prompt.strip().replace("\n", " ")
        session.title = clean_p[:40] + ("..." if len(clean_p) > 40 else "")
        session.updated_at = datetime.utcnow()
        db.commit()

    return session


def _load_session_history(db: Session, session_id: str, limit: int = 12) -> List[Dict[str, str]]:
    records = (
        db.query(ChatMessageRecord)
        .filter(ChatMessageRecord.session_id == session_id)
        .order_by(ChatMessageRecord.created_at.asc())
        .all()
    )
    # Take the trailing messages up to limit
    trimmed = records[-limit:] if len(records) > limit else records
    history = []
    for r in trimmed:
        role_label = "user" if r.role == "user" else "assistant"
        history.append({"role": role_label, "content": r.content})
    return history


@router.get("/sessions", response_model=List[ChatSessionSummary])
def list_chat_sessions(db: Session = Depends(get_db)) -> List[ChatSessionSummary]:
    """
    Returns list of saved chat sessions ordered by latest update.
    """
    sessions = (
        db.query(ChatSessionRecord)
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
def create_chat_session(req: SessionCreateRequest, db: Session = Depends(get_db)) -> ChatSessionSummary:
    """
    Creates a new empty chat session.
    """
    session = ChatSessionRecord(
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
def get_chat_session_detail(session_id: str, db: Session = Depends(get_db)) -> ChatSessionDetail:
    """
    Retrieves full message history of a specific chat session.
    """
    session = db.query(ChatSessionRecord).filter(ChatSessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên trò chuyện")

    messages = (
        db.query(ChatMessageRecord)
        .filter(ChatMessageRecord.session_id == session_id)
        .order_by(ChatMessageRecord.created_at.asc())
        .all()
    )

    summary = _format_session_summary(session, message_count=len(messages))
    items = [_format_message_item(m) for m in messages]
    return ChatSessionDetail(session=summary, messages=items)


@router.patch("/sessions/{session_id}", response_model=ChatSessionSummary)
def update_chat_session(session_id: str, req: SessionUpdateRequest, db: Session = Depends(get_db)) -> ChatSessionSummary:
    """
    Renames a chat session title.
    """
    session = db.query(ChatSessionRecord).filter(ChatSessionRecord.id == session_id).first()
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
def delete_chat_session(session_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Deletes a chat session along with all associated messages.
    """
    session = db.query(ChatSessionRecord).filter(ChatSessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên trò chuyện")

    # Delete all messages belonging to session
    db.query(ChatMessageRecord).filter(ChatMessageRecord.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"success": True, "message": "Đã xóa phiên trò chuyện thành công", "id": session_id}


def _persist_scheduled_calendar_events(db: Session, calendar_data: Optional[Dict[str, Any]]) -> None:
    if not calendar_data:
        return
    scheduled = calendar_data.get("scheduled_events") or []
    for se in scheduled:
        event_id = se.get("event_id") if isinstance(se, dict) else getattr(se, "event_id", None)
        ics_file = se.get("ics_file", "") if isinstance(se, dict) else getattr(se, "ics_file", "")
        cloud_synced = se.get("cloud_synced", False) if isinstance(se, dict) else getattr(se, "cloud_synced", False)
        if not event_id:
            continue
        evt_obj = calendar_service.get_event(event_id)
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
                ics_path=ics_file,
                synced_desktop=bool(cloud_synced),
            )
            db.merge(rec)


@router.post("", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    """
    Main conversational endpoint: routes prompt to Orchestrator Agent,
    persisting user and AI messages to SQLite session history.
    """
    # 1. Get or create session
    session = _get_or_create_session(db, session_id=request.session_id, first_prompt=request.message)

    # 2. Save user message to DB
    user_msg = ChatMessageRecord(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="user",
        content=request.message.strip(),
        created_at=datetime.utcnow(),
    )
    db.add(user_msg)
    db.commit()

    # 3. Load historical context from session if not explicitly provided
    history = request.history
    if not history:
        history = _load_session_history(db, session.id, limit=10)

    # 4. Route and execute through multi-agent orchestrator
    orch_res = orchestrator.route_and_execute(
        message=request.message,
        folder_name=request.folder_name,
        allowed_senders=request.allowed_senders,
        history=history,
    )

    # 4.1 Persist any scheduled calendar events to DB
    _persist_scheduled_calendar_events(db, orch_res.calendar_data)

    # 5. Save AI message to DB
    ai_msg = ChatMessageRecord(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="ai",
        content=orch_res.reply,
        thinking_process=orch_res.thinking_process,
        agents_invoked_json=json.dumps(orch_res.agents_invoked or [], ensure_ascii=False),
        created_at=datetime.utcnow(),
    )
    db.add(ai_msg)

    # 6. Update session timestamp
    session.updated_at = datetime.utcnow()
    db.commit()

    return ChatResponse(
        response=orch_res.reply,
        intent=orch_res.intent,
        agents_invoked=orch_res.agents_invoked,
        thinking_process=orch_res.thinking_process,
        session_id=session.id,
        summary_data=orch_res.summary_data,
        solution_data=orch_res.solution_data,
        email_data=orch_res.email_data,
        calendar_data=orch_res.calendar_data,
    )


@router.post("/with-file", response_model=ChatResponse)
async def chat_with_file_endpoint(
    message: str = Form(...),
    session_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
) -> ChatResponse:
    """
    Chat endpoint accepting a PDF document upload along with the prompt,
    persisting messages to the chat session history.
    """
    # 1. Get or create session
    session = _get_or_create_session(db, session_id=session_id, first_prompt=message)

    pdf_bytes = None
    pdf_name = None
    if file:
        pdf_bytes = await file.read()
        pdf_name = file.filename

    # 2. Save user message to DB
    display_content = message.strip() + (f" [Đính kèm: {pdf_name}]" if pdf_name else "")
    user_msg = ChatMessageRecord(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="user",
        content=display_content,
        created_at=datetime.utcnow(),
    )
    db.add(user_msg)
    db.commit()

    # 3. Run multi-agent orchestrator
    orch_res = orchestrator.route_and_execute(
        message=message,
        pdf_bytes=pdf_bytes,
        pdf_filename=pdf_name,
    )

    # 3.1 Persist any scheduled calendar events to DB
    _persist_scheduled_calendar_events(db, orch_res.calendar_data)

    # 4. Save AI message to DB
    ai_msg = ChatMessageRecord(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="ai",
        content=orch_res.reply,
        thinking_process=orch_res.thinking_process,
        agents_invoked_json=json.dumps(orch_res.agents_invoked or [], ensure_ascii=False),
        created_at=datetime.utcnow(),
    )
    db.add(ai_msg)
    session.updated_at = datetime.utcnow()
    db.commit()

    return ChatResponse(
        response=orch_res.reply,
        intent=orch_res.intent,
        agents_invoked=orch_res.agents_invoked,
        thinking_process=orch_res.thinking_process,
        session_id=session.id,
        summary_data=orch_res.summary_data,
        solution_data=orch_res.solution_data,
        email_data=orch_res.email_data,
        calendar_data=orch_res.calendar_data,
    )


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
