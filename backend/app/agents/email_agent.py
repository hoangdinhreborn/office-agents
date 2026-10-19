from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import re

from app.integrations.gmail import gmail_service
from app.llm.ollama import chat_with_llm, extract_json_from_response, LLMResponse
from app.llm.prompts import SYSTEM_EMAIL_PROMPT
from app.schemas.email import EmailMessage


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
    """
    urgency = "Trung bình"
    for level in ["Khẩn cấp", "Cao", "Trung bình", "Thấp"]:
        if level.lower() in text.lower():
            urgency = level
            break

    # Check for issue needing solution
    has_issue = any(k in text.lower() for k in ["sự cố", "vấn đề", "giải pháp", "lỗi", "khắc phục", "issue", "problem"])
    issue_desc = None
    if has_issue:
        m = re.search(r"(?:Vấn đề cần giải quyết|Sự cố|Vấn đề).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)", text, re.IGNORECASE | re.DOTALL)
        if m:
            issue_desc = m.group(1).strip()

    # Check for calendar event
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


class EmailAgent:
    """
    Agent responsible for monitoring, filtering, and analyzing Gmail emails
    from specific folders and designated senders.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model

    def fetch_and_analyze(
        self,
        folder_name: Optional[str] = None,
        allowed_senders: Optional[List[str]] = None,
        limit: int = 5,
        unread_only: bool = False,
    ) -> List[EmailAnalysisResult]:
        """
        Fetches emails from Gmail label with sender filtering,
        then analyzes each email with DeepSeek-R1.
        """
        emails = gmail_service.fetch_unread_emails(
            label=folder_name or "INBOX",
            allowed_senders=allowed_senders,
            limit=limit,
            unread_only=unread_only,
        )

        results: List[EmailAnalysisResult] = []
        for msg in emails:
            analyzed = self.analyze_single_email(msg)
            results.append(analyzed)

        return results

    def analyze_single_email(self, msg: EmailMessage) -> EmailAnalysisResult:
        prompt = (
            f"Thông tin email:\n"
            f"- Nhãn / Hộp thư: {msg.folder}\n"
            f"- Người gửi: {msg.sender_name} <{msg.sender_email}>\n"
            f"- Tiêu đề: {msg.subject}\n"
            f"- Thời gian nhận: {msg.received_time}\n"
            f"- File đính kèm: {', '.join([a.filename for a in msg.attachments]) if msg.attachments else 'Không có'}\n\n"
            f"Nội dung email:\n"
            f"```text\n{msg.body}\n```\n\n"
            f"Hãy phân tích email này theo đúng cấu trúc chuẩn của Trợ lý Email."
        )

        response: LLMResponse = chat_with_llm(
            message=prompt,
            system_prompt=SYSTEM_EMAIL_PROMPT,
            model=self.model,
        )

        parsed = parse_email_analysis(response.content)

        return EmailAnalysisResult(
            id=msg.id,
            message_id=msg.id,
            subject=msg.subject,
            sender=f"{msg.sender_name} <{msg.sender_email}>",
            received_time=msg.received_time,
            summary=response.content,
            urgency=parsed["urgency"],
            has_issue_to_solve=parsed["has_issue"],
            issue_description=parsed["issue_desc"],
            has_calendar_event=parsed["has_cal"],
            calendar_hint=parsed["cal_hint"],
            full_analysis=response.content,
            thinking_process=response.thought,
        )

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
