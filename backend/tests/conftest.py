"""Run the suite with disposable storage and no access to the owner's Google tokens."""
import os
from pathlib import Path
import tempfile

TEST_DIR = Path(tempfile.mkdtemp(prefix="office-agents-tests-"))
os.environ.update({
    "APP_ENV": "test", "DATABASE_URL": f"sqlite:///{TEST_DIR / 'assistant.db'}",
    "EMAIL_POLLER_ENABLED": "false", "CALENDAR_PROVIDER": "local",
    "GOOGLE_CREDENTIALS_PATH": str(TEST_DIR / "credentials.json"),
    "GOOGLE_GMAIL_TOKEN_PATH": str(TEST_DIR / "gmail-token.json"),
    "GOOGLE_CALENDAR_TOKEN_PATH": str(TEST_DIR / "calendar-token.json"),
})
for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CREDENTIALS_JSON", "GOOGLE_GMAIL_TOKEN_JSON", "GOOGLE_CALENDAR_TOKEN_JSON", "GOOGLE_GMAIL_REFRESH_TOKEN", "GOOGLE_CALENDAR_REFRESH_TOKEN"):
    os.environ[key] = ""
os.chdir(TEST_DIR)

from app import config

config.ROOT_DIR = TEST_DIR

from app.database.database import init_db

init_db()
