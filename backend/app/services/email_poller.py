"""Schedule project-specific Gmail sync; never sends mail or creates calendar events."""
from datetime import datetime, timedelta
import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

from app.database.database import SessionLocal
from app.database.models import ProjectRecord
from app.services.email_sync_jobs import start_job

logger = logging.getLogger(__name__)


class EmailPoller:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.is_running = False
        self._last_attempt: dict[str, datetime] = {}

    def start(self, interval_minutes: Optional[int] = None):
        if self.is_running:
            return
        # A short dispatcher checks each project's own configured interval.
        self.scheduler.add_job(self.poll_once, "interval", minutes=interval_minutes or 1,
                               id="email_poller_job", replace_existing=True, max_instances=1,
                               next_run_time=datetime.now())
        self.scheduler.start()
        self.is_running = True

    def stop(self):
        if self.is_running:
            self.scheduler.shutdown(wait=False)
            self.is_running = False

    def poll_once(self, project_id: Optional[str] = None) -> dict:
        with SessionLocal() as db:
            if project_id:
                return start_job(project_id)
            projects = db.query(ProjectRecord).filter(ProjectRecord.deleted_at.is_(None),
                                                      ProjectRecord.mail_label_name.is_not(None)).all()
            results = []
            now = datetime.utcnow()
            for project in projects:
                last = self._last_attempt.get(project.id)
                interval = timedelta(minutes=max(1, project.mail_sync_interval_minutes))
                if last and now - last < interval:
                    continue
                self._last_attempt[project.id] = now
                try:
                    results.append({"project_id": project.id, **start_job(project.id)})
                except Exception:
                    db.rollback()
                    logger.warning("Project email sync failed project_id=%s", project.id)
                    results.append({"project_id": project.id, "error": "Không đồng bộ được Gmail; kiểm tra OAuth, nhãn và provider."})
            return {"projects": results, "events_scheduled": 0}


email_poller = EmailPoller()
