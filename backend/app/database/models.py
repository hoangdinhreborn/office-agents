from datetime import datetime
import json
import uuid
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from app.database.database import Base


class LLMProviderRecord(Base):
    __tablename__ = "llm_providers"

    id = Column(String(128), primary_key=True)
    config_json = Column(Text, nullable=False)


class LLMProviderSecretRecord(Base):
    __tablename__ = "llm_provider_secrets"

    provider_id = Column(String(128), ForeignKey("llm_providers.id", ondelete="CASCADE"), primary_key=True)
    encrypted_key = Column(Text, nullable=False)


class LLMRuntimeRecord(Base):
    __tablename__ = "llm_runtime"

    id = Column(Integer, primary_key=True, default=1)
    selected_model_id = Column(String(128), nullable=True)
    fallback_model_id = Column(String(128), nullable=True)


class ProjectRecord(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(80), nullable=False)
    icon = Column(String(32), nullable=False, default="briefcase")
    mail_label_id = Column(String(255), unique=True, nullable=True)
    mail_label_name = Column(String(255), unique=True, nullable=True)
    mail_label_key = Column(String(255), unique=True, nullable=True)
    mail_sync_interval_minutes = Column(Integer, nullable=False, default=60)
    default_reminder_minutes = Column(Integer, nullable=False, default=30)
    collect_rl_feedback = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)


class ProjectMemberRecord(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "email"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)


class DocumentRecord(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), index=True)
    file_path = Column(String(500), nullable=True)
    file_size = Column(Integer, nullable=True)
    filename = Column(String(255), nullable=False)
    total_pages = Column(Integer, default=1)
    executive_summary = Column(Text, nullable=True)
    full_markdown = Column(Text, nullable=True)
    source_text = Column(Text, nullable=True)
    pages_json = Column(Text, nullable=False, default="[]")
    chunks_json = Column(Text, nullable=False, default="[]")
    is_ocr = Column(Boolean, nullable=False, default=False)
    is_map_reduce = Column(Boolean, nullable=False, default=False)
    processing_warning = Column(Text, nullable=True)
    deadlines_json = Column(Text, default="[]")
    solution_options_json = Column(Text, nullable=False, default="[]")
    constraint_history_json = Column(Text, nullable=False, default="[]")
    solution_revision = Column(Integer, nullable=False, default=0)
    selected_solution_id = Column(String(36), nullable=True)
    replied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_deadlines(self, items: list):
        self.deadlines_json = json.dumps(items, ensure_ascii=False)

    def get_deadlines(self) -> list:
        try:
            return json.loads(self.deadlines_json)
        except Exception:
            return []


class CalendarDraftRecord(Base):
    __tablename__ = "calendar_drafts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    resource_id = Column(String(128), nullable=True, index=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), nullable=True, index=True)
    draft_json = Column(Text, nullable=False)
    revision = Column(Integer, nullable=False, default=1)
    approved_event_id = Column(String(36), ForeignKey("calendar_events.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class CalendarRecord(Base):
    __tablename__ = "calendar_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), index=True)
    title = Column(String(255), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    reminder_minutes = Column(Integer, default=30)
    location = Column(String(255), default="")
    description = Column(Text, default="")
    source_type = Column(String(50), default="prompt")
    source_reference = Column(String(255), nullable=True)
    ics_path = Column(String(500), nullable=True)
    synced_desktop = Column(Boolean, default=False)
    draft_id = Column(String(36), ForeignKey("calendar_drafts.id"), nullable=True, index=True)
    resource_id = Column(String(128), nullable=True)
    all_day = Column(Boolean, nullable=False, default=False)
    recurrence_json = Column(Text, nullable=False, default="[]")
    deadline_date = Column(String(10), nullable=True)
    stable_hash = Column(String(64), nullable=True)
    google_event_id = Column(String(128), nullable=True)
    google_link = Column(Text, nullable=True)
    definition_json = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="legacy")
    __table_args__ = (Index("uq_calendar_stable_hash", "stable_hash", unique=True),)
    created_at = Column(DateTime, default=datetime.utcnow)


class SolutionRecord(Base):
    __tablename__ = "solutions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), index=True)
    problem = Column(Text, nullable=False)
    root_cause = Column(Text, nullable=True)
    full_markdown = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class EmailProcessedRecord(Base):
    __tablename__ = "emails_processed"
    __table_args__ = (Index("uq_email_project_source_message", "project_id", "source", "provider_message_id", unique=True),)

    id = Column(String(128), primary_key=True)  # Internal identity; legacy rows retain their original IDs.
    project_id = Column(String(36), ForeignKey("projects.id"), index=True)
    provider_message_id = Column(String(128), nullable=True)
    source = Column(String(50), nullable=False)  # "gmail", "graph", "desktop", "imap", "eml"
    subject = Column(String(500), default="(Không có tiêu đề)")
    sender_email = Column(String(255), default="")
    sender_name = Column(String(255), default="")
    sender = Column(String(255), default="")
    received_time = Column(String(100), default="")
    folder = Column(String(100), default="INBOX")
    urgency = Column(String(20), default="Trung bình")  # "Thấp", "Trung bình", "Cao", "Khẩn cấp"
    sender_role = Column(String(20), nullable=True)
    body = Column(Text, nullable=True)
    body_snippet = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)  # Toàn bộ nội dung phân tích Markdown
    full_analysis = Column(Text, nullable=True)
    issue_description = Column(Text, nullable=True)
    calendar_hint = Column(Text, nullable=True)
    has_issue_to_solve = Column(Boolean, default=False)
    has_calendar_event = Column(Boolean, default=False)
    has_attachments = Column(Boolean, default=False)
    pdf_attachments_count = Column(Integer, default=0)
    pdf_filename = Column(String(255), nullable=True)
    pdf_summary = Column(Text, nullable=True)
    pdf_metadata_json = Column(Text, nullable=True)
    solution_options_json = Column(Text, nullable=False, default="[]")
    constraint_history_json = Column(Text, nullable=False, default="[]")
    solution_revision = Column(Integer, nullable=False, default=0)
    selected_solution_id = Column(String(36), nullable=True)
    replied_at = Column(DateTime, nullable=True)
    schedule_draft_json = Column(Text, nullable=True)
    calendar_events_count = Column(Integer, default=0)
    solution_generated = Column(Boolean, default=False)
    status = Column(String(50), default="processed")  # "processed", "skipped", "error"
    error_message = Column(Text, nullable=True)
    processing_stage = Column(String(255), nullable=True)
    processed_at = Column(DateTime, default=datetime.utcnow)


class SentMailRecord(Base):
    __tablename__ = "sent_mails"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    resource_id = Column(String(128), nullable=False, index=True)
    solution_id = Column(String(36), nullable=False)
    request_hash = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=False)
    rfc_message_id = Column(String(255), nullable=False, unique=True)
    google_message_id = Column(String(128), nullable=True)
    google_thread_id = Column(String(128), nullable=True)
    status = Column(String(20), nullable=False, default="sending")
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class EmailFolderRuleRecord(Base):
    __tablename__ = "email_folder_rules"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    folder_name = Column(String(100), nullable=False, unique=True)
    description = Column(String(255), default="")
    keywords_json = Column(Text, default="[]")  # e.g. ["bài tập", "nộp bài", "assignment"]
    senders_json = Column(Text, default="[]")   # e.g. ["*@student.edu.vn", "daotao@..."]
    color = Column(String(20), default="#3B82F6")
    auto_apply_gmail_label = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def get_keywords(self) -> list:
        try:
            return json.loads(self.keywords_json)
        except Exception:
            return []

    def set_keywords(self, items: list):
        self.keywords_json = json.dumps(items, ensure_ascii=False)

    def get_senders(self) -> list:
        try:
            return json.loads(self.senders_json)
        except Exception:
            return []

    def set_senders(self, items: list):
        self.senders_json = json.dumps(items, ensure_ascii=False)


class RLFeedbackRecord(Base):
    __tablename__ = "rl_feedbacks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), index=True)
    agent_type = Column(String(50), nullable=False)  # "summary", "solution", "calendar", "router"
    prompt = Column(Text, nullable=False)  # User input / problem prompt
    response = Column(Text, nullable=False)  # Model raw response (candidate / rejected)
    corrected_response = Column(Text, nullable=True)  # User's corrected response (chosen target)
    rating = Column(Integer, default=0)  # 1 to 5, or thumbs up (+1) / thumbs down (-1)
    feedback_notes = Column(Text, nullable=True)  # Specific suggestions or critique
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)


class TaskRecord(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), index=True)
    title = Column(String(500), nullable=False)
    due_date = Column(DateTime, nullable=True)
    priority = Column(String(20), default="medium")  # "low", "medium", "high"
    status = Column(String(20), default="pending")  # "pending", "completed"
    source_type = Column(String(50), default="prompt")  # "email", "pdf", "prompt"
    source_reference = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatSessionRecord(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), index=True)
    title = Column(String(255), default="Cuộc trò chuyện mới")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String(20), nullable=False)  # "user", "ai"
    content = Column(Text, nullable=False)
    thinking_process = Column(Text, default="")
    agents_invoked_json = Column(Text, default="[]")
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)


