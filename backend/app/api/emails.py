import math
from typing import Any, Dict, List, Literal, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.email_agent import email_agent, EmailAnalysisResult
from app.config import settings
from app.database.database import get_db
from app.database.models import EmailProcessedRecord
from app.integrations.gmail import gmail_service
from app.schemas.email import EmailMessage
from app.services.email_poller import email_poller

router = APIRouter(prefix="/api/emails", tags=["Emails & Poller Integration"])


class FetchEmailsRequest(BaseModel):
    folder_name: Optional[str] = Field(None, description="Tên nhãn Gmail cần đọc (vd: 'INBOX', 'STARRED')")
    allowed_senders: Optional[List[str]] = Field(None, description="Danh sách các địa chỉ email được phép đọc")
    limit: int = Field(5, description="Số lượng email tối đa cần đọc")
    unread_only: bool = Field(False, description="Chỉ lấy thư chưa đọc nếu True; lấy cả thư đã đọc nếu False")


class SendEmailRequest(BaseModel):
    to: List[str] = Field(..., min_length=1, description="Danh sách người nhận")
    subject: str = Field(..., description="Tiêu đề email")
    body: str = Field(..., description="Nội dung email (text hoặc HTML nếu is_html=true)")
    cc: List[str] = Field(default_factory=list)
    bcc: List[str] = Field(default_factory=list)
    is_html: bool = False
    provider: Literal["gmail"] = "gmail"


class GmailFetchRequest(BaseModel):
    label: Optional[str] = Field(None, description="Nhãn Gmail (mặc định GMAIL_LABEL, vd: INBOX)")
    allowed_senders: Optional[List[str]] = Field(None, description="Lọc người gửi; để trống = không lọc")
    limit: int = Field(10, ge=1, le=50)
    unread_only: bool = Field(False, description="Chỉ lấy thư chưa đọc nếu True; lấy cả thư đã đọc nếu False")


def _require_gmail_auth() -> None:
    if not gmail_service.is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Chưa đăng nhập Gmail (hoặc token thiếu quyền gửi). "
            "Chạy: python backend/scripts/smoke_test_gmail_send.py --auth-only",
        )


@router.post("/send")
def send_email_endpoint(req: SendEmailRequest) -> Dict[str, Any]:
    """
    Gửi email qua Gmail API. Không bao giờ mở trình duyệt: cần đăng nhập trước bằng smoke script.
    """
    _require_gmail_auth()
    # Validate input first so bad requests map to 400, not upstream errors.
    try:
        gmail_service.build_message(req.to, req.subject, req.body, cc=req.cc, bcc=req.bcc, is_html=req.is_html)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        return gmail_service.send_email(
            to=req.to, subject=req.subject, body=req.body, cc=req.cc, bcc=req.bcc, is_html=req.is_html
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/gmail/status")
def gmail_status() -> Dict[str, Any]:
    authenticated = gmail_service.is_authenticated()
    email_addr = None
    error = None
    if authenticated:
        try:
            email_addr = gmail_service.get_profile_email()
        except Exception as exc:
            error = str(exc)
    return {
        "configured": gmail_service.is_configured(),
        "client_type": gmail_service.client_type(),
        "authenticated": authenticated,
        "email": email_addr,
        "error": error,
        "credentials_path": str(gmail_service.creds_path),
        "token_path": str(gmail_service.token_path),
    }


@router.post("/gmail/fetch")
def gmail_fetch(req: GmailFetchRequest) -> List[Dict[str, Any]]:
    """Check mail Gmail chưa đọc (không qua LLM)."""
    _require_gmail_auth()
    try:
        messages = gmail_service.fetch_unread_emails(
            label=req.label or settings.gmail_label,
            allowed_senders=req.allowed_senders or None,
            limit=req.limit,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return [
        {
            "id": m.id,
            "subject": m.subject,
            "sender_name": m.sender_name,
            "sender_email": m.sender_email,
            "received_time": m.received_time,
            "body": m.body[:2000],
            "has_attachments": m.has_attachments,
            "attachments": [a.filename for a in m.attachments],
        }
        for m in messages
    ]


@router.get("/folders")
@router.get("/labels")
def get_email_labels() -> Dict[str, Any]:
    """
    Returns available email labels (Gmail default: INBOX).
    """
    return {
        "provider": "gmail",
        "default_label": settings.gmail_label,
        "folders": ["INBOX", "STARRED", "IMPORTANT", "SENT", "DRAFT", "TRASH"],
        "labels": ["INBOX", "STARRED", "IMPORTANT", "SENT", "DRAFT", "TRASH"],
    }


@router.post("/fetch")
def fetch_raw_emails(req: FetchEmailsRequest) -> List[Dict[str, Any]]:
    """
    Fetches emails from specific Gmail label or EML with sender filtering without LLM analysis.
    """
    senders = req.allowed_senders if req.allowed_senders is not None else settings.get_effective_allowed_senders()
    target_label = req.folder_name or settings.gmail_label

    if gmail_service.is_authenticated():
        messages = gmail_service.fetch_unread_emails(
            label=target_label,
            allowed_senders=senders if isinstance(senders, list) and senders else None,
            limit=req.limit,
            unread_only=req.unread_only,
        )
    else:
        messages = []

    return [
        {
            "id": m.id,
            "subject": m.subject,
            "sender_name": m.sender_name,
            "sender_email": m.sender_email,
            "received_time": m.received_time,
            "body": m.body,
            "folder": m.folder,
            "has_attachments": m.has_attachments,
            "attachments": [a.filename for a in m.attachments],
        }
        for m in messages
    ]


@router.post("/analyze")
def analyze_emails_endpoint(req: FetchEmailsRequest) -> List[Dict[str, Any]]:
    """
    Fetches and performs full AI analysis on Gmail emails (summary, urgency, issues, calendar hints).
    """
    senders = req.allowed_senders if req.allowed_senders is not None else settings.get_effective_allowed_senders()
    analysis_list = email_agent.fetch_and_analyze(
        folder_name=req.folder_name or settings.gmail_label,
        allowed_senders=senders if isinstance(senders, list) and senders else None,
        limit=req.limit,
        unread_only=req.unread_only,
    )
    return [a.__dict__ for a in analysis_list]


@router.post("/poll-now")
def trigger_email_poll_now() -> Dict[str, Any]:
    """
    Manually triggers one polling cycle across Gmail and local EML folders.
    """
    return email_poller.poll_once()


@router.get("/processed")
def list_processed_emails(
    page: Optional[int] = Query(None, ge=1, description="Số trang (bắt đầu từ 1; để trống = trả về list)"),
    page_size: int = Query(10, ge=1, le=100, description="Số lượng email mỗi trang"),
    db: Session = Depends(get_db),
) -> Any:
    """
    Returns list of processed emails with optional pagination.
    """
    query = db.query(EmailProcessedRecord).order_by(EmailProcessedRecord.processed_at.desc())
    total = query.count()

    if page is not None:
        offset = (page - 1) * page_size
        records = query.offset(offset).limit(page_size).all()
        items = [
            {
                "id": r.id,
                "source": r.source,
                "subject": r.subject,
                "sender_email": r.sender_email,
                "received_time": r.received_time,
                "has_attachments": r.has_attachments,
                "pdf_attachments_count": r.pdf_attachments_count,
                "calendar_events_count": r.calendar_events_count,
                "status": r.status,
                "processed_at": r.processed_at.isoformat() if r.processed_at else None,
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

    records = query.limit(100).all()
    return [
        {
            "id": r.id,
            "source": r.source,
            "subject": r.subject,
            "sender_email": r.sender_email,
            "received_time": r.received_time,
            "has_attachments": r.has_attachments,
            "pdf_attachments_count": r.pdf_attachments_count,
            "calendar_events_count": r.calendar_events_count,
            "status": r.status,
            "processed_at": r.processed_at.isoformat() if r.processed_at else None,
        }
        for r in records
    ]
