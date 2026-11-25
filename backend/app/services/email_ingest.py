"""Project-scoped Gmail ingestion shared by explicit sync and the poller."""
import json
import logging
from pathlib import Path
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import resolve_path
from app.database.models import EmailProcessedRecord, ProjectMemberRecord, ProjectRecord
from app.integrations.gmail import gmail_service
from app.schemas.email import EmailMessage
from app.services.email_analysis import analyze_email_context
from app.services.projects import require_project

logger = logging.getLogger(__name__)


def _json(value: str | None, default):
    return json.loads(value) if value else default


def stored_email_pdfs(record: EmailProcessedRecord) -> list[dict]:
    value = _json(record.pdf_metadata_json, None)
    if value is None:
        return []
    # Old rows stored one PDF object; preserve them without rewriting their files.
    return value if isinstance(value, list) else [value]


def email_payload(record: EmailProcessedRecord, include_pages: bool = True) -> dict:
    pdfs = []
    for index, item in enumerate(stored_email_pdfs(record)):
        pdf = {key: value for key, value in item.items() if key not in ("file_path", "chunks") and (include_pages or key != "pages")}
        pdf.setdefault("pages", [])
        pdf["file_available"] = bool(item.get("file_path"))
        pdf["url"] = f"/api/emails/processed/{record.id}/pdf/{index}?project_id={record.project_id}"
        pdfs.append(pdf)
    return {"id": record.id, "source": record.source, "provider_message_id": record.provider_message_id,
            "subject": record.subject, "sender": record.sender, "sender_name": record.sender_name,
            "sender_email": record.sender_email, "sender_role": record.sender_role,
            "received_time": record.received_time, "folder": record.folder,
            "urgency": record.urgency or "Trung bình", "summary": record.summary or record.full_analysis or "", "full_analysis": record.full_analysis or "",
            "body": record.body or "", "issue_description": record.issue_description,
            "calendar_hint": record.calendar_hint, "has_issue_to_solve": bool(record.has_issue_to_solve),
            "has_calendar_event": bool(record.has_calendar_event), "has_attachments": bool(record.has_attachments),
            "pdf_attachments_count": record.pdf_attachments_count or 0,
            "pdf_filename": record.pdf_filename, "pdf_summary": record.pdf_summary,
            "attached_pdfs": pdfs,
            "solution_options": _json(record.solution_options_json, []),
            "constraint_history": _json(record.constraint_history_json, []),
            "solution_revision": record.solution_revision or 0,
            "selected_solution_id": record.selected_solution_id,
            "replied_at": record.replied_at.isoformat() + "Z" if record.replied_at else None,
            "schedule_draft": _json(record.schedule_draft_json, None),
            "calendar_events_count": record.calendar_events_count or 0,
            "status": record.status, "processing_stage": record.processing_stage, "processing_error": record.error_message,
            "processed_at": record.processed_at.isoformat() if record.processed_at else None}


def saved_email_context(record: EmailProcessedRecord) -> str:
    context = (f"Tiêu đề: {record.subject}\nNgười gửi: {record.sender}\n"
               f"Thời gian nhận: {record.received_time}\nNội dung:\n{record.body or record.body_snippet or ''}")
    pdfs = stored_email_pdfs(record)
    if not pdfs and record.pdf_summary:
        context += f"\nPDF từ dữ liệu cũ (chỉ còn bản tóm tắt, không có văn bản gốc theo trang):\n{record.pdf_summary}"
    for pdf in pdfs:
        if pdf.get("warning"):
            context += f"\nLưu ý khi đọc PDF {pdf['filename']}: {pdf['warning']}\n"
        context += f"\nPDF đính kèm: {pdf['filename']}\n" + "\n\n".join(
            f"--- {pdf['filename']} | Trang {page['page_number']} ---\n{page['text']}" for page in pdf.get("pages", [])
        )
    return context


def _analyze_saved_record(db: Session, record: EmailProcessedRecord):
    def progress(message):
        record.processing_stage = message
        db.commit()
    analysis, _thought, map_reduce = analyze_email_context(saved_email_context(record), progress=progress)
    if map_reduce:
        pdfs = stored_email_pdfs(record)
        for pdf in pdfs:
            pdf["is_map_reduce"] = True
        record.pdf_metadata_json = json.dumps(pdfs, ensure_ascii=False) if pdfs else None
    options, draft = analysis.proposals()
    record.summary = analysis.markdown()
    record.full_analysis = record.summary
    record.urgency = analysis.urgency
    record.has_issue_to_solve = analysis.has_issue_to_solve
    record.has_calendar_event = analysis.has_calendar_event or bool(draft)
    record.issue_description = analysis.issue_description
    record.calendar_hint = analysis.calendar_hint
    record.solution_options_json = json.dumps(options, ensure_ascii=False)
    record.solution_revision = (record.solution_revision or 0) + 1
    record.schedule_draft_json = json.dumps(draft, ensure_ascii=False) if draft else None
    if draft:
        from app.services.calendar_workflow import add_drafts
        add_drafts(db, record.project_id, [draft], resource_id=record.id)
    record.solution_generated = bool(options)
    record.status = "processed"
    record.processing_stage = "Đã phân tích xong"
    record.error_message = None
    db.commit()
    # Refresh the derived memory after a successful analysis, including poller
    # work when no browser is open. A report-file error must not fail the email.
    from fastapi import HTTPException
    from app.services.daily_overview import daily_overview
    try:
        daily_overview(db, record.project_id)
    except (OSError, HTTPException):
        logger.warning("Chưa cập nhật được báo cáo ngày; sẽ tạo lại khi mở dự án hoặc chat.")


def _extract_saved_pdfs(db: Session, record: EmailProcessedRecord):
    from app.services.document_processing import extract_pdf_context
    pdfs = stored_email_pdfs(record)
    failed = False
    for pdf in pdfs:
        if any(page.get("text", "").strip() for page in pdf.get("pages", [])) and not pdf.get("extraction_error"):
            continue
        try:
            path = Path(pdf.get("file_path") or "").resolve()
            if not path.is_relative_to(resolve_path("data/email_attachments").resolve()) or not path.is_file():
                raise ValueError("Không có file PDF gốc.")
            extracted = extract_pdf_context(path.read_bytes(), pdf["filename"])
            pdf.update({"total_pages": extracted.pdf.total_pages, "is_ocr": extracted.pdf.ocr_used,
                        "ocr_pages": extracted.pdf.ocr_pages, "pages": extracted.pages, "chunks": extracted.chunks,
                        "warning": extracted.pdf.warning, "extraction_error": False})
            if not extracted.pdf.full_text.strip():
                raise ValueError("Chưa có văn bản để phân tích.")
        except Exception:
            failed = True
            pdf["extraction_error"] = True
            pdf["warning"] = "Chưa trích xuất được PDF này. Kiểm tra file gốc và cấu hình OCR rồi phân tích lại."
    record.pdf_metadata_json = json.dumps(pdfs, ensure_ascii=False) if pdfs else None
    db.commit()
    if failed or len(pdfs) != record.pdf_attachments_count:
        raise ValueError("Chưa đọc đủ PDF đính kèm; không phân tích thiếu một phần ngữ cảnh email.")


def retry_email_analysis(db: Session, record: EmailProcessedRecord):
    claimed = db.query(EmailProcessedRecord).filter_by(id=record.id, status="error").update({"status": "processing"})
    if not claimed:
        db.rollback()
        raise ValueError("Email không ở trạng thái lỗi hoặc đang được xử lý ở lượt khác.")
    db.commit()
    try:
        _extract_saved_pdfs(db, record)
        _analyze_saved_record(db, record)
    except Exception:
        db.rollback()
        record.status = "error"
        record.error_message = "Phân tích lại thất bại. Kiểm tra PDF/OCR và provider; nội dung đã lưu được giữ nguyên. Chưa gửi thư hoặc tạo lịch."
        db.commit()
        raise RuntimeError(record.error_message) from None
    return email_payload(record)


def _queue_email(db: Session, project: ProjectRecord, msg: EmailMessage, sender_role: str | None):
    require_project(db, project.id)
    identity = {"project_id": project.id, "source": "gmail", "provider_message_id": msg.id}
    if db.query(EmailProcessedRecord).filter_by(**identity).first():
        return None
    record = EmailProcessedRecord(
        id=str(uuid4()), **identity, subject=msg.subject, body=msg.body, body_snippet=(msg.body or "")[:1000],
        sender_email=msg.sender_email, sender_name=msg.sender_name,
        sender=f"{msg.sender_name} <{msg.sender_email}>" if msg.sender_name else msg.sender_email,
        sender_role=sender_role, received_time=msg.received_time, folder=project.mail_label_name,
        has_attachments=msg.has_attachments, pdf_attachments_count=sum(1 for item in msg.attachments if item.is_pdf),
        status="queued", processing_stage="Đang lưu nội dung và PDF gốc",
    )
    db.add(record)
    try:
        db.flush()
        pdfs = []
        for index, attachment in enumerate(item for item in msg.attachments if item.is_pdf):
            path = resolve_path(f"data/email_attachments/{project.id}/{record.id}-{index}.pdf")
            if attachment.data:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(attachment.data)
            pdfs.append({"filename": Path(attachment.filename).name, "file_path": str(path) if attachment.data else None,
                         "file_size": len(attachment.data), "total_pages": 0, "is_ocr": False,
                         "is_map_reduce": False, "pages": [], "chunks": [], "warning": None})
        record.pdf_filename = pdfs[0]["filename"] if pdfs else None
        record.pdf_metadata_json = json.dumps(pdfs, ensure_ascii=False) if pdfs else None
        record.processing_stage = "Đang chờ đến lượt phân tích"
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.query(EmailProcessedRecord).filter_by(**identity).first():
            return None
        raise
    return record


def _process_queued(db: Session, record: EmailProcessedRecord):
    claimed = db.query(EmailProcessedRecord).filter_by(id=record.id, status="queued").update(
        {"status": "processing", "processing_stage": "Đang đọc PDF/OCR"})
    db.commit()
    if not claimed:
        return False
    try:
        _extract_saved_pdfs(db, record)
        _analyze_saved_record(db, record)
    except Exception:
        db.rollback()
        record.status = "error"
        record.processing_stage = "Phân tích thất bại"
        record.error_message = "Không hoàn tất phân tích email/PDF. Nội dung đã nhận được giữ lại; chưa tạo lịch hoặc gửi thư."
        db.commit()
        logger.warning("Email processing failed project_id=%s resource_id=%s", record.project_id, record.id)
        raise
    return True


def _routing_state(db: Session):
    projects = db.query(ProjectRecord).filter(ProjectRecord.deleted_at.is_(None)).all()
    members = db.query(ProjectMemberRecord).filter(ProjectMemberRecord.project_id.in_([p.id for p in projects])).all()
    by_sender: dict[str, list[ProjectMemberRecord]] = {}
    for member in members:
        by_sender.setdefault(member.email.strip().lower(), []).append(member)
    return projects, by_sender


def _project_labels(projects: list[ProjectRecord]) -> dict[str, str]:
    labels = gmail_service.list_user_labels()
    result = {}
    for project in projects:
        label = next((item for item in labels if item.get("id") == project.mail_label_id or item.get("name") == project.mail_label_name), None)
        if label:
            result[project.id] = label["id"]
    return result


def sync_project_emails(db: Session, project_id: str, *, limit: int = 20, progress=None) -> dict:
    project = require_project(db, project_id)
    if not project.mail_label_name:
        raise ValueError("Dự án chưa được gắn nhãn Gmail.")
    if not gmail_service.is_authenticated():
        raise PermissionError("Cần đăng nhập Gmail với quyền đọc và gắn nhãn (gmail.modify).")
    projects, by_sender = _routing_state(db)
    label_ids = _project_labels(db.query(ProjectRecord).all())
    if project.id not in label_ids:
        raise ValueError("Không tìm thấy nhãn Gmail của dự án; chọn hoặc tạo lại nhãn trước khi đồng bộ.")
    result = {"total_checked": 0, "new_processed": 0, "already_processed": 0, "failed": 0,
              "ambiguous_sender_ids": [], "ambiguous_messages": [], "errors": [], "events_scheduled": 0}
    project_members = [email for email, members in by_sender.items() if any(member.project_id == project.id for member in members)]

    known_ids = {value for (value,) in db.query(EmailProcessedRecord.provider_message_id).filter_by(project_id=project_id, source="gmail").all()}
    def report():
        if progress:
            progress(result.copy())
    def process(rows):
        for record in rows:
            try:
                if _process_queued(db, record):
                    result["new_processed"] += 1
            except Exception:
                result["failed"] += 1
                result["errors"].append({"message_id": record.provider_message_id, "step": "analysis", "message": "Phân tích email/PDF thất bại; xem trạng thái tài nguyên."})
            report()
    # Persisted queued mail survives a backend restart; failed inference is never replayed automatically.
    process(db.query(EmailProcessedRecord).filter_by(project_id=project_id, status="queued").order_by(EmailProcessedRecord.processed_at).all())

    def enqueue(msg, queued):
        if msg.id in known_ids:
            return
        known_ids.add(msg.id)
        result["total_checked"] += 1
        members = by_sender.get(msg.sender_email.strip().lower(), [])
        member = next((item for item in members if item.project_id == project.id), None)
        existing_project_labels = {pid for pid, label_id in label_ids.items() if label_id in msg.label_ids}
        if project.id not in existing_project_labels:
            # An existing project label is the user's routing decision.
            if existing_project_labels or not member:
                return
            if len(members) > 1:
                result["ambiguous_sender_ids"].append(msg.id)
                result["ambiguous_messages"].append({"message_id": msg.id, "sender_email": msg.sender_email,
                    "subject": msg.subject, "candidate_project_ids": [item.project_id for item in members]})
                return
            if not gmail_service.add_label_to_message(msg.id, project.mail_label_name, label_ids[project.id]):
                result["failed"] += 1
                result["errors"].append({"message_id": msg.id, "step": "label", "message": "Không gắn được nhãn Gmail; email chưa được nhập."})
                return
        try:
            record = _queue_email(db, project, msg, member.role if member else "khách")
        except Exception:
            db.rollback()
            result["failed"] += 1
            result["errors"].append({"message_id": msg.id, "step": "save", "message": "Chưa lưu được nội dung/PDF; email chưa được đưa vào phân tích."})
            return
        if record:
            queued.append(record)
        else:
            result["already_processed"] += 1
        report()

    sources = [(project.mail_label_name, label_ids[project.id], None), ("INBOX", "INBOX", project_members)]
    for label, source_label_id, senders in sources:
        if senders == []:
            continue
        page_token, visited_tokens = None, set()
        while True:
            queued = []
            _, next_page_token = gmail_service.fetch_email_page(
                label=label, allowed_senders=senders, limit=limit, unread_only=False,
                page_token=page_token, label_id=source_label_id, skip_message_ids=known_ids,
                on_message=lambda msg: enqueue(msg, queued),
            )
            process(queued)
            page_token = next_page_token
            if not page_token:
                break
            if page_token in visited_tokens:
                raise RuntimeError("Gmail trả cursor phân trang lặp; lượt đồng bộ đã dừng.")
            visited_tokens.add(page_token)
    return result


def route_project_email(db: Session, project_id: str, message_id: str) -> dict:
    project = require_project(db, project_id)
    if not project.mail_label_name:
        raise ValueError("Dự án chưa được gắn nhãn Gmail.")
    message = gmail_service.get_message_identity(message_id)
    member = db.query(ProjectMemberRecord).filter_by(project_id=project_id, email=message["sender_email"]).first()
    if not member:
        raise ValueError("Người gửi không phải thành viên của dự án đã chọn.")
    projects, _ = _routing_state(db)
    label_ids = _project_labels(db.query(ProjectRecord).all())
    existing = {pid for pid, label_id in label_ids.items() if label_id in message["label_ids"]}
    if existing and project_id not in existing:
        raise ValueError("Thư đã có nhãn dự án khác. Hãy đổi nhãn trên Gmail trước khi định tuyến lại.")
    if project_id not in label_ids:
        raise ValueError("Không tìm thấy nhãn Gmail của dự án.")
    if not gmail_service.add_label_to_message(message_id, project.mail_label_name, label_ids[project_id]):
        raise RuntimeError("Không gắn được nhãn Gmail.")
    return {"success": True, "message_id": message["message_id"], "project_id": project_id}
