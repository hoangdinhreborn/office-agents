import base64
from email.message import EmailMessage as MimeEmailMessage
from email.utils import parseaddr
import json
import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import resolve_path, settings
from app.schemas.email import EmailAttachment, EmailMessage

logger = logging.getLogger(__name__)

SCOPES_GMAIL = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]
AUTH_HINT = "Chạy: python backend/scripts/smoke_test_gmail_send.py --auth-only"
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _clean_html_tags(html_text: str) -> str:
    cleaned = re.sub(r"<style.*?</style>", "", html_text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<script.*?</script>", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _decode_base64_data(data_str: str) -> bytes:
    if not data_str:
        return b""
    # URL-safe base64 decoding
    padded = data_str + "=" * (-len(data_str) % 4)
    return base64.urlsafe_b64decode(padded)


def _validate_addresses(addrs: Optional[List[str]], field_name: str, required: bool = False) -> List[str]:
    cleaned: List[str] = []
    for raw in addrs or []:
        raw = (raw or "").strip()
        if not raw:
            continue
        if "\r" in raw or "\n" in raw:
            raise ValueError(f"Địa chỉ '{field_name}' không hợp lệ (chứa ký tự xuống dòng).")
        _, addr = parseaddr(raw)
        if not addr or "@" not in addr or addr.startswith("@") or addr.endswith("@"):
            raise ValueError(f"Địa chỉ email không hợp lệ trong '{field_name}': {raw!r}")
        cleaned.append(raw)
    if required and not cleaned:
        raise ValueError(f"Trường '{field_name}' phải có ít nhất một địa chỉ email.")
    return cleaned


class GmailService:
    """
    Integrates with Gmail API v1 for reading unread emails, PDF attachments and sending mail.
    Features:
    - OAuth2 InstalledAppFlow & Silent Token Refresh.
    - Scopes: gmail.readonly + gmail.send.
    - Non-interactive by default: the API / poller never opens a browser.
    - Querying by label and sender filtering.
    - Attachment extraction (PDF bytes).
    """

    def __init__(self):
        self.creds_path = self._resolve_credentials_path()
        self.token_path = resolve_path(settings.google_gmail_token_path)
        self._bootstrap_token_from_env()
        self._service = None

    def _bootstrap_token_from_env(self) -> None:
        if self.token_path.exists():
            return
        try:
            if settings.google_gmail_token_json.strip():
                self.token_path.parent.mkdir(parents=True, exist_ok=True)
                self.token_path.write_text(settings.google_gmail_token_json.strip(), encoding="utf-8")
                logger.info(f"Đã khởi tạo token Gmail từ GOOGLE_GMAIL_TOKEN_JSON tại '{self.token_path}'.")
            elif (
                settings.google_client_id.strip()
                and settings.google_client_secret.strip()
                and settings.google_gmail_refresh_token.strip()
            ):
                token_payload = {
                    "token": "",
                    "refresh_token": settings.google_gmail_refresh_token.strip(),
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "client_id": settings.google_client_id.strip(),
                    "client_secret": settings.google_client_secret.strip(),
                    "scopes": SCOPES_GMAIL,
                    "universe_domain": "googleapis.com",
                    "account": "",
                    "expiry": "2020-01-01T00:00:00Z",
                }
                self.token_path.parent.mkdir(parents=True, exist_ok=True)
                self.token_path.write_text(json.dumps(token_payload), encoding="utf-8")
                logger.info(f"Đã tự động khởi tạo token Gmail từ biến môi trường .env tại '{self.token_path}'.")
        except Exception as exc:
            logger.warning(f"Không thể khởi tạo token Gmail từ .env: {exc}")

    def _resolve_credentials_path(self) -> Path:
        """
        Locates google_credentials.json. If the root file is newer or configured path is missing,
        automatically synchronizes from root or .env to data/tokens/.
        """
        target = resolve_path(settings.google_credentials_path)
        root_cand = resolve_path("google_credentials.json")

        if root_cand.exists():
            if not target.exists():
                try:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(root_cand.read_bytes())
                    logger.info(f"Đã tự động đồng bộ credentials từ '{root_cand}' sang '{target}'.")
                except Exception:
                    return root_cand
            else:
                # If root candidate was modified more recently, update target
                try:
                    if root_cand.stat().st_mtime > target.stat().st_mtime:
                        target.write_bytes(root_cand.read_bytes())
                        logger.info(f"Đã cập nhật credentials mới từ '{root_cand}' sang '{target}'.")
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

    # ------------------------------------------------------------------ auth
    def is_configured(self) -> bool:
        if not self.creds_path.exists():
            self.creds_path = self._resolve_credentials_path()
        return self.creds_path.exists()

    def client_type(self) -> Optional[str]:
        """Returns 'installed' (Desktop app), 'web', or None if the file is missing/unreadable."""
        try:
            data = json.loads(self.creds_path.read_text(encoding="utf-8"))
        except Exception:
            return None
        for key in ("installed", "web"):
            if key in data:
                return key
        return None

    def _save_creds(self, creds: Credentials) -> None:
        self.token_path.parent.mkdir(parents=True, exist_ok=True)
        self.token_path.write_text(creds.to_json(), encoding="utf-8")
        logger.info(f"Đã lưu token Gmail tại '{self.token_path}'.")

    def _load_creds(self, refresh: bool = True) -> Optional[Credentials]:
        """Loads stored credentials; returns None if missing, lacking scopes, or unrefreshable."""
        if not self.token_path.exists():
            self._bootstrap_token_from_env()
        if not self.token_path.exists():
            return None
        try:
            creds = Credentials.from_authorized_user_file(str(self.token_path))
        except Exception as e:
            logger.warning(f"Không thể đọc file token Gmail: {e}")
            return None

        if not creds.has_scopes(SCOPES_GMAIL):
            logger.info("Token Gmail thiếu scope (cần gmail.readonly + gmail.send). Cần đăng nhập lại.")
            return None

        if creds.valid:
            return creds
        if creds.expired and creds.refresh_token:
            if not refresh:
                return creds
            try:
                logger.info("Đang tự động làm mới token Gmail...")
                creds.refresh(Request())
                self._save_creds(creds)
                return creds
            except Exception as exc:
                logger.warning(f"Làm mới token Gmail thất bại: {exc}. Cần xác thực lại.")
                return None
        return None

    def is_authenticated(self) -> bool:
        return self._load_creds(refresh=False) is not None

    def authenticate(self, interactive: bool = False, port: Optional[int] = None) -> Any:
        creds = self._load_creds()

        if not creds:
            if not interactive:
                raise PermissionError(f"Chưa đăng nhập Gmail (hoặc token hết hạn/thiếu quyền gửi). {AUTH_HINT}")
            if not self.creds_path.exists():
                raise FileNotFoundError(
                    f"Không tìm thấy OAuth credentials tại '{self.creds_path}'. "
                    f"Tạo OAuth client loại 'Desktop app' trên Google Cloud Console, tải JSON và lưu vào đường dẫn này."
                )
            oauth_port = settings.google_oauth_port if port is None else port
            ctype = self.client_type()
            if ctype is None:
                raise ValueError(f"File credentials '{self.creds_path}' không đúng định dạng OAuth client của Google.")
            if ctype == "web" and not oauth_port:
                raise ValueError(
                    "File credentials là loại 'web' nên không dùng được port ngẫu nhiên "
                    "(Google sẽ báo redirect_uri_mismatch). Hoặc tạo OAuth client loại 'Desktop app', "
                    "hoặc đăng ký redirect URI http://localhost:8765/ rồi đặt GOOGLE_OAUTH_PORT=8765 trong .env."
                )
            logger.info("Khởi động xác thực OAuth Gmail qua trình duyệt...")
            flow = InstalledAppFlow.from_client_secrets_file(str(self.creds_path), SCOPES_GMAIL)
            creds = flow.run_local_server(port=oauth_port, open_browser=True)
            self._save_creds(creds)

        self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        return self._service

    def get_service(self):
        if not self._service:
            self.authenticate(interactive=False)
        return self._service

    # ------------------------------------------------------------------ send
    def get_profile_email(self) -> str:
        profile = self.get_service().users().getProfile(userId="me").execute()
        return profile.get("emailAddress", "")

    @staticmethod
    def build_message(
        to: List[str],
        subject: str,
        body: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        is_html: bool = False,
    ) -> MimeEmailMessage:
        to_list = _validate_addresses(to, "to", required=True)
        cc_list = _validate_addresses(cc, "cc")
        bcc_list = _validate_addresses(bcc, "bcc")
        subject = subject or ""
        if "\r" in subject or "\n" in subject:
            raise ValueError("Tiêu đề email không được chứa ký tự xuống dòng.")

        msg = MimeEmailMessage()
        msg["To"] = ", ".join(to_list)
        if cc_list:
            msg["Cc"] = ", ".join(cc_list)
        if bcc_list:
            msg["Bcc"] = ", ".join(bcc_list)
        msg["Subject"] = subject
        if is_html:
            msg.set_content(_clean_html_tags(body or "") or " ")
            msg.add_alternative(body or "", subtype="html")
        else:
            msg.set_content(body or "")
        return msg

    def send_email(
        self,
        to: List[str],
        subject: str,
        body: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        is_html: bool = False,
    ) -> Dict[str, Any]:
        """Sends an email through Gmail API (users.messages.send). Validates input before any API call."""
        msg = self.build_message(to, subject, body, cc=cc, bcc=bcc, is_html=is_html)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        service = self.get_service()
        try:
            sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        except HttpError as exc:
            status = getattr(exc.resp, "status", "?")
            reason = exc._get_reason() if hasattr(exc, "_get_reason") else str(exc)
            logger.error(f"Gmail API gửi mail thất bại (HTTP {status}): {reason}")
            raise RuntimeError(f"Gmail API lỗi HTTP {status}: {reason}") from exc

        logger.info(f"Đã gửi email qua Gmail API (id={sent.get('id')}).")
        return {
            "success": True,
            "provider": "gmail",
            "message_id": sent.get("id"),
            "thread_id": sent.get("threadId"),
            "label_ids": sent.get("labelIds", []),
        }

    def fetch_unread_emails(
        self,
        label: str = "INBOX",
        allowed_senders: Optional[List[str]] = None,
        limit: int = 10,
        unread_only: bool = True,
    ) -> List[EmailMessage]:
        """
        Fetches emails from Gmail with sender filtering and extracts PDF attachments.
        If unread_only=True, only fetches unread messages; otherwise fetches recent messages in label.
        """
        service = self.get_service()
        query = f"is:unread label:{label}" if unread_only else f"label:{label}"
        try:
            res = service.users().messages().list(
                userId="me",
                q=query,
                maxResults=limit,
            ).execute()
            messages_meta = res.get("messages", [])
        except Exception as exc:
            logger.error(f"Lỗi khi truy vấn danh sách email từ Gmail: {exc}")
            return []

        results: List[EmailMessage] = []

        for meta in messages_meta:
            msg_id = meta["id"]
            try:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=msg_id,
                    format="full",
                ).execute()

                payload = msg_data.get("payload", {})
                headers_list = payload.get("headers", [])
                headers_dict = {h["name"].lower(): h["value"] for h in headers_list}

                subject = headers_dict.get("subject", "(Không có tiêu đề)")
                from_raw = headers_dict.get("from", "")
                date_str = headers_dict.get("date", "")

                sender_name = from_raw
                sender_email = from_raw
                if "<" in from_raw and ">" in from_raw:
                    sender_name = from_raw.split("<")[0].strip(" \"'")
                    sender_email = from_raw.split("<")[1].split(">")[0].strip().lower()

                # Filter sender
                if allowed_senders:
                    sender_low = sender_email.lower()
                    if not any(s.lower() in sender_low or s.lower() in sender_name.lower() for s in allowed_senders):
                        continue

                # Parse body and attachments
                body_parts = []
                attachments: List[EmailAttachment] = []

                def _walk_parts(parts):
                    for part in parts:
                        mime_type = part.get("mimeType", "")
                        body_info = part.get("body", {})
                        filename = part.get("filename", "")

                        if filename:
                            is_pdf = filename.lower().endswith(".pdf")
                            att_id = body_info.get("attachmentId")
                            att_data = b""

                            # Fetch attachment data if attachmentId present
                            if att_id:
                                try:
                                    att_obj = service.users().messages().attachments().get(
                                        userId="me",
                                        messageId=msg_id,
                                        id=att_id,
                                    ).execute()
                                    att_data = _decode_base64_data(att_obj.get("data", ""))
                                except Exception as att_err:
                                    logger.warning(f"Lỗi tải attachment '{filename}': {att_err}")
                            elif "data" in body_info:
                                att_data = _decode_base64_data(body_info["data"])

                            attachments.append(
                                EmailAttachment(
                                    filename=filename,
                                    content_type=mime_type,
                                    data=att_data,
                                    is_pdf=is_pdf,
                                )
                            )
                        elif mime_type == "text/plain":
                            data_b64 = body_info.get("data", "")
                            if data_b64:
                                body_parts.append(_decode_base64_data(data_b64).decode("utf-8", errors="ignore"))
                        elif mime_type == "text/html" and not body_parts:
                            data_b64 = body_info.get("data", "")
                            if data_b64:
                                html_text = _decode_base64_data(data_b64).decode("utf-8", errors="ignore")
                                body_parts.append(_clean_html_tags(html_text))

                        if "parts" in part:
                            _walk_parts(part["parts"])

                if "parts" in payload:
                    _walk_parts(payload["parts"])
                else:
                    data_b64 = payload.get("body", {}).get("data", "")
                    if data_b64:
                        body_parts.append(_decode_base64_data(data_b64).decode("utf-8", errors="ignore"))

                body_text = "\n".join(body_parts).strip()

                results.append(
                    EmailMessage(
                        id=f"gmail-{msg_id}",
                        subject=subject,
                        sender_name=sender_name or sender_email,
                        sender_email=sender_email,
                        received_time=date_str,
                        body=body_text,
                        folder=label,
                        has_attachments=len(attachments) > 0,
                        attachments=attachments,
                    )
                )
            except Exception as msg_err:
                logger.error(f"Lỗi xử lý email id={msg_id}: {msg_err}")

        return results


gmail_service = GmailService()
