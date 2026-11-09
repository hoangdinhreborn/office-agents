from dataclasses import dataclass
from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional
import re
from zoneinfo import ZoneInfo

from app.integrations.gmail import gmail_service
from app.llm.ollama import chat_with_llm, extract_json_from_response, LLMResponse
from app.llm.prompts import SYSTEM_EMAIL_PROMPT
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
    category: str = "Khác"
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
    Parses urgency, category, issues, and calendar hints from the email analysis output.
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

    # 2. Category parsing
    category = "Khác"
    cat_match = re.search(
        r"(?:danh mục|phân loại|category)\s*[:\-–]\s*(?:\[|\*\*)?\s*([A-Za-zÀ-ỹ\s]{3,30})(?:\]|\*\*|\n|$)",
        text,
        re.IGNORECASE,
    )
    if cat_match:
        c_raw = cat_match.group(1).strip()
        c_low = c_raw.lower()
        if any(w in c_low for w in ["bài", "tập", "assignment", "lab", "đồ án", "báo cáo"]):
            category = "Nộp bài"
        elif any(w in c_low for w in ["học vụ", "hành chính", "đào tạo", "thông báo", "lịch thi"]):
            category = "Học vụ"
        elif any(w in c_low for w in ["thắc mắc", "hỏi", "tư vấn", "hỗ trợ", "giải đáp"]):
            category = "Thắc mắc"
        elif any(w in c_low for w in ["khẩn", "sự cố", "lỗi", "sập"]):
            category = "Khẩn cấp"
        elif any(w in c_low for w in ["công việc", "dự án", "họp", "hợp đồng"]):
            category = "Công việc"
        else:
            category = c_raw.title()
    else:
        t_low = text.lower()
        if any(w in t_low for w in ["nộp bài", "bài tập", "assignment", "lab", "đồ án", "báo cáo"]):
            category = "Nộp bài"
        elif any(w in t_low for w in ["thông báo", "học vụ", "thời khóa biểu", "lịch thi", "học phí"]):
            category = "Học vụ"
        elif any(w in t_low for w in ["thắc mắc", "hỏi", "nhờ thầy", "cần giúp", "giải đáp"]):
            category = "Thắc mắc"
        elif any(w in t_low for w in ["sự cố", "sập server", "nghiêm trọng", "hỏa tốc"]):
            category = "Khẩn cấp"
        elif any(w in t_low for w in ["công việc", "cuộc họp", "dự án", "hợp đồng"]):
            category = "Công việc"

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
        "category": category,
        "has_issue": has_issue,
        "issue_desc": issue_desc,
        "has_cal": has_cal,
        "cal_hint": cal_hint,
    }


def match_folder_rule(msg: EmailMessage, rules: List[Any]) -> Optional[Any]:
    """
    Evaluates email against user-defined folder rules (sender role/pattern and keywords).
    """
    sender_low = (msg.sender_email or "").lower()
    sender_name_low = (msg.sender_name or "").lower()
    subject_low = (msg.subject or "").lower()
    body_low = (msg.body or "").lower()

    for rule in rules:
        senders = rule.get_senders() if hasattr(rule, "get_senders") else rule.get("senders", [])
        keywords = rule.get_keywords() if hasattr(rule, "get_keywords") else rule.get("keywords", [])

        # Match senders
        sender_matched = False
        if senders:
            for pat in senders:
                pat_clean = pat.strip().lower()
                if not pat_clean:
                    continue
                if pat_clean.startswith("*@"):
                    domain = pat_clean[2:]
                    if sender_low.endswith("@" + domain) or domain in sender_low:
                        sender_matched = True
                        break
                elif pat_clean in sender_low or pat_clean in sender_name_low:
                    sender_matched = True
                    break

        # Match keywords
        keyword_matched = False
        if keywords:
            for kw in keywords:
                kw_clean = kw.strip().lower()
                if not kw_clean:
                    continue
                if kw_clean in subject_low or kw_clean in body_low:
                    keyword_matched = True
                    break

        if (senders and sender_matched) or (keywords and keyword_matched):
            return rule

    return None


def route_and_apply_folder(msg: EmailMessage, db: Optional[Any] = None) -> str:
    """
    Determines destination folder for an email based on DB rules, or falls back to INBOX.
    Also syncs to Gmail API label if enabled and authenticated.
    """
    from app.database.database import SessionLocal
    from app.database.models import EmailFolderRuleRecord

    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    target_folder = msg.folder or "INBOX"
    should_sync_gmail = False

    try:
        rules = db.query(EmailFolderRuleRecord).order_by(EmailFolderRuleRecord.created_at.desc()).all()
        matched = match_folder_rule(msg, rules)
        if matched:
            target_folder = matched.folder_name
            should_sync_gmail = matched.auto_apply_gmail_label
    except Exception as exc:
        logger.debug(f"Lỗi khi tra cứu rules: {exc}")
    finally:
        if close_db:
            db.close()

    # Synchronize to Gmail Label if message came from Gmail
    if should_sync_gmail and msg.id and msg.id.startswith("gmail-"):
        try:
            if gmail_service.is_authenticated():
                gmail_service.add_label_to_message(msg.id, target_folder)
        except Exception as exc:
            logger.debug(f"Không thể sync label lên Gmail: {exc}")

    return target_folder


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
        # 1. Determine folder routing
        target_folder = route_and_apply_folder(msg)
        msg.folder = target_folder

        # 2. Summarize attached PDF if present
        pdf_filename = None
        pdf_summary = None
        if summarize_pdf_attachment and msg.attachments:
            for att in msg.attachments:
                if att.is_pdf and att.data:
                    try:
                        from app.agents.summary_agent import summary_agent
                        pdf_res = summary_agent.summarize_pdf(pdf_source=att.data, filename=att.filename)
                        pdf_filename = att.filename
                        pdf_summary = pdf_res.executive_summary or pdf_res.full_markdown
                        logger.info(f"Đã tóm tắt thành công file PDF đính kèm '{att.filename}' của email '{msg.subject}'")
                        break
                    except Exception as att_err:
                        logger.warning(f"Lỗi khi tóm tắt file PDF đính kèm '{att.filename}': {att_err}")

        # 3. Build prompt with safe body truncation to prevent context overflow and speed up inference
        raw_body = (msg.body or "").strip()
        if len(raw_body) > 3000:
            truncated_body = raw_body[:3000] + "\n\n[...Nội dung email dài đã được lược bớt để phân tích trọng tâm...]"
        else:
            truncated_body = raw_body or "(Không có nội dung văn bản)"

        pdf_context = f"\n- Tóm tắt tệp PDF đính kèm ({pdf_filename}):\n{pdf_summary}\n" if pdf_summary else ""
        prompt = (
            f"Thông tin email:\n"
            f"- Thư mục / Nhãn: {target_folder}\n"
            f"- Người gửi: {msg.sender_name} <{msg.sender_email}>\n"
            f"- Tiêu đề: {msg.subject}\n"
            f"- Thời gian nhận: {msg.received_time}\n"
            f"- File đính kèm: {', '.join([a.filename for a in msg.attachments]) if msg.attachments else 'Không có'}\n"
            f"{pdf_context}\n"
            f"Nội dung email:\n"
            f"```text\n{truncated_body}\n```\n\n"
            f"Hãy phân tích email này theo đúng cấu trúc chuẩn của Trợ lý Email."
        )

        response: LLMResponse = chat_with_llm(
            message=prompt,
            system_prompt=SYSTEM_EMAIL_PROMPT,
            model=self.model,
        )

        # Fallback to heuristic analysis if LLM connection failed
        if response.content.startswith("Lỗi kết nối Ollama"):
            parsed = parse_email_analysis(f"Tiêu đề: {msg.subject}\n{truncated_body}")
            clean_summary = (
                f"### Tóm Tắt Email\n\n"
                f"- **Người gửi**: {msg.sender_name or msg.sender_email}\n"
                f"- **Tiêu đề**: {msg.subject}\n"
                f"- **Thời gian**: {msg.received_time}\n"
                f"- **Mức độ khẩn cấp**: {parsed['urgency']}\n"
                f"- **Phân loại**: {parsed['category']}\n\n"
                f"**Nội dung tóm tắt**:\n{truncated_body[:500]}..."
            )
            return EmailAnalysisResult(
                id=msg.id,
                message_id=msg.id,
                subject=msg.subject,
                sender=f"{msg.sender_name} <{msg.sender_email}>",
                received_time=msg.received_time,
                summary=clean_summary,
                urgency=parsed["urgency"],
                category=parsed["category"],
                folder=target_folder,
                pdf_filename=pdf_filename,
                pdf_summary=pdf_summary,
                has_issue_to_solve=parsed["has_issue"],
                issue_description=parsed["issue_desc"],
                has_calendar_event=parsed["has_cal"],
                calendar_hint=parsed["cal_hint"],
                full_analysis=clean_summary,
                thinking_process="",
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
            category=parsed["category"],
            folder=target_folder,
            pdf_filename=pdf_filename,
            pdf_summary=pdf_summary,
            has_issue_to_solve=parsed["has_issue"],
            issue_description=parsed["issue_desc"],
            has_calendar_event=parsed["has_cal"],
            calendar_hint=parsed["cal_hint"],
            full_analysis=response.content,
            thinking_process=response.thought,
        )

    def generate_daily_digest(
        self,
        target_date: Optional[str] = None,
        email_items: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Aggregates and summarizes all emails received on target_date,
        clustering them into categories (Submissions, Notices, Inquiries, Urgent, Tasks).
        Generates actionable executive summary and task list.
        """
        now_vn = datetime.now(tz=VN_TZ)
        date_str = target_date or now_vn.strftime("%Y-%m-%d")

        # Collect emails if not provided
        items = list(email_items or [])
        if not items:
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
                            "category": r.category or "Khác",
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
                            "category": r.category or "Khác",
                            "has_attachments": r.has_attachments,
                            "pdf_filename": r.pdf_filename,
                            "pdf_summary": r.pdf_summary,
                            "body": r.body_snippet or r.subject,
                        })
            finally:
                db.close()

        # Grouping by category
        categories: Dict[str, List[Dict[str, Any]]] = {
            "Nộp bài": [],
            "Học vụ": [],
            "Thắc mắc": [],
            "Công việc": [],
            "Khẩn cấp": [],
            "Khác": [],
        }

        urgent_count = 0
        pdf_count = 0

        for em in items:
            cat = em.get("category") or "Khác"
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

        # Action items
        action_items = []
        if categories.get("Nộp bài"):
            action_items.append(f"Kiểm tra và lưu trữ danh sách {len(categories['Nộp bài'])} bài tập/đồ án sinh viên đã nộp.")
        if categories.get("Khẩn cấp"):
            action_items.append(f"Xử lý khẩn cấp các vấn đề phát sinh từ {len(categories['Khẩn cấp'])} email báo cáo sự cố.")
        if categories.get("Thắc mắc"):
            action_items.append(f"Soạn thảo nội dung phản hồi giải đáp {len(categories['Thắc mắc'])} thắc mắc của sinh viên.")
        if categories.get("Học vụ"):
            action_items.append(f"Cập nhật các thông báo học vụ và thời hạn đăng ký ({len(categories['Học vụ'])} email).")
        if not action_items:
            action_items.append("Đã xử lý và kiểm duyệt toàn bộ email trong ngày, không có cảnh báo tồn đọng.")

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
