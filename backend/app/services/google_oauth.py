"""Browser OAuth bridge; Google credentials remain in the backend token files."""
from dataclasses import dataclass
import json
import os
from pathlib import Path
import secrets
import tempfile
from threading import RLock
import time
from urllib.parse import urlsplit, urlunsplit

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.config import resolve_path, settings
from app.integrations.gmail import gmail_service, SCOPES_GMAIL
from app.integrations.google_calendar import google_calendar, SCOPES_CALENDAR

SCOPES = list(dict.fromkeys(SCOPES_GMAIL + SCOPES_CALENDAR + [
    "openid", "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]))
COOKIE_NAME = "soviec_oauth_state"
TTL = 600
_lock = RLock()


class OAuthFailure(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass
class PendingLogin:
    flow: Flow
    nonce: str
    expires_at: float


_pending: dict[str, PendingLogin] = {}


def frontend_url() -> str:
    value = settings.google_oauth_frontend_url.rstrip("/")
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise OAuthFailure("configuration")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise OAuthFailure("configuration")
    return value


def client_config() -> dict:
    frontend_url()
    callback = urlsplit(settings.google_oauth_redirect_uri)
    if callback.scheme not in ("http", "https") or not callback.hostname or callback.username or callback.password or callback.query or callback.fragment:
        raise OAuthFailure("configuration")
    if callback.scheme == "http" and callback.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise OAuthFailure("configuration")
    if not gmail_service.is_configured():
        raise OAuthFailure("configuration")
    try:
        config = json.loads(gmail_service.creds_path.read_text(encoding="utf-8"))
        kind = "web" if "web" in config else "installed"
        client = config[kind]
        if not client.get("client_id") or not client.get("client_secret"):
            raise ValueError("Missing client configuration")
        if kind == "installed" and (callback.scheme != "http" or callback.hostname not in ("localhost", "127.0.0.1", "::1")):
            raise ValueError("Desktop clients require HTTP loopback")
        if kind == "web" and settings.google_oauth_redirect_uri not in client.get("redirect_uris", []):
            raise ValueError("Callback must be registered for web client")
        # Use Google's endpoints rather than routing tokens through config-provided URLs.
        return {kind: {**client, "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
                              "token_uri": "https://oauth2.googleapis.com/token"}}
    except (ValueError, KeyError, TypeError, AttributeError, OSError):
        raise OAuthFailure("configuration") from None


def _connected(path: Path, scopes: list[str]) -> bool:
    if not path.exists():
        return False
    try:
        creds = Credentials.from_authorized_user_file(str(path))
        return bool(creds.has_scopes(scopes) and (creds.valid or creds.refresh_token))
    except (ValueError, TypeError, OSError):
        return False


def status() -> dict:
    try:
        client_config()
        configured = True
    except OAuthFailure:
        configured = False
    gmail = _connected(gmail_service.token_path, SCOPES_GMAIL)
    calendar = _connected(google_calendar.token_path, SCOPES_CALENDAR)
    return {"configured": configured, "authenticated": gmail and calendar,
            "gmail_connected": gmail, "calendar_connected": calendar,
            "configuration_error": None if configured else
            "Chưa có cấu hình Google OAuth hợp lệ. Với client Web, đăng ký đúng GOOGLE_OAUTH_REDIRECT_URI trong Google Cloud và file credentials. Mặc định: http://localhost:8000/api/auth/google/callback."}


def begin() -> tuple[str, str]:
    config = client_config()
    nonce = secrets.token_urlsafe(32)
    redirect_uri = settings.google_oauth_redirect_uri
    if "installed" in config:
        # Match the root loopback callback used by the existing Python script.
        parsed = urlsplit(redirect_uri)
        redirect_uri = urlunsplit((parsed.scheme, parsed.netloc, "/", "", ""))
    flow = Flow.from_client_config(config, scopes=SCOPES,
                                  redirect_uri=redirect_uri,
                                  autogenerate_code_verifier=True)
    url, state = flow.authorization_url(access_type="offline", prompt="consent select_account",
                                        include_granted_scopes="true", nonce=nonce,
                                        **({"login_hint": settings.owner_email} if settings.owner_email else {}))
    with _lock:
        now = time.monotonic()
        for key in list(_pending):
            if _pending[key].expires_at <= now:
                del _pending[key]
        if len(_pending) >= 32:
            raise OAuthFailure("busy")
        _pending[state] = PendingLogin(flow, nonce, now + TTL)
    return url, state


def _atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp = tempfile.mkstemp(prefix=".oauth-", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def account_profile() -> dict:
    try:
        data = json.loads(resolve_path("data/tokens/google_account.json").read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        return {key: data[key] for key in ("name", "email", "avatarUrl") if isinstance(data.get(key), str)}
    except (OSError, ValueError, TypeError):
        return {}


def complete(state: str, browser_state: str, code: str, denied: bool = False) -> None:
    if not state or len(state) > 512 or not browser_state or not state.isascii() or not secrets.compare_digest(state, browser_state):
        raise OAuthFailure("invalid_state")
    with _lock:
        pending = _pending.pop(state, None)
    if not pending or pending.expires_at <= time.monotonic():
        raise OAuthFailure("expired")
    if denied:
        raise OAuthFailure("denied")
    if not code or len(code) > 8192:
        raise OAuthFailure("exchange")
    # Pass code directly: no insecure-transport environment override for HTTP loopback callbacks.
    try:
        pending.flow.fetch_token(code=code, timeout=30)
    except Warning as changed:
        # oauthlib refuses changed scopes, including previously granted extras.
        # Recover the already exchanged token once, never resend the auth code.
        token = getattr(changed, "token", None)
        granted_scopes = set(getattr(changed, "new_scope", []))
        if not token or not set(SCOPES_GMAIL + SCOPES_CALENDAR + ["openid"]).issubset(granted_scopes):
            raise OAuthFailure("missing_scopes") from None
        pending.flow.oauth2session.scope = list(granted_scopes)
        pending.flow.oauth2session.token = dict(token)
    creds = pending.flow.credentials
    granted = pending.flow.oauth2session.token.get("scope", [])
    granted = granted.split() if isinstance(granted, str) else granted
    if not isinstance(granted, list) or not set(SCOPES_GMAIL + SCOPES_CALENDAR).issubset(set(granted)):
        raise OAuthFailure("missing_scopes")
    if not creds.refresh_token or not creds.id_token:
        raise OAuthFailure("missing_scopes")
    claims = id_token.verify_oauth2_token(creds.id_token, GoogleRequest(), pending.flow.client_config["client_id"])
    if claims.get("nonce") != pending.nonce or claims.get("email_verified") is not True or not claims.get("email"):
        raise OAuthFailure("identity")
    if settings.owner_email and claims["email"].casefold() != settings.owner_email.strip().casefold():
        raise OAuthFailure("wrong_account")
    profile = {"name": claims.get("name") or claims["email"], "email": claims["email"], "avatarUrl": ""}
    payload = creds.to_json().encode("utf-8")
    writes = {gmail_service.token_path: payload, google_calendar.token_path: payload,
              resolve_path("data/tokens/google_account.json"): json.dumps(profile, ensure_ascii=False).encode("utf-8")}
    # Prevent partially switching the live Gmail/Calendar pair and invalidate cached HTTP clients.
    with _lock, gmail_service._http_lock, google_calendar._lock:
        previous = {path: path.read_bytes() if path.exists() else None for path in writes}
        completed = []
        try:
            for path, content in writes.items():
                _atomic_write(path, content)
                completed.append(path)
        except OSError:
            for path in reversed(completed):
                if previous[path] is None:
                    path.unlink(missing_ok=True)
                else:
                    _atomic_write(path, previous[path])
            raise OAuthFailure("storage") from None
        gmail_service._service = None
        google_calendar._service = None
