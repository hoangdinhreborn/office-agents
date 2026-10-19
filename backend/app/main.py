from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.chat import router as chat_router
from app.api.documents import router as documents_router
from app.api.emails import router as emails_router
from app.api.calendar import router as calendar_router
from app.api.solutions import router as solutions_router
from app.api.feedback import router as feedback_router
from app.api.tasks import router as tasks_router
from app.database.database import init_db
from app.services.email_poller import email_poller


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite tables on startup
    init_db()
    # Start background email poller (outbound polling daemon)
    try:
        email_poller.start()
    except Exception as exc:
        pass
    yield
    # Shutdown poller on application termination
    try:
        email_poller.stop()
    except Exception:
        pass


app = FastAPI(
    title="Local AI Assistant - Multi-Agent Framework",
    version="1.0.0",
    description="Local Multi-Agent AI Framework powered by DeepSeek-R1 (Reinforcement Learning) with Google Workspace (Gmail & Calendar) & PDF Integration",
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
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(emails_router)
app.include_router(calendar_router)
app.include_router(solutions_router)
app.include_router(feedback_router)
app.include_router(tasks_router)

# Mount static folder
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")


@app.get("/", response_class=HTMLResponse, tags=["Dashboard Web UI"])
def serve_dashboard():
    """
    Serves the modern interactive Web Dashboard.
    """
    index_file = static_path / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return HTMLResponse("<h1>Local AI Assistant Backend Running</h1><p>Visit /docs for API documentation.</p>")


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "ok", "app": "Local AI Assistant Multi-Agent Framework"}
