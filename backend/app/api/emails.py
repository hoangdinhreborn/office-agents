import math
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.email_agent import email_agent, EmailAnalysisResult
from app.config import settings
from app.database.database import get_db
from app.database.models import EmailFolderRuleRecord, EmailProcessedRecord
from app.integrations.gmail import gmail_service
from app.schemas.email import EmailMessage
from app.services.email_poller import email_poller
from app.services.pdf_generator import pdf_generator

router = APIRouter(prefix="/api/emails", tags=["Emails & Poller Integration"])


class FetchEmailsRequest(BaseModel):
    folder_name: Optional[str] = Field(None, description="Tên nhãn Gmail cần đọc (vd: 'INBOX', 'STARRED')")
    allowed_senders: Optional[List[str]] = Field(None, description="Danh sách các địa chỉ email được phép đọc")
    limit: int = Field(10, description="Số lượng email tối đa cần đọc")
    unread_only: bool = Field(False, description="Chỉ lấy thư chưa đọc nếu True; lấy cả thư đã đọc nếu False")
    page_token: Optional[str] = Field(None, description="Token trang kế tiếp cho phân trang Gmail")


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


class FolderRuleCreate(BaseModel):
    folder_name: str = Field(..., min_length=1, max_length=100, description="Tên thư mục/nhãn")
    description: Optional[str] = Field("", max_length=255)
    keywords: List[str] = Field(default_factory=list, description="Danh sách từ khóa cần lọc")
    senders: List[str] = Field(default_factory=list, description="Danh sách người gửi hoặc wildcard (*@student.edu.vn)")
    color: Optional[str] = Field("#3B82F6", description="Mã màu đại diện")
    auto_apply_gmail_label: bool = Field(True, description="Tự động đồng bộ và gắn nhãn trên Gmail")


class DailyDigestRequest(BaseModel):
    date: Optional[str] = Field(None, description="Ngày cần tổng hợp (YYYY-MM-DD), để trống = hôm nay")


class DailyDigestExportRequest(BaseModel):
    date: Optional[str] = Field(None, description="Ngày cần xuất báo cáo (YYYY-MM-DD), để trống = hôm nay")
    filename: Optional[str] = Field(None, description="Tên file tùy chọn")


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
def get_email_labels(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Returns available email labels directly from user's Gmail account + custom user rules & categories.
    """
    gmail_labels = []
    if gmail_service.is_authenticated():
        try:
            raw_labels = gmail_service.list_user_labels()
            hidden_labels = {"CHAT", "YELLOW_STAR", "VOICEMAIL"}
            for lbl in raw_labels:
                name = lbl.get("name")
                if name and name not in hidden_labels:
                    gmail_labels.append(name)
        except Exception as exc:
            logger.warning(f"Không thể tải nhãn từ Gmail: {exc}")

    custom_folders = []
    try:
        rules = db.query(EmailFolderRuleRecord).all()
        custom_folders = [r.folder_name for r in rules]
    except Exception:
        pass

    primary_defaults = ["INBOX", "IMPORTANT", "SENT", "STARRED", "UNREAD"]
    combined = []
    for p in primary_defaults:
        if p in gmail_labels:
            combined.append(p)
        elif p not in combined:
            combined.append(p)

    for gl in gmail_labels:
        if gl not in combined:
            combined.append(gl)

    for cf in custom_folders:
        if cf not in combined:
            combined.append(cf)

    return {
        "provider": "gmail",
        "default_label": settings.gmail_label,
        "folders": combined,
        "labels": combined,
        "gmail_labels_count": len(gmail_labels),
        "custom_rules_count": len(custom_folders),
    }


@router.post("/fetch")
def fetch_raw_emails(req: FetchEmailsRequest) -> Dict[str, Any]:
    """
    Fetches emails from specific Gmail label or EML with sender filtering without LLM analysis.
    Supports page_token for pagination.
    """
    senders = req.allowed_senders if req.allowed_senders is not None else settings.get_effective_allowed_senders()
    target_label = req.folder_name or settings.gmail_label

    if gmail_service.is_authenticated():
        messages = gmail_service.fetch_unread_emails(
            label=target_label,
            allowed_senders=senders if isinstance(senders, list) and senders else None,
            limit=req.limit,
            unread_only=req.unread_only,
            page_token=req.page_token,
        )
    else:
        messages = []

    items = [
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

    return {
        "items": items,
        "next_page_token": gmail_service.last_next_page_token,
        "count": len(items),
    }


@router.post("/analyze")
def analyze_emails_endpoint(req: FetchEmailsRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Fetches, performs full AI analysis on Gmail emails, AND PERSISTS every email to SQLite database.
    Supports page_token for 'Quét Tiếp' incremental scanning.
    """
    senders = req.allowed_senders if req.allowed_senders is not None else settings.get_effective_allowed_senders()
    target_label = req.folder_name or settings.gmail_label
    analysis_list = email_agent.fetch_and_analyze(
        folder_name=target_label,
        allowed_senders=senders if isinstance(senders, list) and senders else None,
        limit=req.limit,
        unread_only=req.unread_only,
        page_token=req.page_token,
    )

    # PERSIST to database so they are NEVER lost when leaving the tab!
    for item in analysis_list:
        try:
            s_name = item.sender.split("<")[0].strip(" \"'") if "<" in item.sender else item.sender
            s_email = item.sender.split("<")[-1].replace(">", "").strip() if "<" in item.sender else item.sender
            rec = db.query(EmailProcessedRecord).filter(EmailProcessedRecord.id == item.id).first()
            if not rec:
                rec = EmailProcessedRecord(
                    id=item.id,
                    source="gmail",
                    subject=item.subject,
                    sender=item.sender,
                    sender_name=s_name,
                    sender_email=s_email,
                    received_time=item.received_time,
                    folder=item.folder or target_label,
                    urgency=item.urgency,
                    category=item.category,
                    summary=item.summary,
                    full_analysis=item.full_analysis or item.summary,
                    body_snippet=item.summary[:1000] if item.summary else item.subject,
                    issue_description=item.issue_description,
                    calendar_hint=item.calendar_hint,
                    has_issue_to_solve=item.has_issue_to_solve,
                    has_calendar_event=item.has_calendar_event,
                    pdf_filename=item.pdf_filename,
                    pdf_summary=item.pdf_summary,
                    has_attachments=bool(item.pdf_filename),
                    calendar_events_count=1 if item.has_calendar_event else 0,
                    solution_generated=item.has_issue_to_solve,
                    status="processed",
                )
                db.add(rec)
            else:
                rec.folder = item.folder or rec.folder
                rec.urgency = item.urgency
                rec.category = item.category
                rec.sender = item.sender or rec.sender
                rec.sender_name = s_name or rec.sender_name
                rec.sender_email = s_email or rec.sender_email
                rec.summary = item.summary or rec.summary
                rec.full_analysis = item.full_analysis or item.summary or rec.full_analysis
                rec.body_snippet = item.summary[:1000] if item.summary else rec.body_snippet
                rec.issue_description = item.issue_description or rec.issue_description
                rec.calendar_hint = item.calendar_hint or rec.calendar_hint
                rec.has_issue_to_solve = item.has_issue_to_solve
                rec.has_calendar_event = item.has_calendar_event
                rec.pdf_filename = item.pdf_filename or rec.pdf_filename
                rec.pdf_summary = item.pdf_summary or rec.pdf_summary
            db.commit()
        except Exception as db_err:
            db.rollback()
            logger.warning(f"Lỗi lưu email {item.id} vào DB: {db_err}")

    items_dicts = [a.__dict__ for a in analysis_list]
    next_token = email_agent.last_next_page_token

    return {
        "items": items_dicts,
        "next_page_token": next_token,
        "count": len(items_dicts),
    }


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
    folder: Optional[str] = Query(None, description="Lọc theo thư mục"),
    category: Optional[str] = Query(None, description="Lọc theo phân loại"),
    db: Session = Depends(get_db),
) -> Any:
    """
    Returns list of processed emails with optional pagination and folder filtering.
    """
    query = db.query(EmailProcessedRecord).order_by(EmailProcessedRecord.processed_at.desc())
    if folder and folder.strip().upper() != "ALL":
        query = query.filter(EmailProcessedRecord.folder == folder.strip())
    if category:
        query = query.filter(EmailProcessedRecord.category == category)

    total = query.count()

    def _format_rec(r: EmailProcessedRecord) -> Dict[str, Any]:
        sender_disp = r.sender or (
            f"{r.sender_name} <{r.sender_email}>"
            if r.sender_name and r.sender_email
            else (r.sender_name or r.sender_email or "Người gửi ẩn danh")
        )
        return {
            "id": r.id,
            "source": r.source,
            "subject": r.subject,
            "sender": sender_disp,
            "sender_name": r.sender_name or r.sender_email,
            "sender_email": r.sender_email,
            "received_time": r.received_time,
            "folder": r.folder or "INBOX",
            "urgency": r.urgency or "Trung bình",
            "category": r.category or "Khác",
            "summary": r.summary or r.full_analysis or r.body_snippet or r.body or r.subject,
            "full_analysis": r.full_analysis or r.summary or "",
            "body": r.body or "",
            "issue_description": r.issue_description,
            "calendar_hint": r.calendar_hint,
            "has_issue_to_solve": bool(r.has_issue_to_solve),
            "has_calendar_event": bool(r.has_calendar_event),
            "has_attachments": bool(r.has_attachments or r.pdf_filename),
            "pdf_attachments_count": r.pdf_attachments_count or (1 if r.pdf_filename else 0),
            "pdf_filename": r.pdf_filename,
            "pdf_summary": r.pdf_summary,
            "calendar_events_count": r.calendar_events_count or (1 if r.calendar_hint else 0),
            "status": r.status,
            "processed_at": r.processed_at.isoformat() if r.processed_at else None,
        }

    if page is not None:
        offset = (page - 1) * page_size
        records = query.offset(offset).limit(page_size).all()
        items = [_format_rec(r) for r in records]
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    records = query.limit(100).all()
    return [_format_rec(r) for r in records]


# ------------------------------------------------------------------ Folder Rules Endpoints
@router.get("/rules")
def list_folder_rules(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """Lists all user-configured email folder rules."""
    rules = db.query(EmailFolderRuleRecord).order_by(EmailFolderRuleRecord.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "folder_name": r.folder_name,
            "description": r.description,
            "keywords": r.get_keywords(),
            "senders": r.get_senders(),
            "color": r.color,
            "auto_apply_gmail_label": r.auto_apply_gmail_label,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rules
    ]


@router.post("/rules")
def create_or_update_folder_rule(req: FolderRuleCreate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Creates or updates a folder rule by folder_name."""
    name = req.folder_name.strip()
    existing = db.query(EmailFolderRuleRecord).filter(EmailFolderRuleRecord.folder_name == name).first()
    if existing:
        existing.description = req.description or ""
        existing.set_keywords(req.keywords)
        existing.set_senders(req.senders)
        existing.color = req.color or "#3B82F6"
        existing.auto_apply_gmail_label = req.auto_apply_gmail_label
        db.commit()
        db.refresh(existing)
        target = existing
    else:
        target = EmailFolderRuleRecord(
            folder_name=name,
            description=req.description or "",
            color=req.color or "#3B82F6",
            auto_apply_gmail_label=req.auto_apply_gmail_label,
        )
        target.set_keywords(req.keywords)
        target.set_senders(req.senders)
        db.add(target)
        db.commit()
        db.refresh(target)

    # Ensure label exists in Gmail if enabled
    if req.auto_apply_gmail_label and gmail_service.is_authenticated():
        try:
            gmail_service.get_or_create_label(name)
        except Exception:
            pass

    return {
        "success": True,
        "rule": {
            "id": target.id,
            "folder_name": target.folder_name,
            "description": target.description,
            "keywords": target.get_keywords(),
            "senders": target.get_senders(),
            "color": target.color,
            "auto_apply_gmail_label": target.auto_apply_gmail_label,
            "created_at": target.created_at.isoformat() if target.created_at else None,
        },
    }


@router.delete("/rules/{rule_id}")
def delete_folder_rule(rule_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Deletes an email folder rule by ID."""
    rule = db.query(EmailFolderRuleRecord).filter(EmailFolderRuleRecord.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Không tìm thấy luật phân loại email.")
    db.delete(rule)
    db.commit()
    return {"success": True, "message": f"Đã xóa luật phân loại thư mục '{rule.folder_name}'."}


# ------------------------------------------------------------------ Daily Digest Endpoints
@router.post("/daily-digest")
def get_daily_digest(req: DailyDigestRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Returns aggregated summary and categorization of daily emails.
    """
    digest = email_agent.generate_daily_digest(target_date=req.date)
    return digest


@router.post("/daily-digest/export-pdf")
def export_daily_digest_pdf(req: DailyDigestExportRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Generates an executive PDF report summarizing daily emails and saves it to data/documents.
    """
    digest = email_agent.generate_daily_digest(target_date=req.date)
    pdf_path = pdf_generator.generate_digest_pdf(
        target_date=digest["target_date"],
        digest_data=digest,
        output_filename=req.filename,
    )
    return {
        "success": True,
        "filename": pdf_path.name,
        "download_url": f"/api/emails/daily-digest/download/{pdf_path.name}",
        "target_date": digest["target_date"],
        "total_emails": digest["total_emails"],
        "urgent_count": digest["urgent_count"],
        "categories": {k: len(v) for k, v in digest["categories"].items()},
    }


@router.get("/daily-digest/download/{filename}")
def download_daily_digest_pdf(filename: str):
    """
    Downloads the generated Daily Email Digest PDF report.
    """
    safe_name = Path(filename).name
    pdf_file = Path("data/documents") / safe_name
    if not pdf_file.exists():
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file báo cáo PDF: {safe_name}")
    return FileResponse(
        path=str(pdf_file),
        media_type="application/pdf",
        filename=safe_name,
    )
