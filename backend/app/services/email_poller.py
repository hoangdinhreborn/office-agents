from datetime import datetime
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from apscheduler.schedulers.background import BackgroundScheduler

from app.agents.calendar_agent import calendar_agent
from app.agents.email_agent import route_and_apply_folder, parse_email_analysis
from app.agents.summary_agent import summary_agent
from app.config import settings
from app.database.database import SessionLocal
from app.database.models import CalendarRecord, EmailProcessedRecord
from app.integrations.calendar import calendar_service
from app.integrations.eml_parser import load_eml_folder
from app.integrations.gmail import gmail_service
from app.rag.pdf_loader import load_pdf_from_bytes
from app.schemas.email import EmailMessage

logger = logging.getLogger(__name__)


class EmailPoller:
    """
    Background Outbound Email Polling Service.
    Periodically checks Gmail API and Local EML folders.
    Extracts calendar events and processes attachments without public webhooks/tunnels.
    """

    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.is_running = False
        self.inbox_dir = Path("data/emails_inbox")
        self.inbox_dir.mkdir(parents=True, exist_ok=True)

    def start(self, interval_minutes: Optional[int] = None):
        """Starts periodic outbound background polling."""
        if self.is_running:
            logger.info("Email poller đã đang chạy.")
            return

        interval = interval_minutes or settings.email_poll_interval_minutes
        self.scheduler.add_job(
            self.poll_once,
            "interval",
            minutes=interval,
            id="email_poller_job",
            replace_existing=True,
            next_run_time=datetime.now(),  # Run immediately on start
        )
        self.scheduler.start()
        self.is_running = True
        logger.info(f"Đã khởi động Email Poller ngầm (tần suất: {interval} phút/lần).")

    def stop(self):
        """Stops the poller scheduler gracefully."""
        if self.is_running:
            self.scheduler.shutdown(wait=False)
            self.is_running = False
            logger.info("Đã dừng Email Poller ngầm.")

    def poll_once(self) -> Dict[str, Any]:
        """
        Executes a single polling cycle across all available email channels.
        Deduplicates against processed emails database and extracts events.
        """
        logger.info("--- Bắt đầu chu kỳ quét email mới (Outbound Polling) ---")
        db = SessionLocal()
        total_fetched = 0
        new_processed = 0
        events_count = 0

        try:
            # 1. Fetch from active sources (Gmail API v1 & Local EML drop folder)
            messages_with_source: List[tuple[str, EmailMessage]] = []
            allowed = settings.get_effective_allowed_senders()

            # 1.1 Gmail API v1
            if gmail_service.is_authenticated():
                try:
                    gmail_msgs = gmail_service.fetch_unread_emails(
                        label=settings.gmail_label,
                        allowed_senders=allowed,
                        limit=10,
                    )
                    for m in gmail_msgs:
                        messages_with_source.append(("gmail", m))
                except Exception as exc:
                    logger.warning(f"Lỗi khi quét Gmail API: {exc}")

            # 1.2 Local drop directory for .eml files
            if self.inbox_dir.exists():
                try:
                    eml_msgs = load_eml_folder(
                        folder_path=self.inbox_dir,
                        allowed_senders=allowed,
                        limit=20,
                    )
                    for m in eml_msgs:
                        messages_with_source.append(("eml", m))
                except Exception as exc:
                    logger.warning(f"Lỗi khi quét thư mục file .eml: {exc}")

            total_fetched = len(messages_with_source)

            # 2. Process each message
            for source, msg in messages_with_source:
                # Check DB deduplication
                existing = db.query(EmailProcessedRecord).filter(EmailProcessedRecord.id == msg.id).first()
                if existing:
                    continue  # Already processed

                new_processed += 1
                msg_events_count = 0
                pdf_count = 0

                # 2.0 Determine folder and route email
                target_folder = route_and_apply_folder(msg, db)
                msg.folder = target_folder

                # 2.1 Parse urgency and category
                analysis_parsed = parse_email_analysis(f"Tiêu đề: {msg.subject}\nNội dung: {msg.body}")

                # 2.2 Calendar extraction from email body
                combined_text = f"Tiêu đề email: {msg.subject}\nNgười gửi: {msg.sender_name} <{msg.sender_email}>\nThời gian: {msg.received_time}\n\nNội dung:\n{msg.body}"
                try:
                    res = calendar_agent.extract_and_schedule(
                        input_text=combined_text,
                        source_type="email",
                        source_reference=f"{source}:{msg.subject}",
                        auto_schedule=True,
                    )
                    # Persist events to DB
                    for se in res.scheduled_events:
                        evt_obj = calendar_service.get_event(se.event_id)
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
                                ics_path=se.ics_file,
                                synced_desktop=se.cloud_synced,
                            )
                            db.merge(rec)
                            msg_events_count += 1
                            events_count += 1
                except Exception as agent_err:
                    logger.error(f"Lỗi xử lý CalendarAgent cho email {msg.id}: {agent_err}")

                # 2.3 Process and summarize PDF attachments (if any)
                pdf_filename = None
                pdf_summary = None
                for att in msg.attachments:
                    if att.is_pdf and att.data:
                        pdf_count += 1
                        try:
                            sum_res = summary_agent.summarize_pdf(pdf_source=att.data, filename=att.filename)
                            pdf_filename = att.filename
                            pdf_summary = sum_res.executive_summary or sum_res.full_markdown

                            # Extract deadlines from PDF for calendar
                            if sum_res.deadlines:
                                cal_input = "\n".join(sum_res.deadlines)
                                pdf_res = calendar_agent.extract_and_schedule(
                                    input_text=cal_input,
                                    source_type="email",
                                    source_reference=f"attachment:{att.filename}",
                                    auto_schedule=True,
                                )
                                for se in pdf_res.scheduled_events:
                                    evt_obj = calendar_service.get_event(se.event_id)
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
                                            ics_path=se.ics_file,
                                            synced_desktop=se.cloud_synced,
                                        )
                                        db.merge(rec)
                                        msg_events_count += 1
                                        events_count += 1
                            break
                        except Exception as pdf_err:
                            logger.warning(f"Lỗi xử lý PDF đính kèm {att.filename}: {pdf_err}")

                # 2.4 Record processed email to DB with full details
                s_disp = f"{msg.sender_name} <{msg.sender_email}>" if msg.sender_name else msg.sender_email
                proc_rec = EmailProcessedRecord(
                    id=msg.id,
                    source=source,
                    subject=msg.subject,
                    sender=s_disp,
                    sender_name=msg.sender_name or msg.sender_email,
                    sender_email=msg.sender_email,
                    received_time=msg.received_time,
                    folder=target_folder,
                    urgency=analysis_parsed.get("urgency", "Trung bình"),
                    category=analysis_parsed.get("category", "Khác"),
                    body=msg.body,
                    body_snippet=msg.body[:1000] if msg.body else msg.subject,
                    summary=analysis_parsed.get("summary") or msg.body,
                    full_analysis=analysis_parsed.get("full_analysis") or "",
                    issue_description=analysis_parsed.get("issue_desc"),
                    calendar_hint=analysis_parsed.get("cal_hint"),
                    has_issue_to_solve=bool(analysis_parsed.get("has_issue")),
                    has_calendar_event=bool(analysis_parsed.get("has_cal") or msg_events_count > 0),
                    has_attachments=msg.has_attachments,
                    pdf_attachments_count=pdf_count,
                    pdf_filename=pdf_filename,
                    pdf_summary=pdf_summary,
                    calendar_events_count=msg_events_count,
                    solution_generated=bool(analysis_parsed.get("has_issue")),
                    status="processed",
                )
                db.add(proc_rec)
                db.commit()

        except Exception as exc:
            logger.error(f"Lỗi chu kỳ quét email: {exc}")
            db.rollback()
        finally:
            db.close()

        logger.info(
            f"--- Kết thúc chu kỳ quét email: Tổng kiểm tra {total_fetched}, "
            f"Mới xử lý {new_processed}, Sự kiện lên lịch {events_count} ---"
        )
        return {
            "total_checked": total_fetched,
            "new_processed": new_processed,
            "events_scheduled": events_count,
        }


email_poller = EmailPoller()
