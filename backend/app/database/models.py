from datetime import datetime
import json
import uuid
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from app.database.database import Base


class DocumentRecord(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False)
    total_pages = Column(Integer, default=1)
    executive_summary = Column(Text, nullable=True)
    full_markdown = Column(Text, nullable=True)
    deadlines_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_deadlines(self, items: list):
        self.deadlines_json = json.dumps(items, ensure_ascii=False)

    def get_deadlines(self) -> list:
        try:
            return json.loads(self.deadlines_json)
        except Exception:
            return []


class CalendarRecord(Base):
    __tablename__ = "calendar_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
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
    created_at = Column(DateTime, default=datetime.utcnow)


class SolutionRecord(Base):
    __tablename__ = "solutions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    problem = Column(Text, nullable=False)
    root_cause = Column(Text, nullable=True)
    full_markdown = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class EmailProcessedRecord(Base):
    __tablename__ = "emails_processed"

    id = Column(String(128), primary_key=True)  # Provider message id (e.g. gmail-xxx, graph-xxx, desktop-xxx)
    source = Column(String(50), nullable=False)  # "gmail", "graph", "desktop", "imap", "eml"
    subject = Column(String(500), default="(Không có tiêu đề)")
    sender_email = Column(String(255), default="")
    received_time = Column(String(100), default="")
    has_attachments = Column(Boolean, default=False)
    pdf_attachments_count = Column(Integer, default=0)
    calendar_events_count = Column(Integer, default=0)
    solution_generated = Column(Boolean, default=False)
    status = Column(String(50), default="processed")  # "processed", "skipped", "error"
    error_message = Column(Text, nullable=True)
    processed_at = Column(DateTime, default=datetime.utcnow)


class RLFeedbackRecord(Base):
    __tablename__ = "rl_feedbacks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
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
    title = Column(String(255), default="Cuộc trò chuyện mới")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), index=True, nullable=False)
    role = Column(String(20), nullable=False)  # "user", "ai"
    content = Column(Text, nullable=False)
    thinking_process = Column(Text, default="")
    agents_invoked_json = Column(Text, default="[]")
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)


