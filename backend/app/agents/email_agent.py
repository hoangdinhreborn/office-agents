from dataclasses import dataclass
from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional
import re
from zoneinfo import ZoneInfo

from app.integrations.gmail import gmail_service
from app.llm.ollama import chat_with_llm, extract_json_from_response, LLMResponse
from app.schemas.email import EmailMessage

logger = logging.getLogger(__name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


@dataclass
class EmailAnalysisResult:
    id: str
    message_id: str
    subject: str
    sender: str
    received_time: str
    summary: str
    urgency: str
    has_issue_to_solve: bool
    issue_description: Optional[str]
    has_calendar_event: bool
    calendar_hint: Optional[str]
    full_analysis: str
    thinking_process: str
    folder: str = "INBOX"
    pdf_filename: Optional[str] = None
    pdf_summary: Optional[str] = None


@dataclass
class SentEmailResult:
    success: bool
    to: List[str]
    subject: str
    body: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    thinking_process: str = ""


EMAIL_COMPOSE_PROMPT = """Bạn là Trợ Lý Soạn Thảo Email Chuyên Nghiệp (Email Composer Agent).
Dựa trên yêu cầu của người dùng, hãy trích xuất danh sách email người nhận (to), tiêu đề (subject) và soạn nội dung email (body) lịch sự, chuyên nghiệp bằng tiếng Việt.

Trả về KẾT QUẢ DUY NHẤT ở định dạng JSON hợp lệ trong khối ```json ... ```:
```json
{
  "to": ["recipient@example.com"],
  "subject": "Tiêu đề email ngắn gọn, rõ ràng",
  "body": "Nội dung email đầy đủ, lịch sự và chuyên nghiệp..."
}
```"""


def parse_email_analysis(text: str) -> dict:
    """
    Parses urgency, issues, and calendar hints from the email analysis output.
    Uses targeted anchored regex to prevent false positive 'Khẩn cấp' triggers.
    """
    urgency = "Trung bình"
    # 1. First look for explicit "Mức độ khẩn cấp: [Thấp/Trung bình/Cao/Khẩn cấp]"
    urgency_match = re.search(
        r"(?:mức độ khẩn cấp|độ khẩn cấp|urgency)\s*[:\-–]\s*(?:\[|\*\*)?\s*(Khẩn cấp|Cao|Trung bình|Thấp|Low|Medium|High|Urgent)\b",
        text,
        re.IGNORECASE,
    )
    if urgency_match:
        val = urgency_match.group(1).capitalize()
        mapping = {
            "Low": "Thấp",
            "Medium": "Trung bình",
            "High": "Cao",
            "Urgent": "Khẩn cấp",
            "Khẩn cấp": "Khẩn cấp",
            "Cao": "Cao",
            "Trung bình": "Trung bình",
            "Thấp": "Thấp",
        }
        urgency = mapping.get(val, "Trung bình")
    else:
        # Fallback: remove header templates like "(Thấp / Trung bình / Cao / Khẩn cấp)"
        cleaned_text = re.sub(r"\(.*?Khẩn cấp.*?\)", "", text, flags=re.IGNORECASE)
        cleaned_text = re.sub(r"\[.*?Khẩn cấp.*?\]", "", cleaned_text, flags=re.IGNORECASE)
        cleaned_text = re.sub(r"Mức độ khẩn cấp\s*\(.*?\)", "", cleaned_text, flags=re.IGNORECASE)

        m_urgent = re.search(
            r"(?:🚨|🔥)?\s*(?:mức\s+)?(Khẩn cấp|Cao|Trung bình|Thấp)\s*(?:[:\-–\n]|$)",
            cleaned_text,
            re.IGNORECASE,
        )
        if m_urgent:
            urgency = m_urgent.group(1).capitalize()
        else:
            urgency = "Trung bình"

    # 3. Check for issue needing solution
    has_issue = any(k in text.lower() for k in ["sự cố", "vấn đề", "giải pháp", "lỗi", "khắc phục", "issue", "problem"])
    issue_desc = None
    if has_issue:
        m = re.search(r"(?:Vấn đề cần giải quyết|Sự cố|Vấn đề).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)", text, re.IGNORECASE | re.DOTALL)
        if m:
            issue_desc = m.group(1).strip()

    # 4. Check for calendar event
    has_cal = any(k in text.lower() for k in ["họp", "lịch", "cuộc họp", "meeting", "hạn chót", "deadline", "nhắc hẹn"])
    cal_hint = None
    if has_cal:
        m = re.search(r"(?:Lịch họp|Hạn chót|Thời gian|Cuộc họp).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)", text, re.IGNORECASE | re.DOTALL)
        if m:
            cal_hint = m.group(1).strip()

    return {
        "urgency": urgency,
        "has_issue": has_issue,
        "issue_desc": issue_desc,
        "has_cal": has_cal,
        "cal_hint": cal_hint,
    }


def route_and_apply_folder(msg: EmailMessage, db: Optional[Any] = None) -> str:
    """Legacy analysis helper has no authority to apply labels; ingestion owns project routing."""
    return msg.folder or "INBOX"


class EmailAgent:
    """
    Agent responsible for monitoring, filtering, and analyzing Gmail emails
    from specific folders and designated senders.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model

    @property
    def last_next_page_token(self) -> Optional[str]:
        return getattr(gmail_service, "last_next_page_token", None)

    def fetch_and_analyze(
        self,
        folder_name: Optional[str] = None,
        allowed_senders: Optional[List[str]] = None,
        limit: int = 5,
        unread_only: bool = False,
        page_token: Optional[str] = None,
    ) -> List[EmailAnalysisResult]:
        """
        Fetches emails from Gmail label with sender filtering,
        then analyzes each email with DeepSeek-R1.
        Supports page_token for batch pagination.
        """
        emails = gmail_service.fetch_unread_emails(
            label=folder_name or "INBOX",
            allowed_senders=allowed_senders,
            limit=limit,
            unread_only=unread_only,
            page_token=page_token,
        )

        results: List[EmailAnalysisResult] = []
        for msg in emails:
            analyzed = self.analyze_single_email(msg)
            results.append(analyzed)

        return results

    def analyze_single_email(self, msg: EmailMessage, summarize_pdf_attachment: bool = True) -> EmailAnalysisResult:
        # Standalone analysis remains read-only. Project persistence/routing uses email_ingest.
        from app.services.email_analysis import analyze_email_context
        context = f"Tiêu đề: {msg.subject}\nNgười gửi: {msg.sender_name} <{msg.sender_email}>\nThời gian nhận: {msg.received_time}\nNội dung:\n{msg.body}"
        pdf_filename = None
        if summarize_pdf_attachment:
            pdfs = [attachment for attachment in msg.attachments if attachment.is_pdf]
            for attachment in pdfs:
                from app.services.document_processing import extract_pdf_context
                extracted = extract_pdf_context(attachment.data, attachment.filename)
                pdf_filename = attachment.filename
                context += f"\nPDF {attachment.filename}:\n{extracted.pdf.full_text}"
        analysis, thinking, _map_reduce = analyze_email_context(context, self.model)
        return EmailAnalysisResult(
            id=msg.id, message_id=msg.id, subject=msg.subject,
            sender=f"{msg.sender_name} <{msg.sender_email}>", received_time=msg.received_time,
            summary=analysis.markdown(), full_analysis=analysis.markdown(), thinking_process=thinking,
            urgency=analysis.urgency, has_issue_to_solve=analysis.has_issue_to_solve,
            issue_description=analysis.issue_description, has_calendar_event=analysis.has_calendar_event,
            calendar_hint=analysis.calendar_hint, folder=msg.folder, pdf_filename=pdf_filename,
        )

    def generate_daily_digest(
        self,
        target_date: Optional[str] = None,
        email_items: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Aggregates and summarizes all emails received on target_date,
        grouping them by sender relationship.
        Generates actionable executive summary and task list.
        """
        now_vn = datetime.now(tz=VN_TZ)
        date_str = target_date or now_vn.strftime("%Y-%m-%d")

        # Collect emails if not provided
        items = list(email_items or [])
        if email_items is None:
            from app.database.database import SessionLocal
            from app.database.models import EmailProcessedRecord

            db = SessionLocal()
            try:
                records = db.query(EmailProcessedRecord).all()
                for r in records:
                    # Match date string in received_time or processed_at
                    r_date = r.processed_at.strftime("%Y-%m-%d") if r.processed_at else ""
                    if date_str in (r.received_time or "") or date_str in r_date:
                        items.append({
                            "id": r.id,
                            "subject": r.subject,
                            "sender_email": r.sender_email,
                            "sender_name": r.sender_email,
                            "received_time": r.received_time or r_date,
                            "folder": r.folder or "INBOX",
                            "urgency": r.urgency or "Trung bình",
                            "sender_role": r.sender_role,
                            "has_attachments": r.has_attachments,
                            "pdf_filename": r.pdf_filename,
                            "pdf_summary": r.pdf_summary,
                            "body": r.body_snippet or r.subject,
                        })
                # If no records matched exact date, take recent records as fallback
                if not items and records:
                    for r in records[-30:]:
                        items.append({
                            "id": r.id,
                            "subject": r.subject,
                            "sender_email": r.sender_email,
                            "sender_name": r.sender_email,
                            "received_time": r.received_time or date_str,
                            "folder": r.folder or "INBOX",
                            "urgency": r.urgency or "Trung bình",
                            "sender_role": r.sender_role,
                            "has_attachments": r.has_attachments,
                            "pdf_filename": r.pdf_filename,
                            "pdf_summary": r.pdf_summary,
                            "body": r.body_snippet or r.subject,
                        })
            finally:
                db.close()

        # Keep the existing digest response shape for its PDF consumer; groups now use sender relationship.
        categories: Dict[str, List[Dict[str, Any]]] = {"nội bộ": [], "khách": [], "Chưa gán": []}

        urgent_count = 0
        pdf_count = 0

        for em in items:
            cat = em.get("sender_role") or "Chưa gán"
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(em)

            if em.get("urgency") == "Khẩn cấp":
                urgent_count += 1
            if em.get("pdf_filename") or em.get("has_attachments"):
                pdf_count += 1

        # Generate overview summary
        summary_points = [
            f"Trong ngày {date_str}, hệ thống đã tiếp nhận và xử lý tổng cộng {len(items)} email.",
        ]
        cat_summaries = []
        for c_name, c_list in categories.items():
            if c_list:
                cat_summaries.append(f"{len(c_list)} email thuộc nhóm '{c_name}'")
        if cat_summaries:
            summary_points.append(f"Cụ thể: {', '.join(cat_summaries)}.")

        if urgent_count > 0:
            summary_points.append(f"⚠️ Cảnh báo: Có {urgent_count} email ở mức độ KHẨN CẤP cần kiểm tra và giải quyết ngay lập tức.")
        if pdf_count > 0:
            summary_points.append(f"📄 Có {pdf_count} email đính kèm tệp tài liệu PDF đã được AI bóc tách nội dung.")

        executive_summary = "\n".join(summary_points)

        action_items = [f"Rà soát email: {em.get('subject', '')}" for em in items
                        if em.get("has_issue_to_solve") or em.get("has_calendar_event")]
        if not action_items:
            action_items.append("Chưa có hành động được ghi nhận từ các email trong ngày.")

        return {
            "target_date": date_str,
            "total_emails": len(items),
            "urgent_count": urgent_count,
            "pdf_count": pdf_count,
            "categories": categories,
            "executive_summary": executive_summary,
            "action_items": action_items,
        }

    def compose_and_send(
        self,
        user_request: str,
        to: Optional[List[str]] = None,
        subject: Optional[str] = None,
        body: Optional[str] = None,
    ) -> SentEmailResult:
        """
        Drafts an email using the LLM if subject/body/to are not fully specified,
        then sends it via GmailService.
        """
        thought = ""
        if not to or not subject or not body:
            res: LLMResponse = chat_with_llm(
                message=f"Yêu cầu gửi email của người dùng:\n{user_request}",
                system_prompt=EMAIL_COMPOSE_PROMPT,
                model=self.model,
            )
            thought = res.thought or ""
            draft = extract_json_from_response(res.content) or {}
            if isinstance(draft, dict):
                if not to:
                    raw_to = draft.get("to")
                    if isinstance(raw_to, str):
                        to = [s.strip() for s in raw_to.split(",") if s.strip()]
                    elif isinstance(raw_to, list):
                        to = [str(s).strip() for s in raw_to if str(s).strip()]
                if not subject:
                    subject = draft.get("subject")
                if not body:
                    body = draft.get("body")

        # Fallback regex email extraction if LLM missed "to"
        if not to:
            found_emails = re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", user_request)
            to = list(dict.fromkeys(found_emails))

        subject = subject or "Thông báo từ Trợ lý AI"
        body = body or user_request

        if not to:
            return SentEmailResult(
                success=False,
                to=[],
                subject=subject,
                body=body,
                error="Không tìm thấy địa chỉ email người nhận hợp lệ trong yêu cầu.",
                thinking_process=thought,
            )

        try:
            sent_info = gmail_service.send_email(
                to=to,
                subject=subject,
                body=body,
            )
            return SentEmailResult(
                success=True,
                to=to,
                subject=subject,
                body=body,
                message_id=sent_info.get("message_id"),
                thinking_process=thought,
            )
        except Exception as exc:
            return SentEmailResult(
                success=False,
                to=to,
                subject=subject,
                body=body,
                error=str(exc),
                thinking_process=thought,
            )


email_agent = EmailAgent()
