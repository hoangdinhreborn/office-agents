from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

# Ensure data directory exists
db_dir = Path("data")
db_dir.mkdir(parents=True, exist_ok=True)

# Connect args for sqlite
connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import app.database.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # Lightweight schema migration for SQLite
    try:
        with engine.connect() as conn:
            cursor = conn.exec_driver_sql("PRAGMA table_info(emails_processed);")
            existing_cols = [row[1] for row in cursor.fetchall()]
            new_cols = {
                "folder": "VARCHAR(100) DEFAULT 'INBOX'",
                "urgency": "VARCHAR(20) DEFAULT 'Trung bình'",
                "category": "VARCHAR(50) DEFAULT 'Khác'",
                "sender_name": "VARCHAR(255) DEFAULT ''",
                "sender": "VARCHAR(255) DEFAULT ''",
                "body": "TEXT",
                "body_snippet": "TEXT",
                "summary": "TEXT",
                "full_analysis": "TEXT",
                "issue_description": "TEXT",
                "calendar_hint": "TEXT",
                "has_issue_to_solve": "BOOLEAN DEFAULT 0",
                "has_calendar_event": "BOOLEAN DEFAULT 0",
                "pdf_filename": "VARCHAR(255)",
                "pdf_summary": "TEXT",
            }
            for col_name, col_type in new_cols.items():
                if existing_cols and col_name not in existing_cols:
                    conn.exec_driver_sql(f"ALTER TABLE emails_processed ADD COLUMN {col_name} {col_type};")
            conn.commit()
    except Exception:
        pass


init_db()
