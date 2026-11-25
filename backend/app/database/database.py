from sqlalchemy import create_engine, event, inspect
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import resolve_path, settings

database_url = make_url(settings.database_url)
if database_url.get_backend_name() == "sqlite" and database_url.database not in (None, "", ":memory:"):
    database_path = resolve_path(database_url.database)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database_url = database_url.set(database=str(database_path))

engine = create_engine(
    database_url,
    connect_args={"check_same_thread": False} if database_url.get_backend_name() == "sqlite" else {},
)

if database_url.get_backend_name() == "sqlite":
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.database import models

    Base.metadata.create_all(bind=engine)
    # Additive, repeatable migration: preserve old rows, files and provider IDs.
    owned_tables = ("documents", "emails_processed", "calendar_events", "solutions", "tasks", "chat_sessions", "rl_feedbacks")
    with engine.begin() as conn:
        for table in owned_tables:
            columns = {c["name"] for c in inspect(conn).get_columns(table)}
            if "project_id" not in columns:
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN project_id VARCHAR(36) REFERENCES projects(id)")
            conn.exec_driver_sql(f"CREATE INDEX IF NOT EXISTS ix_{table}_project_id ON {table} (project_id)")
        document_fields = {
            "file_path": "VARCHAR(500)", "file_size": "INTEGER", "source_text": "TEXT",
            "pages_json": "TEXT NOT NULL DEFAULT '[]'", "chunks_json": "TEXT NOT NULL DEFAULT '[]'",
            "is_ocr": "BOOLEAN NOT NULL DEFAULT 0", "is_map_reduce": "BOOLEAN NOT NULL DEFAULT 0",
            "processing_warning": "TEXT",
            "solution_options_json": "TEXT NOT NULL DEFAULT '[]'",
            "constraint_history_json": "TEXT NOT NULL DEFAULT '[]'",
            "solution_revision": "INTEGER NOT NULL DEFAULT 0",
            "selected_solution_id": "VARCHAR(36)", "replied_at": "DATETIME",
        }
        for name, sql_type in document_fields.items():
            if name not in {c["name"] for c in inspect(conn).get_columns("documents")}:
                conn.exec_driver_sql(f"ALTER TABLE documents ADD COLUMN {name} {sql_type}")
        email_columns = {c["name"] for c in inspect(conn).get_columns("emails_processed")}
        email_fields = {
            "folder": "VARCHAR(100) DEFAULT 'INBOX'", "urgency": "VARCHAR(20) DEFAULT 'Trung bình'",
            "sender_name": "VARCHAR(255) DEFAULT ''",
            "sender": "VARCHAR(255) DEFAULT ''", "body": "TEXT", "body_snippet": "TEXT", "summary": "TEXT",
            "full_analysis": "TEXT", "issue_description": "TEXT", "calendar_hint": "TEXT",
            "has_issue_to_solve": "BOOLEAN DEFAULT 0", "has_calendar_event": "BOOLEAN DEFAULT 0",
            "pdf_filename": "VARCHAR(255)", "pdf_summary": "TEXT",
            "provider_message_id": "VARCHAR(128)", "sender_role": "VARCHAR(20)",
            "pdf_metadata_json": "TEXT", "solution_options_json": "TEXT NOT NULL DEFAULT '[]'",
            "schedule_draft_json": "TEXT",
            "constraint_history_json": "TEXT NOT NULL DEFAULT '[]'",
            "solution_revision": "INTEGER NOT NULL DEFAULT 0",
            "selected_solution_id": "VARCHAR(36)", "replied_at": "DATETIME",
            "processing_stage": "VARCHAR(255)",
        }
        for name, sql_type in email_fields.items():
            if name not in email_columns:
                conn.exec_driver_sql(f"ALTER TABLE emails_processed ADD COLUMN {name} {sql_type}")
        # A single local server owns the worker. After a process restart, never
        # replay an inference whose final result was not committed.
        conn.exec_driver_sql("UPDATE emails_processed SET status = 'error', processing_stage = 'Lượt trước bị gián đoạn', "
                             "error_message = 'Backend đã dừng giữa lượt phân tích. Nội dung gốc vẫn còn; bấm Phân tích lại nếu muốn gọi model lại.' "
                             "WHERE status = 'processing'")
        calendar_fields = {
            "draft_id": "VARCHAR(36) REFERENCES calendar_drafts(id)", "resource_id": "VARCHAR(128)",
            "all_day": "BOOLEAN NOT NULL DEFAULT 0", "recurrence_json": "TEXT NOT NULL DEFAULT '[]'",
            "deadline_date": "VARCHAR(10)", "stable_hash": "VARCHAR(64)", "google_event_id": "VARCHAR(128)",
            "google_link": "TEXT", "definition_json": "TEXT", "status": "VARCHAR(20) NOT NULL DEFAULT 'legacy'",
        }
        calendar_columns = {c["name"] for c in inspect(conn).get_columns("calendar_events")}
        for name, sql_type in calendar_fields.items():
            if name not in calendar_columns:
                conn.exec_driver_sql(f"ALTER TABLE calendar_events ADD COLUMN {name} {sql_type}")
        conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_stable_hash ON calendar_events (stable_hash)")
        has_legacy = any(conn.exec_driver_sql(f"SELECT 1 FROM {table} WHERE project_id IS NULL LIMIT 1").first() for table in owned_tables)
        if has_legacy:
            if not conn.execute(models.ProjectRecord.__table__.select().where(models.ProjectRecord.id == "legacy")).first():
                conn.execute(models.ProjectRecord.__table__.insert().values(id="legacy", title="Dữ liệu cũ", icon="folder"))
            for table in owned_tables:
                conn.exec_driver_sql(f"UPDATE {table} SET project_id = 'legacy' WHERE project_id IS NULL")
        # Preserve existing message identities without copying or dropping historical rows.
        conn.exec_driver_sql("UPDATE emails_processed SET provider_message_id = id WHERE provider_message_id IS NULL")
        conn.exec_driver_sql(
            "UPDATE emails_processed SET sender_role = COALESCE("
            "(SELECT role FROM project_members WHERE project_members.project_id = emails_processed.project_id "
            "AND lower(project_members.email) = lower(emails_processed.sender_email)), 'khách') "
            "WHERE sender_role IS NULL"
        )
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_email_project_source_message "
            "ON emails_processed (project_id, source, provider_message_id)"
        )
        if conn.dialect.name == "sqlite":
            for table in (*owned_tables, "project_members", "calendar_drafts", "sent_mails"):
                # A deletion tombstone closes the gap between long-running
                # inference and the eventual physical project deletion.
                conn.exec_driver_sql(
                    f"CREATE TRIGGER IF NOT EXISTS {table}_requires_active_project BEFORE INSERT ON {table} "
                    "WHEN NEW.project_id IS NOT NULL AND NOT EXISTS "
                    "(SELECT 1 FROM projects WHERE id = NEW.project_id AND deleted_at IS NULL) "
                    "BEGIN SELECT RAISE(ABORT, 'project no longer active'); END"
                )
            # Old SQLite tables lack the session FK. Add equivalent guards
            # without rebuilding or deleting historical messages.
            conn.exec_driver_sql(
                "CREATE TRIGGER IF NOT EXISTS chat_message_requires_session BEFORE INSERT ON chat_messages "
                "WHEN NOT EXISTS (SELECT 1 FROM chat_sessions WHERE id = NEW.session_id) "
                "BEGIN SELECT RAISE(ABORT, 'chat session no longer exists'); END"
            )
            conn.exec_driver_sql(
                "CREATE TRIGGER IF NOT EXISTS chat_session_delete_messages AFTER DELETE ON chat_sessions "
                "BEGIN DELETE FROM chat_messages WHERE session_id = OLD.id; END"
            )
    from app.services.calendar_workflow import import_legacy_drafts
    with SessionLocal() as db:
        import_legacy_drafts(db)
