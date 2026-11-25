"""Durable drafts, explicit approval and reconciliation with Google Calendar."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
from uuid import uuid4
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from threading import RLock
from functools import wraps

from fastapi import HTTPException
from icalendar import Alarm, Calendar, Event, Timezone, TimezoneStandard, vRecur
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agents.calendar_agent import CalendarEventSchema, calendar_agent, to_calendar_draft
from app.database.models import CalendarDraftRecord, CalendarRecord, ChatSessionRecord, DocumentRecord, EmailProcessedRecord, ProjectRecord
from app.integrations.google_calendar import google_calendar
from app.schemas.calendar import CalendarDraft, VN_TZ
from app.services.projects import owned_query, require_project

logger = logging.getLogger(__name__)
ACTIVE = ("pending", "confirmed", "deleting")
_operation_lock = RLock()


def calendar_operation(function):
    @wraps(function)
    def run(*args, **kwargs):
        # Order create/undo calls in this single-owner server. DB constraints and
        # Google IDs still provide durable deduplication after a restart.
        with _operation_lock:
            return function(*args, **kwargs)
    return run


def canonical_rules(rules: list[str]) -> list[str]:
    values = []
    for rule in rules:
        if not rule.startswith("RRULE:"):
            values.append(rule)
            continue
        parsed = vRecur.from_ical(rule.removeprefix("RRULE:"))
        normalized = {key: sorted(str(value) for value in items) for key, items in parsed.items()}
        if normalized.get("INTERVAL") == ["1"]:
            normalized.pop("INTERVAL")
        if normalized.get("WKST") == ["MO"]:
            normalized.pop("WKST")
        values.append(json.dumps(normalized, sort_keys=True))
    return sorted(values)


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=VN_TZ) if value.tzinfo is None else value.astimezone(VN_TZ)


def resource(db: Session, project_id: str, resource_id: str):
    for model in (DocumentRecord, EmailProcessedRecord):
        record = owned_query(db, model, project_id).filter_by(id=resource_id).first()
        if record is not None:
            return record
    raise HTTPException(404, "Không tìm thấy tài nguyên lịch trong dự án.")


def get_draft(db: Session, project_id: str, draft_id: str) -> CalendarDraftRecord:
    record = owned_query(db, CalendarDraftRecord, project_id).filter_by(id=draft_id).first()
    if record is None:
        raise HTTPException(404, "Không tìm thấy nháp lịch trong dự án.")
    return record


def draft_payload(db: Session, record: CalendarDraftRecord) -> dict:
    active = db.query(CalendarRecord).filter_by(draft_id=record.id).filter(CalendarRecord.status.in_(ACTIVE)).first()
    approved = db.get(CalendarRecord, record.approved_event_id) if record.approved_event_id else None
    event = approved if approved and approved.status == "confirmed" else active
    return {"id": record.id, "resource_id": record.resource_id, "session_id": record.session_id, "revision": record.revision,
            "event_id": event.id if event else None, "operation_status": event.status if event else None,
            "google_link": google_event_link({"htmlLink": event.google_link}) if event and event.status == "confirmed" else None,
            "google_account_email": google_link_account(event.google_link) if event and event.status == "confirmed" else None,
            "draft": {**json.loads(record.draft_json), "is_approved": bool(approved and approved.status == "confirmed"),
                      "approved_event_id": approved.id if approved and approved.status == "confirmed" else None}}


def add_drafts(db: Session, project_id: str, drafts: list[dict], resource_id: str | None = None, session_id: str | None = None) -> list[CalendarDraftRecord]:
    require_project(db, project_id)
    if resource_id:
        resource(db, project_id, resource_id)
    if session_id and not owned_query(db, ChatSessionRecord, project_id).filter_by(id=session_id).first():
        raise HTTPException(404, "Phiên chat không thuộc dự án.")
    records = [CalendarDraftRecord(project_id=project_id, resource_id=resource_id, session_id=session_id,
               draft_json=CalendarDraft.model_validate(draft).model_dump_json(by_alias=True)) for draft in drafts]
    db.add_all(records)
    db.flush()
    return records


def import_legacy_drafts(db: Session):
    for email in db.query(EmailProcessedRecord).join(ProjectRecord, ProjectRecord.id == EmailProcessedRecord.project_id).filter(
            ProjectRecord.deleted_at.is_(None), EmailProcessedRecord.schedule_draft_json.is_not(None)).all():
        if db.query(CalendarDraftRecord).filter_by(project_id=email.project_id, resource_id=email.id).first():
            continue
        try:
            raw = json.loads(email.schedule_draft_json)
            if raw is None:
                continue
            if not isinstance(raw, dict):
                raise ValueError("Expected a saved draft object")
            draft = CalendarDraft.model_validate(raw) if "start_time" in raw else to_calendar_draft(CalendarEventSchema.model_validate(raw))
        except (ValueError, TypeError):
            # Keep malformed legacy content intact; it must not prevent startup.
            logger.warning("Bỏ qua nháp lịch cũ không hợp lệ của email %s; có thể trích xuất lại từ nguồn.", email.id)
            continue
        db.add(CalendarDraftRecord(project_id=email.project_id, resource_id=email.id, draft_json=draft.model_dump_json(by_alias=True)))
    db.commit()


def update_draft(db: Session, record: CalendarDraftRecord, draft: CalendarDraft, revision: int):
    if record.approved_event_id or db.query(CalendarRecord).filter_by(draft_id=record.id).filter(CalendarRecord.status.in_(ACTIVE)).first():
        raise HTTPException(409, "Nháp đã có thao tác tạo lịch. Hãy đối soát hoặc hoàn tác lịch đó trước khi sửa.")
    changed = db.query(CalendarDraftRecord).filter_by(id=record.id, revision=revision).update(
        {"draft_json": draft.model_dump_json(by_alias=True), "revision": revision + 1})
    if not changed:
        db.rollback()
        raise HTTPException(409, "Nháp đã thay đổi ở lượt khác. Mở lại nháp mới nhất trước khi sửa.")
    db.commit()
    db.refresh(record)
    return draft_payload(db, record)


def extract_drafts(db: Session, project_id: str, resource_id: str | None, text: str | None = None, session_id: str | None = None, model: str | None = None):
    source = "prompt"
    if resource_id:
        item = resource(db, project_id, resource_id)
        source = "pdf" if isinstance(item, DocumentRecord) else "email"
        if isinstance(item, DocumentRecord):
            text = item.source_text
            hints = "\n".join(str(value) for value in item.get_deadlines())
        else:
            from app.services.email_ingest import saved_email_context
            text = saved_email_context(item)
            summary = item.summary or item.full_analysis or ""
            hints = summary.partition("CÁC MỐC THỜI GIAN & HẠN CHÓT")[2].strip()
        if text and hints:
            text = ("Gợi ý mốc thời gian từ bản phân tích đã lưu, chỉ dùng để tìm và kiểm chứng trong nguồn gốc; "
                    "không suy diễn mốc mới nếu không có căn cứ nguồn:\n" + hints + "\n\nNGUỒN GỐC:\n" + text)
    if not text or not text.strip():
        raise HTTPException(422, "Nguồn chưa có văn bản để trích xuất lịch.")
    result = calendar_agent.extract_and_schedule(text, source_type=source, model=model, auto_schedule=False, dry_run=True)
    rows = add_drafts(db, project_id, result.drafts, resource_id, session_id)
    if resource_id and rows and isinstance(item, EmailProcessedRecord):
        item.has_calendar_event = True
    db.commit()
    return {"drafts": [draft_payload(db, row) for row in rows], "thinking_process": result.thinking_process}


def google_event_link(raw: dict) -> str | None:
    """Keep Google's event URL and select the primary calendar's actual account."""
    value = raw.get("htmlLink")
    if not isinstance(value, str):
        return None
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname not in ("calendar.google.com", "www.google.com") or parsed.username or parsed.password or not parsed.path.startswith("/calendar"):
        return None
    query = dict(parse_qsl(parsed.query))
    email = raw.get("organizer", {}).get("email")
    if isinstance(email, str) and "@" in email:
        query["authuser"] = email
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


def google_link_account(link: str | None) -> str | None:
    if not link:
        return None
    value = dict(parse_qsl(urlsplit(link).query)).get("authuser", "")
    return value if "@" in value else None


def event_payload(record: CalendarRecord) -> dict:
    return {"id": record.id, "project_id": record.project_id, "resource_id": record.resource_id, "draft_id": record.draft_id,
            "title": record.title, "start_time": aware(record.start_time).isoformat(), "end_time": aware(record.end_time).isoformat(),
            "all_day": bool(record.all_day), "recurrence": json.loads(record.recurrence_json or "[]"),
            "deadline_date": record.deadline_date, "description": record.description or "", "reminder_minutes": record.reminder_minutes,
            "google_event_id": record.google_event_id, "google_link": google_event_link({"htmlLink": record.google_link}),
            "google_account_email": google_link_account(record.google_link), "status": record.status,
            "created_at": record.created_at.isoformat() + "Z" if record.created_at else None}


def google_range(item: dict) -> tuple[datetime, datetime]:
    def parse(value):
        return aware(datetime.fromisoformat(value.get("dateTime") or value["date"]))
    return parse(item["start"]), parse(item["end"])


def conflicts(db: Session, draft: CalendarDraft, exclude_event: CalendarRecord | None = None) -> list[dict]:
    start, end = draft.time_range()
    try:
        cloud = google_calendar.list_events_range(start, end)
    except Exception:
        raise HTTPException(503, "Chưa kiểm tra được lịch Google. Không coi danh sách lỗi là lịch trống.") from None
    result = []
    for item in cloud:
        if item.get("transparency") == "transparent":
            continue
        if exclude_event and (item.get("recurringEventId") or item.get("id")) == exclude_event.google_event_id:
            continue
        event_start, event_end = google_range(item)
        if event_start < end and event_end > start:
            result.append({"id": item["id"], "title": item.get("summary", "(Không có tiêu đề)"), "start_time": event_start.isoformat(),
                           "end_time": event_end.isoformat(), "all_day": "date" in item["start"], "source": "google"})
    local = db.query(CalendarRecord).filter(CalendarRecord.status.in_(("legacy", "pending")),
            CalendarRecord.start_time < end.replace(tzinfo=None), CalendarRecord.end_time > start.replace(tzinfo=None)).all()
    for item in local:
        if exclude_event and item.id == exclude_event.id:
            continue
        if any(event["id"] == item.google_event_id for event in result):
            continue
        result.append({"id": item.id, "title": item.title, "start_time": aware(item.start_time).isoformat(),
                       "end_time": aware(item.end_time).isoformat(), "all_day": bool(item.all_day), "source": "local"})
    return result


def ics_bytes(record: CalendarRecord) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//Office Agents//Calendar//VI")
    cal.add("version", "2.0")
    # The task dates use modern Vietnam civil time (UTC+07, no DST).
    zone = Timezone()
    zone.add("tzid", "Asia/Ho_Chi_Minh")
    standard = TimezoneStandard()
    standard.add("dtstart", datetime(1970, 1, 1))
    standard.add("tzoffsetfrom", timedelta(hours=7))
    standard.add("tzoffsetto", timedelta(hours=7))
    standard.add("tzname", "ICT")
    zone.add_component(standard)
    cal.add_component(zone)
    event = Event()
    event.add("uid", f"{record.id}@office-agents")
    event.add("dtstamp", datetime.now(timezone.utc))
    start, end = aware(record.start_time), aware(record.end_time)
    event.add("dtstart", start.date() if record.all_day else start)
    event.add("dtend", end.date() if record.all_day else end)
    event.add("summary", record.title)
    event.add("description", record.description or "")
    for rule in json.loads(record.recurrence_json or "[]"):
        event.add("rrule", vRecur.from_ical(rule.removeprefix("RRULE:")))
    alarm = Alarm()
    alarm.add("action", "DISPLAY")
    alarm.add("description", record.title)
    alarm.add("trigger", -timedelta(minutes=record.reminder_minutes))
    event.add_component(alarm)
    cal.add_component(event)
    return cal.to_ical()


def google_event_matches(record: CalendarRecord, raw: dict | None) -> bool:
    try:
        cloud_start, cloud_end = google_range(raw)
        matches = (raw.get("id") == record.google_event_id and raw.get("status") != "cancelled"
                   and raw.get("summary") == record.title and cloud_start == aware(record.start_time)
                   and cloud_end == aware(record.end_time) and ("date" in raw["start"]) == record.all_day
                   and raw.get("description", "") == (record.description or "")
                   and canonical_rules(raw.get("recurrence", [])) == canonical_rules(json.loads(record.recurrence_json))
                   and raw.get("reminders", {}).get("useDefault") is False
                   and any(reminder.get("method") == "popup" and reminder.get("minutes") == record.reminder_minutes
                           for reminder in raw.get("reminders", {}).get("overrides", []))
                   and raw.get("extendedProperties", {}).get("private", {}).get("deadline_date") == record.deadline_date
                   and (not record.draft_id or (
                       raw.get("extendedProperties", {}).get("private", {}).get("app_event_id") == record.id
                       and raw.get("extendedProperties", {}).get("private", {}).get("project_id") == record.project_id)))
    except (AttributeError, TypeError, KeyError, ValueError):
        matches = False
    return matches


@calendar_operation
def approve(db: Session, project_id: str, draft_id: str, revision: int, allow_conflicts: bool):
    project = require_project(db, project_id)
    draft_record = get_draft(db, project_id, draft_id)
    if draft_record.revision != revision:
        raise HTTPException(409, "Nháp đã thay đổi; mở lại bản mới nhất trước khi duyệt.")
    draft = CalendarDraft.model_validate_json(draft_record.draft_json)
    try:
        start, end = draft.time_range()
        recurrence = draft.recurrence()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    definition_data = {"title": draft.title, "start": start.isoformat(), "end": end.isoformat(), "all_day": draft.all_day,
                       "recurrence": recurrence, "description": draft.description,
                       "deadline_date": draft.deadline_date.isoformat() if draft.has_deadline else None,
                       "reminder_minutes": project.default_reminder_minutes}
    if draft.has_deadline and draft.deadline_at:
        definition_data["deadline_at"] = draft.deadline_at.isoformat()
    definition = json.dumps(definition_data, sort_keys=True, ensure_ascii=False)
    stable_hash = hashlib.sha256(f"{project_id}:{draft.title.casefold()}:{start.isoformat()}".encode()).hexdigest()
    record = db.query(CalendarRecord).filter_by(stable_hash=stable_hash).first()
    if record and record.draft_id != draft_id:
        raise HTTPException(409, "Lịch cùng tiêu đề và thời điểm đã thuộc một nháp khác trong dự án. Không tạo đúp; hãy mở nháp đã tạo lịch.")
    if record and record.definition_json != definition:
        raise HTTPException(409, "Lịch cùng tiêu đề và thời điểm đã có nội dung khác; không tự ghi đè hoặc tạo đúp.")
    if record and record.status == "deleting":
        raise HTTPException(409, "Lịch đang được hoàn tác; hãy hoàn tất thao tác đó trước.")
    if not record:
        overlap = conflicts(db, draft)
        if overlap and not allow_conflicts:
            raise HTTPException(409, {"message": "Khung giờ giao nhau với lịch hiện có. Xác nhận nếu vẫn muốn tạo.", "conflicts": overlap})
        frozen = db.query(CalendarDraftRecord).filter_by(id=draft_id, revision=revision).update(
            {"revision": revision + 1}, synchronize_session=False)
        if not frozen:
            db.rollback()
            raise HTTPException(409, "Nháp đã thay đổi trong lúc kiểm tra lịch. Mở lại bản mới nhất trước khi duyệt.")
        record_id = str(uuid4())
        deadline_text = draft.deadline_at.isoformat() if draft.deadline_at else draft.deadline_date.isoformat() if draft.deadline_date else ""
        description = (f"Hạn chót: {deadline_text}\n\n" if draft.has_deadline else "") + draft.description
        record = CalendarRecord(id=record_id, project_id=project_id, draft_id=draft_id, resource_id=draft_record.resource_id,
                 title=draft.title, start_time=start.replace(tzinfo=None), end_time=end.replace(tzinfo=None),
                 all_day=draft.all_day, recurrence_json=json.dumps(recurrence), deadline_date=draft.deadline_date.isoformat() if draft.has_deadline else None,
                 description=description, reminder_minutes=project.default_reminder_minutes, source_type="prompt" if not draft_record.resource_id else "resource",
                 stable_hash=stable_hash, google_event_id=record_id.replace("-", ""), status="pending", definition_json=definition)
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            record = db.query(CalendarRecord).filter_by(stable_hash=stable_hash).first()
            if record is None or record.draft_id != draft_id or record.definition_json != definition or record.status == "deleting":
                raise HTTPException(409, "Có thao tác lịch đồng thời. Tải lại nháp trước khi duyệt.") from None
    try:
        result = google_calendar.create_event(title=record.title, start_time=aware(record.start_time), end_time=aware(record.end_time),
                 description=record.description, reminder_minutes=record.reminder_minutes, stable_hash=record.stable_hash,
                 all_day=record.all_day, recurrence=json.loads(record.recurrence_json), deadline_date=record.deadline_date,
                 event_id=record.google_event_id, app_event_id=record.id, project_id=project_id)
    except Exception:
        db.rollback()
        raise HTTPException(502, "Chưa xác nhận được kết quả từ Google Calendar. Nháp chưa đánh dấu đã duyệt. "
                            "Bấm Kiểm tra lại để đối soát cùng ID; không tạo lịch mới bằng ID khác.") from None
    # A generated .ics or an insert payload alone does not prove persistence.
    try:
        raw = google_calendar.get_event_raw(record.google_event_id)
    except Exception:
        raise HTTPException(502, "Chưa đọc lại được sự kiện trên Google để xác nhận. Bấm Kiểm tra lại cùng sự kiện; chưa tạo lịch mới.") from None
    matches = google_event_matches(record, raw)
    if not matches:
        raise HTTPException(409, "Google trả sự kiện khác nội dung đã duyệt hoặc chưa đủ dữ liệu đối soát. "
                            "Nháp chưa được đánh dấu hoàn tất; kiểm tra hoặc hoàn tác sự kiện trước khi tạo lại.")
    changed = db.query(CalendarRecord).filter(CalendarRecord.id == record.id, CalendarRecord.status.in_(("pending", "confirmed"))).update(
        {"status": "confirmed", "synced_desktop": True, "google_link": google_event_link(raw)}, synchronize_session=False)
    if not changed:
        db.rollback()
        raise HTTPException(409, "Lịch đang được hoàn tác ở lượt khác. Hãy tải lại trạng thái mới nhất.")
    draft_record.approved_event_id = record.id
    db.commit()
    db.refresh(record)
    return {"event": event_payload(record), "draft": draft_payload(db, draft_record), "warning": None,
            "is_duplicate": bool(result.get("is_duplicate"))}


@calendar_operation
def verify_event(db: Session, project_id: str, event_id: str) -> dict:
    require_project(db, project_id)
    record = owned_query(db, CalendarRecord, project_id).filter_by(id=event_id).first()
    if record is None:
        raise HTTPException(404, "Không tìm thấy lịch trong dự án.")
    if record.status in ("deleted", "deleting"):
        raise HTTPException(409, "Lịch đã xóa hoặc đang hoàn tác; hãy tải lại trạng thái.")
    state, message = "local_only", "Lịch này chỉ có dữ liệu cục bộ, chưa lưu Google event ID. File .ics không xác nhận việc tạo lịch trên Google."
    if record.google_event_id:
        try:
            raw = google_calendar.get_event_raw(record.google_event_id)
        except Exception:
            raise HTTPException(502, "Chưa kiểm tra được Google Calendar. Kiểm tra tài khoản kết nối và thử lại; chưa tạo thêm sự kiện.") from None
        if raw is None:
            state = "not_found"
            message = "Không tìm thấy sự kiện trong lịch chính của tài khoản Google đang kết nối. Có thể sự kiện thuộc tài khoản khác hoặc đã bị xóa; chưa tự tạo lại."
        elif google_event_matches(record, raw):
            state, message = "found", "Đã đọc và xác nhận sự kiện trên Google Calendar."
            record.google_link = google_event_link(raw)
            # A pending write may now be confirmed without inserting again.
            if record.status == "pending":
                record.status, record.synced_desktop = "confirmed", True
                if record.draft_id:
                    draft = owned_query(db, CalendarDraftRecord, project_id).filter_by(id=record.draft_id).first()
                    if draft:
                        draft.approved_event_id = record.id
            db.commit()
        else:
            state = "changed"
            message = "Sự kiện tồn tại trên Google nhưng nội dung đã khác bản trong ứng dụng. Mở Google Calendar để kiểm tra; chưa ghi đè hoặc tạo thêm."
            record.google_link = google_event_link(raw)
            db.commit()
    draft = owned_query(db, CalendarDraftRecord, project_id).filter_by(id=record.draft_id).first() if record.draft_id else None
    return {"state": state, "message": message, "event": event_payload(record),
            "draft": draft_payload(db, draft) if draft else None}


@calendar_operation
def delete_event(db: Session, project_id: str, event_id: str):
    record = owned_query(db, CalendarRecord, project_id).filter_by(id=event_id).first()
    if record is None:
        raise HTTPException(404, "Không tìm thấy lịch trong dự án.")
    if record.status == "deleted":
        return
    if not record.google_event_id:
        raise HTTPException(409, "Lịch cũ chưa lưu Google event ID; chưa thể xóa Google an toàn từ ứng dụng.")
    record.status = "deleting"
    db.commit()
    try:
        if not google_calendar.delete_event(record.google_event_id):
            raise RuntimeError("Google chưa xác nhận thao tác xóa.")
    except Exception:
        db.rollback()
        raise HTTPException(502, "Chưa xác nhận được việc xóa trên Google. Hãy thử lại Hoàn tác cùng sự kiện.") from None
    db.query(CalendarDraftRecord).filter_by(approved_event_id=record.id).update({"approved_event_id": None})
    record.status, record.stable_hash, record.synced_desktop = "deleted", None, False
    db.commit()


def upcoming(db: Session, project_id: str | None, hours: int):
    query = db.query(CalendarRecord).join(ProjectRecord, ProjectRecord.id == CalendarRecord.project_id).filter(
        ProjectRecord.deleted_at.is_(None), CalendarRecord.status.in_(("confirmed", "legacy")))
    if project_id:
        require_project(db, project_id)
        query = query.filter(CalendarRecord.project_id == project_id)
    records = query.all()
    now, items = datetime.now(VN_TZ), []
    end = now + timedelta(hours=hours)
    cloud_records = {record.google_event_id: record for record in records if record.google_event_id}
    try:
        cloud = google_calendar.list_events_range(now, end) if cloud_records else []
    except Exception:
        raise HTTPException(503, "Chưa tải được lịch sắp tới từ Google Calendar.") from None
    for item in cloud:
        record = cloud_records.get(item.get("recurringEventId") or item["id"])
        if not record:
            continue
        start, finish = google_range(item)
        minutes = (start - now).total_seconds() / 60
        reminder_minutes = next((reminder["minutes"] for reminder in item.get("reminders", {}).get("overrides", [])
                                 if reminder.get("method") == "popup"), record.reminder_minutes)
        items.append({**event_payload(record), "occurrence_id": item["id"], "title": item.get("summary", record.title),
                      "all_day": "date" in item["start"],
                      "start_time": start.isoformat(), "end_time": finish.isoformat(), "minutes_until": minutes,
                      "is_imminent": 0 <= minutes <= reminder_minutes})
    for record in records:
        if not record.google_event_id and now <= aware(record.start_time) <= end:
            minutes = (aware(record.start_time) - now).total_seconds() / 60
            items.append({**event_payload(record), "occurrence_id": record.id, "minutes_until": minutes,
                          "is_imminent": 0 <= minutes <= record.reminder_minutes})
    items.sort(key=lambda item: item["start_time"])
    return {"items": items}
