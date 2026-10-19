from datetime import datetime
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from app.config import resolve_path, settings
from app.integrations.base_calendar import CalendarProvider

logger = logging.getLogger(__name__)

SCOPES_CALENDAR = ["https://www.googleapis.com/auth/calendar.events"]
AUTH_HINT = "Chạy: python backend/scripts/smoke_test_google_calendar.py --auth-only"
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class GoogleCalendarProvider(CalendarProvider):
    """
    Integrates with Google Calendar API v3.
    Features:
    - InstalledAppFlow for local OAuth login with non-interactive protection.
    - Automatic token refresh.
    - Deduplication using Google Calendar privateExtendedProperty (stable_hash).
    - Custom reminder notification overrides.
    """

    def __init__(self):
        self.creds_path = self._resolve_credentials_path()
        self.token_path = resolve_path(settings.google_calendar_token_path)
        self._bootstrap_token_from_env()
        self._service = None

    def _bootstrap_token_from_env(self) -> None:
        if self.token_path.exists():
            return
        try:
            if settings.google_calendar_token_json.strip():
                self.token_path.parent.mkdir(parents=True, exist_ok=True)
                self.token_path.write_text(settings.google_calendar_token_json.strip(), encoding="utf-8")
                logger.info(f"Đã khởi tạo token Google Calendar từ GOOGLE_CALENDAR_TOKEN_JSON tại '{self.token_path}'.")
            elif (
                settings.google_client_id.strip()
                and settings.google_client_secret.strip()
                and settings.google_calendar_refresh_token.strip()
            ):
                token_payload = {
                    "token": "",
                    "refresh_token": settings.google_calendar_refresh_token.strip(),
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "client_id": settings.google_client_id.strip(),
                    "client_secret": settings.google_client_secret.strip(),
                    "scopes": SCOPES_CALENDAR,
                    "universe_domain": "googleapis.com",
                    "account": "",
                    "expiry": "2020-01-01T00:00:00Z",
                }
                self.token_path.parent.mkdir(parents=True, exist_ok=True)
                self.token_path.write_text(json.dumps(token_payload), encoding="utf-8")
                logger.info(f"Đã tự động khởi tạo token Google Calendar từ biến môi trường .env tại '{self.token_path}'.")
        except Exception as exc:
            logger.warning(f"Không thể khởi tạo token Google Calendar từ .env: {exc}")

    def _resolve_credentials_path(self) -> Path:
        target = resolve_path(settings.google_credentials_path)
        root_cand = resolve_path("google_credentials.json")
        if root_cand.exists():
            if not target.exists():
                try:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(root_cand.read_bytes())
                except Exception:
                    return root_cand
            else:
                try:
                    if root_cand.stat().st_mtime > target.stat().st_mtime:
                        target.write_bytes(root_cand.read_bytes())
                except Exception:
                    pass
        elif not target.exists():
            try:
                if settings.google_credentials_json.strip():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(settings.google_credentials_json.strip(), encoding="utf-8")
                elif settings.google_client_id.strip() and settings.google_client_secret.strip():
                    creds_payload = {
                        "installed": {
                            "client_id": settings.google_client_id.strip(),
                            "project_id": settings.google_project_id.strip() or "local-ai-assistant",
                            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                            "token_uri": "https://oauth2.googleapis.com/token",
                            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                            "client_secret": settings.google_client_secret.strip(),
                            "redirect_uris": ["http://localhost"],
                        }
                    }
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(json.dumps(creds_payload), encoding="utf-8")
                    logger.info(f"Đã tự động khởi tạo google_credentials.json từ .env tại '{target}'.")
            except Exception as exc:
                logger.warning(f"Không thể khởi tạo credentials từ .env: {exc}")
        return target if target.exists() else (root_cand if root_cand.exists() else target)

    def is_configured(self) -> bool:
        """Returns True if client credentials file exists."""
        if not self.creds_path.exists():
            self.creds_path = self._resolve_credentials_path()
        return self.creds_path.exists()

    def is_authenticated(self) -> bool:
        """Returns True if valid or refreshable token exists."""
        if not self.token_path.exists():
            self._bootstrap_token_from_env()
        if not self.token_path.exists():
            return False
        try:
            creds = Credentials.from_authorized_user_file(str(self.token_path), SCOPES_CALENDAR)
            return creds and (creds.valid or (creds.expired and creds.refresh_token is not None))
        except Exception:
            return False

    def authenticate(self, interactive: bool = False, port: Optional[int] = None) -> Any:
        """
        Authenticates with Google Calendar API.
        If token is valid/refreshable, uses it.
        Otherwise, if interactive=True, launches local browser flow via InstalledAppFlow.
        If interactive=False and not authenticated, raises PermissionError.
        """
        creds = None
        if not self.token_path.exists():
            self._bootstrap_token_from_env()
        if self.token_path.exists():
            try:
                creds = Credentials.from_authorized_user_file(str(self.token_path), SCOPES_CALENDAR)
            except Exception as e:
                logger.warning(f"Không thể đọc file token Google Calendar: {e}")

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    logger.info("Đang tự động làm mới token Google Calendar...")
                    creds.refresh(Request())
                except Exception as exc:
                    logger.warning(f"Làm mới token Google thất bại: {exc}. Yêu cầu xác thực lại.")
                    creds = None

            if not creds:
                if not interactive:
                    raise PermissionError(f"Chưa đăng nhập Google Calendar (hoặc token hết hạn). {AUTH_HINT}")
                if not self.creds_path.exists():
                    raise FileNotFoundError(
                        f"Không tìm thấy file credentials tại '{self.creds_path}'. "
                        f"Vui lòng tải credentials.json từ Google Cloud Console và đặt vào đường dẫn này."
                    )
                logger.info("Bắt đầu quy trình xác thực OAuth qua trình duyệt...")
                oauth_port = settings.google_oauth_port if port is None else port
                flow = InstalledAppFlow.from_client_secrets_file(str(self.creds_path), SCOPES_CALENDAR)
                creds = flow.run_local_server(port=oauth_port)

            self.token_path.parent.mkdir(parents=True, exist_ok=True)
            self.token_path.write_text(creds.to_json(), encoding="utf-8")
            logger.info(f"Đã lưu token Google Calendar tại '{self.token_path}'.")

        self._service = build("calendar", "v3", credentials=creds)
        return self._service

    def get_service(self):
        if not self._service:
            self.authenticate(interactive=False)
        return self._service

    def get_status(self) -> Dict[str, Any]:
        return {
            "configured": self.is_configured(),
            "authenticated": self.is_authenticated(),
            "credentials_path": str(self.creds_path),
            "token_path": str(self.token_path),
        }

    def find_duplicate(self, stable_hash: str) -> Optional[str]:
        """
        Finds existing Google Calendar event matching stable_hash.
        """
        if not stable_hash:
            return None
        service = self.get_service()
        try:
            res = service.events().list(
                calendarId="primary",
                privateExtendedProperty=f"stable_hash={stable_hash}",
                maxResults=1,
            ).execute()
            items = res.get("items", [])
            if items:
                return items[0].get("id")
        except Exception as exc:
            logger.warning(f"Lỗi khi kiểm tra trùng lặp trên Google Calendar: {exc}")
        return None

    def create_event(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: str = "",
        location: str = "",
        reminder_minutes: Optional[int] = None,
        stable_hash: Optional[str] = None,
    ) -> Dict[str, Any]:
        service = self.get_service()

        # Ensure timezone Asia/Ho_Chi_Minh
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=VN_TZ)
        else:
            start_time = start_time.astimezone(VN_TZ)

        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=VN_TZ)
        else:
            end_time = end_time.astimezone(VN_TZ)

        rem_mins = reminder_minutes if reminder_minutes is not None else settings.calendar_default_reminder_minutes

        # Check duplicate
        if stable_hash:
            existing_id = self.find_duplicate(stable_hash)
            if existing_id:
                logger.info(f"Sự kiện '{title}' đã tồn tại trên Google Calendar (id={existing_id}).")
                return {
                    "success": True,
                    "event_id": existing_id,
                    "provider": "google",
                    "is_duplicate": True,
                    "link": f"https://www.google.com/calendar/event?eid={existing_id}",
                    "message": "Sự kiện đã tồn tại trên Google Calendar (chống trùng lặp).",
                }

        body: Dict[str, Any] = {
            "summary": title,
            "description": description,
            "location": location,
            "start": {
                "dateTime": start_time.isoformat(),
                "timeZone": "Asia/Ho_Chi_Minh",
            },
            "end": {
                "dateTime": end_time.isoformat(),
                "timeZone": "Asia/Ho_Chi_Minh",
            },
            "reminders": {
                "useDefault": False,
                "overrides": [{"method": "popup", "minutes": rem_mins}],
            },
        }

        if stable_hash:
            body["extendedProperties"] = {
                "private": {"stable_hash": stable_hash}
            }

        created = service.events().insert(calendarId="primary", body=body).execute()
        event_id = created.get("id")
        html_link = created.get("htmlLink", "")

        logger.info(f"Đã tạo thành công sự kiện trên Google Calendar (id={event_id}).")
        return {
            "success": True,
            "event_id": event_id,
            "provider": "google",
            "is_duplicate": False,
            "link": html_link,
            "message": f"Đã thêm vào Google Calendar thành công kèm nhắc trước {rem_mins} phút.",
        }

    def update_event(self, event_id: str, **kwargs) -> bool:
        service = self.get_service()
        try:
            event = service.events().get(calendarId="primary", eventId=event_id).execute()
            if "title" in kwargs:
                event["summary"] = kwargs["title"]
            if "description" in kwargs:
                event["description"] = kwargs["description"]
            if "location" in kwargs:
                event["location"] = kwargs["location"]
            service.events().update(calendarId="primary", eventId=event_id, body=event).execute()
            return True
        except Exception as exc:
            logger.error(f"Lỗi khi cập nhật sự kiện Google Calendar {event_id}: {exc}")
            return False

    def delete_event(self, event_id: str) -> bool:
        service = self.get_service()
        try:
            service.events().delete(calendarId="primary", eventId=event_id).execute()
            logger.info(f"Đã xóa sự kiện Google Calendar {event_id}.")
            return True
        except Exception as exc:
            logger.error(f"Lỗi khi xóa sự kiện Google Calendar {event_id}: {exc}")
            return False

    def list_events(self, max_results: int = 10) -> List[Dict[str, Any]]:
        """
        Lists upcoming events from primary Google Calendar.
        """
        service = self.get_service()
        try:
            now_iso = datetime.now(tz=VN_TZ).isoformat()
            res = service.events().list(
                calendarId="primary",
                timeMin=now_iso,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            ).execute()
            return res.get("items", [])
        except Exception as exc:
            logger.error(f"Lỗi khi lấy danh sách sự kiện Google Calendar: {exc}")
            return []


google_calendar = GoogleCalendarProvider()
