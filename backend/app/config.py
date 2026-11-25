import os
from pathlib import Path
from typing import List, Union
from dotenv import load_dotenv
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Single Source of Truth: Locate the root .env file
# Local: backend/app/config.py -> 3 levels up is project root
# Docker: /app/app/config.py -> 2 levels up is /app
_CANDIDATE_ROOT = Path(__file__).resolve().parent.parent.parent
if (_CANDIDATE_ROOT / "data").exists() or (_CANDIDATE_ROOT / ".env").exists():
    ROOT_DIR = _CANDIDATE_ROOT
else:
    ROOT_DIR = Path(__file__).resolve().parent.parent
ROOT_ENV_FILE = ROOT_DIR / ".env"

if ROOT_ENV_FILE.is_file() and os.getenv("APP_ENV") != "test":
    load_dotenv(dotenv_path=str(ROOT_ENV_FILE), override=False)


class Settings(BaseSettings):
    app_name: str = "deskhive-harness"
    app_env: str = "development"
    owner_name: str = "Chủ máy"
    owner_email: str = ""
    email_poller_enabled: bool = True

    # LLM Settings (01 Local RL / Reasoning Model)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "deepseek-r1:8b"
    ollama_timeout: float = 180.0
    # Optional endpoint used to initialize provider settings. No network probe at startup.
    llm_base_url: str = ""
    llm_model: str = ""
    llm_protocol: str = "openai-chat"
    llm_api_key_env: str = ""
    llm_timeout: float | None = None

    # Email & Sender Filtering (Gmail API & EML)
    allowed_senders: Union[str, List[str]] = []

    # Calendar Integration (Google Calendar API & RFC-5545 .ics)
    calendar_provider: str = "google"  # "google", "local"
    calendar_default_reminder_minutes: int = 30
    calendar_timezone: str = "Asia/Ho_Chi_Minh"
    calendar_api_timeout: float = Field(30, ge=1, le=300)
    gmail_api_timeout: float = Field(30, ge=1, le=300)

    # Google Cloud Integration (Calendar & Gmail)
    google_credentials_path: str = "data/tokens/google_credentials.json"
    google_calendar_token_path: str = "data/tokens/google_calendar_token.json"
    google_gmail_token_path: str = "data/tokens/google_gmail_token.json"
    gmail_label: str = "INBOX"
    google_oauth_port: int = 0
    google_oauth_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    google_oauth_frontend_url: str = "http://localhost:3000"

    # Optional: Google OAuth Credentials & Refresh Tokens directly via .env (zero-file setup)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_project_id: str = ""
    google_gmail_refresh_token: str = ""
    google_calendar_refresh_token: str = ""
    google_credentials_json: str = ""
    google_gmail_token_json: str = ""
    google_calendar_token_json: str = ""

    # Email Polling Daemon
    email_poll_interval_minutes: int = 5

    # PDF Processing Settings
    pdf_max_size_mb: int = 50
    pdf_max_pages: int = 1000
    pdf_ocr_enabled: bool = False
    pdf_map_reduce_threshold_tokens: int = Field(3500, ge=128)
    pdf_chunk_tokens: int = Field(2500, ge=128)
    pdf_chunk_overlap_tokens: int = Field(200, ge=0)

    @model_validator(mode="after")
    def valid_pdf_token_budgets(self):
        if self.pdf_chunk_tokens > self.pdf_map_reduce_threshold_tokens:
            raise ValueError("PDF_CHUNK_TOKENS không được lớn hơn PDF_MAP_REDUCE_THRESHOLD_TOKENS.")
        if self.pdf_chunk_overlap_tokens >= self.pdf_chunk_tokens:
            raise ValueError("PDF_CHUNK_OVERLAP_TOKENS phải nhỏ hơn PDF_CHUNK_TOKENS.")
        return self

    # Database
    database_url: str = "sqlite:///./data/assistant.db"

    @field_validator("allowed_senders", mode="before")
    @classmethod
    def parse_allowed_senders(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if not v.strip():
                return []
            return [s.strip().lower() for s in v.split(",") if s.strip()]
        if isinstance(v, list):
            return [str(s).strip().lower() for s in v if str(s).strip()]
        return []

    def get_effective_allowed_senders(self) -> List[str]:
        """Returns the sorted list of allowed senders."""
        senders = list(self.allowed_senders) if isinstance(self.allowed_senders, list) else []
        return sorted(list(set(senders)))

    # Configure Pydantic to read exclusively from the root .env
    model_config = SettingsConfigDict(
        env_file=None if os.getenv("APP_ENV") == "test" else (str(ROOT_ENV_FILE) if ROOT_ENV_FILE.is_file() else ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()


def resolve_path(p: Union[str, Path]) -> Path:
    """Resolve relative paths against the project root so behaviour does not depend on CWD."""
    path = Path(p)
    return path if path.is_absolute() else ROOT_DIR / path
