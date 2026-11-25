"""Bounded daily project memory, derived from saved analyses without another LLM call."""
from datetime import datetime, time, timedelta, timezone
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import resolve_path
from app.database.models import EmailProcessedRecord
from app.services.calendar_workflow import calendar_operation
from app.services.projects import owned_query, require_project
from app.services.report_citations import strip_report_citations

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
MEMORY_RESOURCE_ID = "__mail-overview-report__"
MAX_REPORT_WORDS = 600
MAX_HIGHLIGHTS = 10


def plain(text: str | None, words: int) -> str:
    value = strip_report_citations(text or "")
    value = re.sub(r"^#{1,6}[^\n]*", "", value, flags=re.MULTILINE)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[*`<>]", "", value)
    tokens = value.split()
    value = " ".join(tokens[:words])
    char_limit = words * 16 + 16
    return value[:char_limit] + ("…" if len(tokens) > words or len(value) > char_limit else "")


@calendar_operation
def daily_overview(db: Session, project_id: str) -> dict | None:
    # Use the same lock as project deletion: a reader must not recreate deleted files.
    project = require_project(db, project_id)
    query = owned_query(db, EmailProcessedRecord, project_id).filter_by(status="processed")
    if query.first() is None:
        return None
    today = datetime.now(VN_TZ).date()
    start = datetime.combine(today, time.min, VN_TZ).astimezone(timezone.utc).replace(tzinfo=None)
    end = start + timedelta(days=1)
    rows = query.filter(EmailProcessedRecord.processed_at >= start, EmailProcessedRecord.processed_at < end).all()
    rank = {"Khẩn cấp": 0, "Cao": 1, "Trung bình": 2, "Thấp": 3}
    rows.sort(key=lambda row: (rank.get(row.urgency, 2), not row.has_issue_to_solve, row.processed_at, row.id))
    highlights = rows[:MAX_HIGHLIGHTS]
    urgent = sum(row.urgency in ("Khẩn cấp", "Cao") for row in rows)
    issues = sum(bool(row.has_issue_to_solve) for row in rows)
    calendar = sum(bool(row.has_calendar_event) for row in rows)
    lines = [f"# Báo cáo tổng quan trong ngày — {today:%d/%m/%Y}",
             f"Dự án: {plain(project.title, 12)}. Email được đồng bộ trong ngày, theo giờ Việt Nam.",
             f"Tổng {len(rows)} email; {urgent} ưu tiên cao/khẩn cấp; {issues} có vấn đề cần xử lý; {calendar} có mốc lịch được trích xuất."]
    if highlights:
        lines.append("## Trọng tâm cần xem")
        for row in highlights:
            # These are proposals/extracted dates, never evidence that something was sent/approved.
            fact = plain(row.issue_description or row.summary or row.full_analysis, 25)
            hint = plain(row.calendar_hint, 8)
            lines.append(f"- **{plain(row.subject, 8)}** ({plain(row.urgency, 2)}): {fact}" + (f" Mốc trích xuất: {hint}" if hint else ""))
        if len(rows) > len(highlights):
            lines.append(f"Còn {len(rows) - len(highlights)} email ngoài phần trọng tâm; mở tài nguyên để đọc chi tiết.")
    else:
        lines.append("Chưa có email phân tích thành công trong ngày.")
    markdown = "\n\n".join(lines)
    # Hard cap even if legacy/custom labels contain unexpected long values.
    if len(markdown.split()) > MAX_REPORT_WORDS:
        markdown = " ".join(markdown.split()[:MAX_REPORT_WORDS - 8]) + "\n\n(Báo cáo đã đạt giới hạn độ dài.)"
    root = resolve_path("data/reports").resolve()
    folder = (root / project_id).resolve()
    if folder.parent != root or folder.name != project_id:
        raise ValueError("Mã dự án không hợp lệ để lưu báo cáo.")
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{today.isoformat()}.md"
    if not path.exists() or path.read_text(encoding="utf-8") != markdown:
        temporary: Path | None = None
        try:
            with NamedTemporaryFile(mode="w", encoding="utf-8", dir=folder, delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(markdown)
            os.replace(temporary, path)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
    return {"date": today.isoformat(), "markdown": markdown, "email_count": len(rows),
            "highlight_ids": [row.id for row in highlights], "max_words": MAX_REPORT_WORDS}
