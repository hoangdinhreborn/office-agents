import base64
from email.message import EmailMessage as MimeEmailMessage
from email.utils import parseaddr
import json
import logging
from pathlib import Path
import re
from threading import RLock
from typing import Any, Callable, Dict, List, Optional
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google_auth_httplib2 import AuthorizedHttp
import httplib2
from googleapiclient.errors import HttpError

from app.config import resolve_path, settings
from app.schemas.email import EmailAttachment, EmailMessage

logger = logging.getLogger(__name__)

SCOPES_GMAIL = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
]
AUTH_HINT = "Mở trang đăng nhập deskhive-harness và chọn Tiếp tục với Google để cấp lại quyền Gmail/Calendar."
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
    - Scopes: gmail.modify + gmail.send.
    - Non-interactive by default: the API / poller never opens a browser.
    - Querying by label and sender filtering.
    - Attachment extraction (PDF bytes).
    """

    def __init__(self):
        self.creds_path = self._resolve_credentials_path()
        self.token_path = resolve_path(settings.google_gmail_token_path)
        self._bootstrap_token_from_env()
        self._service = None
        self._http_lock = RLock()
        self.last_next_page_token: Optional[str] = None

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
                            "project_id": settings.google_project_id.strip() or "deskhive-harness",
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
            logger.info("Token Gmail thiếu scope (cần gmail.modify + gmail.send). Cần đăng nhập lại.")
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

        self._service = build("gmail", "v1", http=AuthorizedHttp(creds, http=httplib2.Http(timeout=settings.gmail_api_timeout)), cache_discovery=False)
        return self._service

    def get_service(self, force_refresh: bool = False):
        if force_refresh:
            self._service = None
        if not self._service:
            self.authenticate(interactive=False)
        return self._service

    def _execute_with_retry(self, fn, max_retries: int = 2):
        # The UI and the background worker share a non-thread-safe httplib2 client.
        with self._http_lock:
            return self._execute_locked(fn, max_retries)

    def _execute_locked(self, fn, max_retries: int = 2):
        """
        Executes a Gmail API operation with automatic recovery against stale SSL sockets,
        [SSL: RECORD_LAYER_FAILURE], BrokenPipeError, ConnectionResetError, and transient timeouts.
        """
        last_exc = None
        for attempt in range(max_retries + 1):
            try:
                svc = self.get_service(force_refresh=(attempt > 0))
                return fn(svc)
            except Exception as exc:
                last_exc = exc
                exc_str = str(exc).lower()
                is_ssl_or_conn = any(
                    err in exc_str
                    for err in [
                        "record_layer_failure",
                        "ssl",
                        "broken pipe",
                        "connection reset",
                        "connection aborted",
                        "timeout",
                        "handshake",
                        "eof occurred in violation of protocol",
                        "transport",
                    ]
                )
                if is_ssl_or_conn and attempt < max_retries:
                    logger.warning(
                        f"Gmail API gặp lỗi kết nối/SSL ({exc}), đang làm mới kết nối và thử lại (lần {attempt + 1}/{max_retries})..."
                    )
                    self._service = None
                    time.sleep(0.5)
                    continue
                raise last_exc

    # ------------------------------------------------------------------ send
    def get_profile_email(self) -> str:
        profile = self._execute_with_retry(lambda s: s.users().getProfile(userId="me").execute())
        return profile.get("emailAddress", "")

    @staticmethod
    def build_message(
        to: List[str],
        subject: str,
        body: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        is_html: bool = False,
        attachments: Optional[List[EmailAttachment]] = None,
        headers: Optional[Dict[str, str]] = None,
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
        for name, value in (headers or {}).items():
            if name not in {"From", "Message-ID", "In-Reply-To", "References"} or "\r" in value or "\n" in value:
                raise ValueError("Header email không hợp lệ.")
            if value:
                msg[name] = value
        for attachment in attachments or []:
            mime = attachment.content_type or "application/octet-stream"
            maintype, subtype = mime.split("/", 1) if "/" in mime else ("application", "octet-stream")
            msg.add_attachment(attachment.data, maintype=maintype, subtype=subtype, filename=attachment.filename)
        return msg

    def send_prepared_message(self, message: MimeEmailMessage, thread_id: Optional[str] = None) -> Dict[str, Any]:
        payload = {"raw": base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")}
        if thread_id:
            payload["threadId"] = thread_id
        # Sending is not idempotent. A lost response must be reconciled by
        # Message-ID instead of replaying this write or refreshing and retrying.
        result = self._execute_with_retry(
            lambda s: s.users().messages().send(userId="me", body=payload).execute(num_retries=0), max_retries=0)
        if not result.get("id"):
            raise RuntimeError("Gmail chưa trả Message ID xác nhận gửi.")
        return {"message_id": result["id"], "thread_id": result.get("threadId")}

    def reply_headers(self, message_id: str) -> dict:
        clean_id = message_id.removeprefix("gmail-")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", clean_id):
            raise ValueError("ID thư gốc không hợp lệ.")
        result = self._execute_with_retry(lambda s: s.users().messages().get(
            userId="me", id=clean_id, format="metadata", metadataHeaders=["Message-ID", "References", "Subject"]).execute())
        headers = {h["name"].lower(): h["value"] for h in result.get("payload", {}).get("headers", [])}
        message_id = headers.get("message-id", "")
        if not message_id or not result.get("threadId"):
            raise ValueError("Thư gốc thiếu Message-ID hoặc threadId để phản hồi đúng luồng.")
        return {"thread_id": result["threadId"], "in_reply_to": message_id,
                "references": (headers.get("references", "") + " " + message_id).strip(), "subject": headers.get("subject", "")}

    def find_sent_message(self, rfc_message_id: str) -> Optional[dict]:
        # Read-only reconciliation, including after a process restart. Absence
        # is not proof of non-delivery because Gmail search can be delayed.
        query = "in:sent rfc822msgid:" + rfc_message_id.strip("<>")
        result = self._execute_with_retry(lambda s: s.users().messages().list(userId="me", q=query, maxResults=2).execute())
        matches = result.get("messages", [])
        if len(matches) != 1:
            return None
        return {"message_id": matches[0]["id"], "thread_id": matches[0].get("threadId")}

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
        try:
            sent = self.send_prepared_message(msg)
        except HttpError as exc:
            status = getattr(exc.resp, "status", "?")
            reason = exc._get_reason() if hasattr(exc, "_get_reason") else str(exc)
            logger.error(f"Gmail API gửi mail thất bại (HTTP {status}): {reason}")
            raise RuntimeError(f"Gmail API lỗi HTTP {status}: {reason}") from exc

        logger.info(f"Đã gửi email qua Gmail API (id={sent.get('message_id')}).")
        return {
            "success": True,
            "provider": "gmail",
            "message_id": sent.get("message_id"),
            "thread_id": sent.get("thread_id"),
            "label_ids": sent.get("labelIds", []),
        }

    def fetch_unread_emails(
        self, label: str = "INBOX", allowed_senders: Optional[List[str]] = None,
        limit: int = 10, unread_only: bool = True, page_token: Optional[str] = None,
    ) -> List[EmailMessage]:
        # Compatibility for legacy callers; project sync uses an explicit per-call cursor.
        results, next_page = self.fetch_email_page(label, allowed_senders, limit, unread_only, page_token)
        self.last_next_page_token = next_page
        return results

    def fetch_email_page(
        self,
        label: str = "INBOX",
        allowed_senders: Optional[List[str]] = None,
        limit: int = 10,
        unread_only: bool = True,
        page_token: Optional[str] = None,
        label_id: Optional[str] = None,
        skip_message_ids: Optional[set[str]] = None,
        on_message: Optional[Callable[[EmailMessage], None]] = None,
    ) -> tuple[List[EmailMessage], Optional[str]]:
        """
        Fetches emails from Gmail with sender filtering and extracts PDF attachments.
        If unread_only=True, only fetches unread messages; otherwise fetches recent messages in label.
        Supports page_token for incremental scanning and resilient SSL retries.
        """
        lbl_clean = label.strip() if label else "INBOX"
        lbl_expr = '"' + lbl_clean.replace("\\", "\\\\").replace('"', '\\"') + '"'
        query = ("is:unread" if unread_only else "") if label_id else (f"is:unread label:{lbl_expr}" if unread_only else f"label:{lbl_expr}")
        if allowed_senders:
            senders = [parseaddr(sender)[1].strip().lower() for sender in allowed_senders]
            if any(not re.fullmatch(r"[^\s<>\"{}()]+@[^\s<>\"{}()]+", sender) for sender in senders):
                raise ValueError("Địa chỉ người gửi không hợp lệ.")
            query += " {" + " ".join(f"from:{sender}" for sender in senders) + "}"

        try:
            def _list_call(svc):
                kwargs = {
                    "userId": "me",
                    "q": query,
                    "maxResults": limit,
                }
                if page_token:
                    kwargs["pageToken"] = page_token
                if label_id:
                    kwargs["labelIds"] = [label_id]
                return svc.users().messages().list(**kwargs).execute()

            res = self._execute_with_retry(_list_call)
            messages_meta = res.get("messages", [])
            next_page_token = res.get("nextPageToken")
        except Exception as exc:
            logger.error(f"Lỗi khi truy vấn danh sách email từ Gmail: {exc}")
            raise RuntimeError("Không truy vấn được danh sách Gmail.") from exc

        results: List[EmailMessage] = []

        for meta in messages_meta:
            msg_id = meta["id"]
            if skip_message_ids and f"gmail-{msg_id}" in skip_message_ids:
                continue
            try:
                def _get_call(svc):
                    return svc.users().messages().get(
                        userId="me",
                        id=msg_id,
                        format="full",
                    ).execute()

                msg_data = self._execute_with_retry(_get_call)

                payload = msg_data.get("payload", {})
                headers_list = payload.get("headers", [])
                headers_dict = {h["name"].lower(): h["value"] for h in headers_list}

                subject = headers_dict.get("subject", "(Không có tiêu đề)")
                from_raw = headers_dict.get("from", "")
                date_str = headers_dict.get("date", "")

                sender_name, sender_email = parseaddr(from_raw)
                sender_email = sender_email.strip().lower()
                if allowed_senders and sender_email not in {parseaddr(s)[1].strip().lower() for s in allowed_senders}:
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
                            is_pdf = filename.lower().endswith(".pdf") or mime_type.lower() == "application/pdf"
                            att_id = body_info.get("attachmentId")
                            att_data = b""
                            if is_pdf and body_info.get("data"):
                                att_data = _decode_base64_data(body_info["data"])

                            # Fetch attachment data if attachmentId present
                            if is_pdf and att_id:
                                try:
                                    att_obj = self._execute_with_retry(
                                        lambda svc: svc.users().messages().attachments().get(
                                            userId="me",
                                            messageId=msg_id,
                                            id=att_id,
                                        ).execute()
                                    )
                                    att_data = _decode_base64_data(att_obj.get("data", ""))
                                except Exception as att_err:
                                    logger.warning(f"Lỗi tải attachment '{filename}': {att_err}")
                            elif is_pdf and "data" in body_info:
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

                message = EmailMessage(
                        id=f"gmail-{msg_id}",
                        subject=subject,
                        sender_name=sender_name or sender_email,
                        sender_email=sender_email,
                        received_time=date_str,
                        body=body_text,
                        folder=label,
                        has_attachments=len(attachments) > 0,
                        attachments=attachments,
                        label_ids=msg_data.get("labelIds", []),
                )
                if on_message:
                    on_message(message)
                else:
                    results.append(message)
            except Exception as msg_err:
                raise RuntimeError(f"Không tải được email Gmail {msg_id}.") from msg_err

        return results, next_page_token

    def get_message_identity(self, message_id: str) -> dict:
        clean_id = message_id.removeprefix("gmail-").strip()
        if not clean_id or not re.fullmatch(r"[A-Za-z0-9_-]+", clean_id):
            raise ValueError("ID Gmail không hợp lệ.")
        result = self._execute_with_retry(lambda service: service.users().messages().get(
            userId="me", id=clean_id, format="metadata", metadataHeaders=["From", "Subject"],
        ).execute())
        headers = {header["name"].lower(): header["value"] for header in result.get("payload", {}).get("headers", [])}
        return {"message_id": f"gmail-{clean_id}", "sender_email": parseaddr(headers.get("from", ""))[1].strip().lower(),
                "subject": headers.get("subject", ""), "label_ids": result.get("labelIds", [])}

    # ------------------------------------------------------------------ label management
    def list_user_labels(self) -> List[Dict[str, Any]]:
        """Lists all labels available in user's Gmail account with SSL auto-recovery."""
        try:
            res = self._execute_with_retry(lambda s: s.users().labels().list(userId="me").execute())
            return res.get("labels", [])
        except Exception as exc:
            logger.warning(f"Lỗi khi lấy danh sách nhãn Gmail: {exc}")
            return []

    def get_or_create_label(self, label_name: str) -> Optional[str]:
        """Finds existing Gmail label by name or creates it if not found with SSL auto-recovery."""
        if not label_name or label_name.upper() in ["INBOX", "SENT", "TRASH", "SPAM", "STARRED", "IMPORTANT"]:
            return label_name.upper()

        try:
            labels = self.list_user_labels()
            for lbl in labels:
                if lbl.get("name", "").strip().lower() == label_name.strip().lower():
                    return lbl.get("id")

            # Label does not exist, create new label
            body = {
                "name": label_name.strip(),
                "labelListVisibility": "labelShow",
                "messageListVisibility": "show",
            }
            created = self._execute_with_retry(
                lambda s: s.users().labels().create(userId="me", body=body).execute()
            )
            logger.info(f"Đã tạo nhãn Gmail mới: '{label_name}' (id={created.get('id')})")
            return created.get("id")
        except Exception as exc:
            logger.warning(f"Không thể tạo/truy vấn nhãn Gmail '{label_name}': {exc}")
            return None

    def add_label_to_message(self, message_id: str, label_name: str, label_id: Optional[str] = None) -> bool:
        """Attaches a label to a Gmail message by ID with SSL auto-recovery."""
        clean_id = message_id.removeprefix("gmail-").strip()
        try:
            label_id = label_id or self.get_or_create_label(label_name)
            if not label_id:
                return False

            self._execute_with_retry(
                lambda s: s.users().messages().modify(
                    userId="me",
                    id=clean_id,
                    body={"addLabelIds": [label_id]},
                ).execute()
            )
            logger.info(f"Đã gắn nhãn '{label_name}' cho email '{clean_id}'.")
            return True
        except Exception as exc:
            logger.warning(f"Lỗi khi gắn nhãn Gmail '{label_name}' cho email '{clean_id}': {exc}")
            return False


gmail_service = GmailService()
