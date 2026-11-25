"""OAuth-only browser entry; no Google tokens are returned to the frontend."""
import logging
from urllib.parse import urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse

from app.config import settings
from app.services import google_oauth

router = APIRouter(prefix="/api/auth/google", tags=["Google OAuth"])
logger = logging.getLogger(__name__)


def _return(error: str | None = None):
    try:
        destination = google_oauth.frontend_url()
    except google_oauth.OAuthFailure:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse("GOOGLE_OAUTH_FRONTEND_URL chưa hợp lệ; hãy cấu hình URL frontend rồi đăng nhập lại.",
                                 status_code=503, headers={"Cache-Control": "no-store"})
    response = RedirectResponse(destination + "/?" + urlencode(
        {"oauth_error": error} if error else {"oauth": "connected"}), status_code=303)
    response.delete_cookie(google_oauth.COOKIE_NAME, path="/")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get("/status")
def google_status():
    from fastapi.responses import JSONResponse
    return JSONResponse(google_oauth.status(), headers={"Cache-Control": "no-store"})


@router.get("/start")
def start_login(request: Request):
    try:
        google_oauth.client_config()
        callback_url = urlsplit(settings.google_oauth_redirect_uri)
        canonical_origin = urlunsplit((callback_url.scheme, callback_url.netloc, "", "", ""))
        # localhost and 127.0.0.1 have different cookies. Establish the nonce at
        # the callback's canonical origin, regardless of VITE_API_BASE_URL.
        if str(request.base_url).rstrip("/") != canonical_origin:
            response = RedirectResponse(canonical_origin + "/api/auth/google/start", status_code=303)
            response.headers["Cache-Control"] = "no-store"
            return response
        url, state = google_oauth.begin()
    except google_oauth.OAuthFailure as exc:
        return _return(exc.code)
    response = RedirectResponse(url, status_code=303)
    response.set_cookie(google_oauth.COOKIE_NAME, state, max_age=google_oauth.TTL,
                        httponly=True, secure=settings.google_oauth_redirect_uri.startswith("https://"),
                        samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get("/callback")
def callback(request: Request, state: str = Query("", max_length=512),
             code: str = Query("", max_length=8192), error: str = Query("", max_length=256)):
    try:
        google_oauth.complete(state, request.cookies.get(google_oauth.COOKIE_NAME, ""), code, bool(error))
    except google_oauth.OAuthFailure as exc:
        return _return(exc.code)
    except Exception as exc:
        # Exceptions from OAuth libraries may contain authorization codes/tokens.
        logger.warning("Google OAuth exchange failed (%s)", type(exc).__name__)
        return _return("exchange")
    return _return()
