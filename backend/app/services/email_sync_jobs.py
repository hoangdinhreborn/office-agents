"""One bounded background worker shared by manual sync and the project poller."""
from copy import deepcopy
from datetime import datetime, timezone
from threading import RLock, Thread
from queue import Queue
from uuid import uuid4
import logging

from app.database.database import SessionLocal
from app.services.email_ingest import sync_project_emails

logger = logging.getLogger(__name__)
_pending = Queue()
_worker: Thread | None = None
_lock = RLock()
_jobs: dict[str, dict] = {}


def job_status(project_id):
    with _lock:
        return deepcopy(_jobs.get(project_id, {"id": None, "status": "idle", "result": None, "error": None}))


def forget_job(project_id):
    with _lock:
        _jobs.pop(project_id, None)


def start_job(project_id):
    global _worker
    with _lock:
        if _jobs.get(project_id, {}).get("status") in ("queued", "running"):
            return job_status(project_id)
        job_id = str(uuid4())
        _jobs[project_id] = {"id": job_id, "status": "queued", "result": None, "error": None,
                             "started_at": datetime.now(timezone.utc).isoformat()}
        _pending.put((project_id, job_id))
        if _worker is None or not _worker.is_alive():
            _worker = Thread(target=_work_loop, name="email-sync", daemon=True)
            _worker.start()
        return job_status(project_id)


def _work_loop():
    while True:
        project_id, job_id = _pending.get()
        try:
            _run(project_id, job_id)
        finally:
            _pending.task_done()


def _run(project_id, job_id):
    with _lock:
        if _jobs.get(project_id, {}).get("id") != job_id:
            return
    def update(**fields):
        with _lock:
            if _jobs.get(project_id, {}).get("id") == job_id:
                _jobs[project_id].update(fields)
    update(status="running")
    try:
        with SessionLocal() as db:
            result = sync_project_emails(db, project_id, limit=20, progress=lambda value: update(result=deepcopy(value)))
        update(status="complete", result=result)
    except Exception:
        logger.warning("Email sync job failed project_id=%s", project_id)
        update(status="error", error="Lượt đồng bộ bị gián đoạn. Các email đã lưu được giữ lại; kiểm tra OAuth, PDF/OCR và provider.")
