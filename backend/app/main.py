from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.documents import router as documents_router
from app.api.emails import router as emails_router
from app.api.calendar import router as calendar_router
from app.api.solutions import router as solutions_router
from app.api.feedback import router as feedback_router
from app.api.tasks import router as tasks_router
from app.api.projects import router as projects_router
from app.api.llm import router as llm_router
from app.services.llm_settings import LLMError
from app.config import settings
from app.database.database import init_db
from app.services.email_poller import email_poller


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite tables on startup
    init_db()
    # Start background email poller (outbound polling daemon)
    if settings.email_poller_enabled:
        email_poller.start()
    yield
    # Shutdown poller on application termination
    try:
        email_poller.stop()
    except Exception:
        pass


app = FastAPI(
    title="deskhive-harness",
    version="1.0.0",
    description="Trợ lý dự án: email, PDF, giải pháp và lịch làm việc với nhiều nhà cung cấp AI.",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(emails_router)
app.include_router(calendar_router)
app.include_router(solutions_router)
app.include_router(feedback_router)
app.include_router(tasks_router)
app.include_router(projects_router)
app.include_router(llm_router)


@app.middleware("http")
async def hide_oauth_callback_query(request, call_next):
    try:
        return await call_next(request)
    finally:
        if request.url.path == "/api/auth/google/callback" or (
            request.url.path == "/" and "state" in request.query_params
        ):
            # Uvicorn logs the scope after responding; never retain auth codes
            # in its access-log request target, including invalid callbacks.
            request.scope["query_string"] = b""


@app.exception_handler(LLMError)
async def llm_error_handler(request, exc: LLMError):
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc: RequestValidationError):
    if not request.url.path.startswith("/api/llm/"):
        return await request_validation_exception_handler(request, exc)
    # Never echo submitted API keys or other request values in validation responses.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]})


@app.get("/api/account", tags=["Local account"])
def local_account():
    from app.services.google_oauth import account_profile
    profile = account_profile()
    return {"name": (settings.owner_name if settings.owner_name != "Chủ máy" else profile.get("name")) or "Chủ máy",
            "email": settings.owner_email or profile.get("email", ""), "role": "Chủ máy", "avatarUrl": ""}

# Mount static folder
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")


@app.get("/", response_class=HTMLResponse, tags=["Dashboard Web UI"])
def serve_dashboard(request: Request):
    """Serve the legacy dashboard or receive a Desktop client's loopback callback."""
    query = request.query_params
    if "state" in query and ("code" in query or "error" in query):
        from app.api.auth import callback
        return callback(request, state=query.get("state", ""), code=query.get("code", ""), error=query.get("error", ""))
    index_file = static_path / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return HTMLResponse("<h1>deskhive-harness Backend Running</h1><p>Visit /docs for API documentation.</p>")


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "ok", "app": "deskhive-harness"}
