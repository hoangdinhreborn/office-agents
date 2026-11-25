from datetime import datetime
import uuid
import json
import logging
from app.services.projects import owned_query, project_scope
import math
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
import mimetypes

from app.agents.email_agent import email_agent, EmailAnalysisResult
from app.config import resolve_path, settings
from app.database.database import get_db
from app.database.models import EmailProcessedRecord, ProjectRecord, SentMailRecord
from app.integrations.gmail import gmail_service
from app.schemas.email import EmailAttachment, EmailMessage
from app.schemas.email_reply import MAX_ATTACHMENT_BYTES, ReplyDraft, ReplyDraftRequest, ReplySendRequest
from app.services.email_reply import create_reply_draft, reconcile_reply, safe_filename, send_payload, send_reply, source_record
from app.services.email_poller import email_poller
from app.services.email_sync_jobs import start_job, job_status
from app.services.projects import require_project
from app.services.pdf_generator import pdf_generator
from app.services.email_ingest import email_payload, retry_email_analysis, route_project_email, stored_email_pdfs
from app.services.email_analysis import Urgency

logger = logging.getLogger(__name__)

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


class DailyDigestRequest(BaseModel):
    date: Optional[str] = Field(None, description="Ngày cần tổng hợp (YYYY-MM-DD), để trống = hôm nay")


class DailyDigestExportRequest(BaseModel):
    date: Optional[str] = Field(None, description="Ngày cần xuất báo cáo (YYYY-MM-DD), để trống = hôm nay")
    filename: Optional[str] = Field(None, description="Tên file tùy chọn")


def _require_gmail_auth() -> None:
    if not gmail_service.is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Chưa đăng nhập Gmail hoặc token thiếu quyền gmail.modify để đọc/gắn nhãn. Cần cấp quyền lại. "
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


@router.post("/reply-draft", response_model=ReplyDraft)
def draft_solution_reply(req: ReplyDraftRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    return create_reply_draft(db, project_id, req)


@router.post("/reply-send")
async def send_solution_reply(
    payload: str = Form(..., max_length=100000), files: list[UploadFile] = File(default=[]),
    project_id: str = Depends(project_scope), db: Session = Depends(get_db),
):
    try:
        req = ReplySendRequest.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(422, "Thông tin gửi thư không hợp lệ: kiểm tra người nhận, tiêu đề, nội dung và bước duyệt gửi.") from exc
    if len(files) + len(set(req.resource_ids)) > 20:
        raise HTTPException(413, "Tối đa 20 tệp đính kèm.")
    attachments, total = [], 0
    try:
        for file in files:
            content = await file.read(MAX_ATTACHMENT_BYTES - total + 1)
            total += len(content)
            if total > MAX_ATTACHMENT_BYTES:
                raise HTTPException(413, "Tổng tệp đính kèm vượt 18 MiB.")
            filename = safe_filename(file.filename or "attachment")
            attachments.append(EmailAttachment(filename, mimetypes.guess_type(filename)[0] or "application/octet-stream", content))
        return await run_in_threadpool(send_reply, db, project_id, req, attachments)
    finally:
        for file in files:
            await file.close()


@router.get("/reply-sends")
def list_reply_sends(resource_id: str | None = None, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    query = owned_query(db, SentMailRecord, project_id)
    if resource_id:
        source_record(db, project_id, resource_id)
        query = query.filter_by(resource_id=resource_id)
    return [send_payload(record) for record in query.order_by(SentMailRecord.created_at.desc()).limit(100).all()]


@router.post("/reply-sends/{send_id}/reconcile")
def reconcile_solution_reply(send_id: str, req: ReplySendRequest | None = None, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    return reconcile_reply(db, project_id, send_id, req)


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
    """List real Gmail labels; project members determine routing, never keyword rules."""
    _require_gmail_auth()
    labels = gmail_service.list_user_labels()
    names = [label['name'] for label in labels if label.get('name')]
    return {"provider": "gmail", "default_label": settings.gmail_label,
            "folders": names, "labels": names}


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


def _email_operation(operation):
    try:
        return operation()
    except PermissionError as exc:
        raise HTTPException(401, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/sync", status_code=202)
def sync_emails(project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> Dict[str, Any]:
    return start_email_sync(project_id, db)


@router.post("/sync-jobs", status_code=202)
def start_email_sync(project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    project = require_project(db, project_id)
    if not project.mail_label_name:
        raise HTTPException(422, "Hãy chọn nhãn Gmail cho dự án trước khi đồng bộ.")
    _require_gmail_auth()
    return start_job(project_id)


@router.get("/sync-jobs/current")
def current_email_sync(project_id: str = Depends(project_scope)):
    return job_status(project_id)


@router.post("/analyze", status_code=202)
def analyze_emails_endpoint(req: FetchEmailsRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> Dict[str, Any]:
    # Compatibility endpoint: project configuration determines routing, never arbitrary filters.
    return start_email_sync(project_id, db)


@router.post("/poll-now", status_code=202)
def trigger_email_poll_now(project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> Dict[str, Any]:
    return start_email_sync(project_id, db)


class EmailRouteRequest(BaseModel):
    message_id: str = Field(min_length=1, max_length=128)


@router.post("/route")
def route_email(req: EmailRouteRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    _require_gmail_auth()
    return _email_operation(lambda: route_project_email(db, project_id, req.message_id))


class EmailUrgencyUpdate(BaseModel):
    urgency: Urgency


@router.post("/processed/{email_id}/retry")
def retry_email(email_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    record = owned_query(db, EmailProcessedRecord, project_id).filter_by(id=email_id).first()
    if not record:
        raise HTTPException(404, "Không tìm thấy email trong dự án.")
    return _email_operation(lambda: retry_email_analysis(db, record))


@router.patch("/processed/{email_id}/urgency")
def update_email_urgency(req: EmailUrgencyUpdate, email_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    record = owned_query(db, EmailProcessedRecord, project_id).filter(EmailProcessedRecord.id == email_id).first()
    if not record:
        raise HTTPException(404, "Không tìm thấy email trong dự án.")
    if record.status in ("queued", "processing"):
        raise HTTPException(409, "Email đang phân tích; hãy chỉnh mức ưu tiên sau khi hoàn tất.")
    record.urgency = req.urgency
    db.commit()
    return email_payload(record)


@router.get("/processed/{email_id}/pdf/{attachment_index}")
def email_pdf(email_id: str, attachment_index: int, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    record = owned_query(db, EmailProcessedRecord, project_id).filter_by(id=email_id).first()
    pdfs = stored_email_pdfs(record) if record else []
    if attachment_index < 0 or attachment_index >= len(pdfs):
        raise HTTPException(404, "Không tìm thấy PDF đính kèm trong dự án.")
    metadata = pdfs[attachment_index]
    path = Path(metadata.get("file_path") or "").resolve()
    if not path.is_relative_to(resolve_path("data/email_attachments").resolve()) or not path.is_file():
        raise HTTPException(404, "Không tìm thấy file PDF đính kèm.")
    return FileResponse(path, filename=metadata["filename"], media_type="application/pdf", content_disposition_type="inline")


@router.get("/processed/{email_id}/pdf")
def email_pdf_first(email_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    return email_pdf(email_id, 0, project_id, db)


@router.get("/processed")
def list_processed_emails(
    page: Optional[int] = Query(None, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    folder: Optional[str] = None,
    sender_role: Optional[Literal["nội bộ", "khách"]] = None,
    urgency: Optional[Urgency] = None,
    project_id: str = Depends(project_scope), db: Session = Depends(get_db),
) -> Any:
    query = owned_query(db, EmailProcessedRecord, project_id).order_by(EmailProcessedRecord.processed_at.desc())
    if folder and folder.strip().upper() != "ALL":
        query = query.filter(EmailProcessedRecord.folder == folder.strip())
    if sender_role:
        query = query.filter(EmailProcessedRecord.sender_role == sender_role)
    if urgency:
        query = query.filter(EmailProcessedRecord.urgency == urgency)
    if page is not None:
        total = query.count()
        return {"items": [email_payload(record) for record in query.offset((page - 1) * page_size).limit(page_size).all()],
                "total": total, "page": page, "page_size": page_size, "total_pages": max(1, math.ceil(total / page_size))}
    return [email_payload(record) for record in query.limit(100).all()]


# Legacy keyword/wildcard rules have been replaced by project membership routing.
@router.get("/rules")
@router.post("/rules")
def retired_folder_rules():
    raise HTTPException(410, "Luật keyword/wildcard đã được bỏ. Chọn nhãn Gmail và thành viên trong cấu hình dự án.")


@router.delete("/rules/{rule_id}")
def retired_delete_folder_rule(rule_id: str):
    return retired_folder_rules()


# ------------------------------------------------------------------ Daily Digest Endpoints
@router.post("/daily-digest")
def get_daily_digest(req: DailyDigestRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Returns aggregated summary and categorization of daily emails.
    """
    digest = email_agent.generate_daily_digest(target_date=req.date, email_items=_digest_items(db, project_id, req.date))
    return digest


@router.post("/daily-digest/export-pdf")
def export_daily_digest_pdf(req: DailyDigestExportRequest, project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Generates an executive PDF report summarizing daily emails and saves it to data/documents.
    """
    digest = email_agent.generate_daily_digest(target_date=req.date, email_items=_digest_items(db, project_id, req.date))
    pdf_path = pdf_generator.generate_digest_pdf(
        target_date=digest["target_date"],
        digest_data=digest,
        output_filename=f"{project_id}-{uuid.uuid4()}.pdf",
    )
    return {
        "success": True,
        "filename": pdf_path.name,
        "download_url": f"/api/emails/daily-digest/download/{pdf_path.name}?project_id={project_id}",
        "target_date": digest["target_date"],
        "total_emails": digest["total_emails"],
        "urgent_count": digest["urgent_count"],
        "categories": {k: len(v) for k, v in digest["categories"].items()},
    }


@router.get("/daily-digest/download/{filename}")
def download_daily_digest_pdf(filename: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    """
    Downloads the generated Daily Email Digest PDF report.
    """
    safe_name = Path(filename).name
    other_project = any(safe_name.startswith(f"{pid}-") and pid != project_id for (pid,) in db.query(ProjectRecord.id).all())
    if safe_name != filename or other_project or (project_id != "legacy" and not safe_name.startswith(f"{project_id}-")):
        raise HTTPException(404, "Không tìm thấy báo cáo trong dự án.")
    pdf_file = Path("data/documents") / safe_name
    if not pdf_file.exists():
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file báo cáo PDF: {safe_name}")
    return FileResponse(
        path=str(pdf_file),
        media_type="application/pdf",
        filename=safe_name,
    )


def _digest_items(db: Session, project_id: str, target_date: Optional[str]) -> List[Dict[str, Any]]:
    records = owned_query(db, EmailProcessedRecord, project_id).all()
    date = target_date or datetime.now().strftime("%Y-%m-%d")
    return [{"id": r.id, "subject": r.subject, "sender_email": r.sender_email,
             "received_time": r.received_time, "folder": r.folder, "urgency": r.urgency,
             "sender_role": r.sender_role, "body": r.body or r.body_snippet or "",
             "has_attachments": r.has_attachments, "pdf_filename": r.pdf_filename, "pdf_summary": r.pdf_summary}
            for r in records if date in (r.received_time or "") or date == r.processed_at.strftime("%Y-%m-%d")]


class MailboxLabelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=225)


@router.get("/mailbox-labels")
def list_mailbox_labels():
    _require_gmail_auth()
    try:
        labels = gmail_service._execute_with_retry(lambda service: service.users().labels().list(userId="me").execute()).get("labels", [])
    except Exception as exc:
        raise HTTPException(502, "Không tải được nhãn Gmail.") from exc
    return [{"id": label["id"], "name": label["name"], "source": "gmail"} for label in labels]


@router.post("/mailbox-labels", status_code=201)
def create_mailbox_label(req: MailboxLabelCreate):
    _require_gmail_auth()
    name = req.name.strip()
    if not name:
        raise HTTPException(422, "Tên nhãn không được trống.")
    label_id = gmail_service.get_or_create_label(name)
    if not label_id:
        raise HTTPException(502, "Chưa tạo được nhãn Gmail; dự án chưa được lưu.")
    return {"id": label_id, "name": name, "source": "gmail"}
