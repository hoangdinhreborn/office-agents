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
        for name, sql_type in {"file_path": "VARCHAR(500)", "file_size": "INTEGER"}.items():
            if name not in {c["name"] for c in inspect(conn).get_columns("documents")}:
                conn.exec_driver_sql(f"ALTER TABLE documents ADD COLUMN {name} {sql_type}")
        email_columns = {c["name"] for c in inspect(conn).get_columns("emails_processed")}
        email_fields = {
            "folder": "VARCHAR(100) DEFAULT 'INBOX'", "urgency": "VARCHAR(20) DEFAULT 'Trung bình'",
            "category": "VARCHAR(50) DEFAULT 'Khác'", "sender_name": "VARCHAR(255) DEFAULT ''",
            "sender": "VARCHAR(255) DEFAULT ''", "body": "TEXT", "body_snippet": "TEXT", "summary": "TEXT",
            "full_analysis": "TEXT", "issue_description": "TEXT", "calendar_hint": "TEXT",
            "has_issue_to_solve": "BOOLEAN DEFAULT 0", "has_calendar_event": "BOOLEAN DEFAULT 0",
            "pdf_filename": "VARCHAR(255)", "pdf_summary": "TEXT",
        }
        for name, sql_type in email_fields.items():
            if name not in email_columns:
                conn.exec_driver_sql(f"ALTER TABLE emails_processed ADD COLUMN {name} {sql_type}")
        has_legacy = any(conn.exec_driver_sql(f"SELECT 1 FROM {table} WHERE project_id IS NULL LIMIT 1").first() for table in owned_tables)
        if has_legacy:
            if not conn.execute(models.ProjectRecord.__table__.select().where(models.ProjectRecord.id == "legacy")).first():
                conn.execute(models.ProjectRecord.__table__.insert().values(id="legacy", title="Dữ liệu cũ", icon="folder"))
            for table in owned_tables:
                conn.exec_driver_sql(f"UPDATE {table} SET project_id = 'legacy' WHERE project_id IS NULL")
