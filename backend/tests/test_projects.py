from datetime import datetime
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import sessionmaker

from app.database.database import Base, get_db
from app.database.models import (
    ChatMessageRecord, ChatSessionRecord, DocumentRecord, EmailProcessedRecord,
    CalendarRecord, SolutionRecord, TaskRecord, ProjectRecord,
)
from app.llm.ollama import LLMResponse
from app.services.llm_settings import LLMError
from app.main import app


@pytest.fixture
def api(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'projects.db'}", connect_args={"check_same_thread": False})
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    def test_db():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = test_db
    with TestClient(app) as client:
        yield client, factory
    app.dependency_overrides.clear()
    engine.dispose()


def project(client, title="Dự án A", **values):
    label = str(uuid4())
    values.setdefault('config', {'mail_label_id': label, 'mail_label_name': label})
    response = client.post("/api/projects", json={"title": title, **values})
    assert response.status_code == 201, response.text
    return response.json()


def test_project_crud_members_config_and_reload(api):
    client, factory = api
    p = project(client, members=[{"email": "  Member@Soviectech.vn  "}, {"email": "guest@example.com"}])
    assert [(m['email'], m['role']) for m in p['members']] == [('guest@example.com', 'khách'), ('member@soviectech.vn', 'nội bộ')]
    config = {"mail_label_id": "Label_A", "mail_label_name": "Công việc", "mail_sync_interval_minutes": 720,
              "default_reminder_minutes": 15, "collect_rl_feedback": False}
    result = client.patch(f"/api/projects/{p['id']}", json={"title": "Dự án đổi tên", "icon": "rocket", "config": config,
        "members": [{"email": "member@soviectech.vn", "role": "khách"}]} )
    assert result.status_code == 200
    assert client.get(f"/api/projects/{p['id']}").json()['config'] == config
    assert 'default_summary_style' not in result.json()['config']
    with factory() as db:
        assert db.get(ProjectRecord, p['id']).icon == 'rocket'
    assert client.get('/api/projects?q=ĐỔI&sort=name_asc').json()[0]['title'] == 'Dự án đổi tên'
    assert client.get('/api/projects?q=không có').json() == []


@pytest.mark.parametrize('payload', [
    {'title': ' '}, {'icon': 'invented'}, {'members': [{'email': 'invalid'}]},
    {'members': [{'email': 'a@example.com'}, {'email': 'A@example.com'}]},
    {'members': [{'email': 'a@example.com', 'role': 'admin'}]},
    {'config': {'mail_sync_interval_minutes': 29}}, {'config': {'mail_sync_interval_minutes': 721}},
    {'config': {'default_reminder_minutes': 20}}, {'config': {'defaultSummaryStyle': 'ngắn'}},
    {'config': {'mail_label_id': 'missing-name'}},
])
def test_reject_invalid_project(api, payload):
    client, _ = api
    assert client.post('/api/projects', json={'title': 'Valid project', **payload}).status_code == 422
    assert client.get('/api/projects').json() == []


def test_label_conflict_is_atomic_and_undo_keeps_reservation(api):
    client, _ = api
    config = {'mail_label_id': 'Label_A', 'mail_label_name': 'Công việc'}
    a = project(client, config=config)
    b = project(client, 'Dự án B', members=[{'email': 'old@example.com'}])
    response = client.patch(f"/api/projects/{b['id']}", json={'title': 'Should rollback', 'config': config, 'members': []})
    assert response.status_code == 409
    persisted = client.get(f"/api/projects/{b['id']}").json()
    assert persisted['title'] == 'Dự án B'
    assert persisted['members'][0]['email'] == 'old@example.com'
    assert client.delete(f"/api/projects/{a['id']}").status_code == 204
    assert client.post('/api/projects', json={'title': 'Reuse deleted label', 'config': config}).status_code == 409
    assert client.post(f"/api/projects/{a['id']}/restore").status_code == 200


def test_resources_sessions_and_legacy_endpoints_are_isolated(api):
    client, factory = api
    a, b = project(client), project(client, 'Dự án B')
    with factory() as db:
        db.add_all([
            DocumentRecord(id='doc-b', project_id=b['id'], filename='secret.pdf', executive_summary='B secret'),
            EmailProcessedRecord(id='mail-b', project_id=b['id'], source='gmail', subject='Secret B'),
            SolutionRecord(id='sol-b', project_id=b['id'], problem='Secret B'),
            TaskRecord(id='task-b', project_id=b['id'], title='Secret B'),
            CalendarRecord(id='event-b', project_id=b['id'], title='Secret B', start_time=datetime(2027,1,1), end_time=datetime(2027,1,2)),
        ])
        db.commit()
    session = client.post('/api/chat/sessions', params={'project_id': b['id']}, json={'title': 'Private B'}).json()
    for params in ({'project_id': a['id']}, {}):
        for endpoint in ('documents', 'emails/processed', 'solutions', 'calendar/events'):
            assert client.get(f'/api/{endpoint}', params=params).json() == []
        assert client.get('/api/tasks', params=params).json()['items'] == []
        assert client.get('/api/chat/sessions', params=params).json() == []
        path = f"/api/chat/sessions/{session['id']}"
        assert client.get(path, params=params).status_code == 404
        assert client.patch(path, params=params, json={'title': 'Stolen'}).status_code == 404
        assert client.delete(path, params=params).status_code == 404
        assert client.get('/api/documents/doc-b/file', params=params).status_code == 404
        assert client.get('/api/calendar/download-ics/event-b', params=params).status_code == 404
    assert client.get(f"/api/projects/{a['id']}/resources").json() == {'documents': [], 'emails': []}
    assert client.get(f"/api/projects/{b['id']}/resources").json()['documents'][0]['id'] == 'doc-b'
    with patch('app.api.chat.chat_with_llm_safe') as llm:
        assert client.post('/api/chat', params={'project_id': a['id']}, json={'message': 'Hi', 'session_id': session['id']}).status_code == 404
        assert client.post('/api/chat', params={'project_id': a['id']}, json={'message': 'Hi', 'resource_ids': ['doc-b']}).status_code == 404
        llm.assert_not_called()
    client.delete(f"/api/projects/{b['id']}")
    assert client.get('/api/chat/sessions', params={'project_id': b['id']}).status_code == 404
    assert client.get(f"/api/projects/{b['id']}/resources").status_code == 404
    client.post(f"/api/projects/{b['id']}/restore")
    assert client.get('/api/chat/sessions', params={'project_id': b['id']}).json()[0]['id'] == session['id']
    assert client.get(f"/api/projects/{b['id']}/resources").json()['documents'][0]['id'] == 'doc-b'


def test_project_chat_persists_only_its_context_without_actions(api):
    client, factory = api
    a = project(client)
    with factory() as db:
        db.add(DocumentRecord(id='source-a', project_id=a['id'], filename='A.pdf', full_markdown='Only selected A'))
        db.commit()
    with patch('app.api.chat.chat_with_llm_safe', return_value=LLMResponse(raw='Answer', content='Answer')) as llm, patch('app.api.chat.orchestrator.route_and_execute') as actions:
        response = client.post('/api/chat', params={'project_id': a['id']}, json={'message': 'Question', 'resource_ids': ['source-a']})
        assert response.status_code == 200
        assert 'Only selected A' in llm.call_args.kwargs['system_prompt']
        actions.assert_not_called()
    detail = client.get(f"/api/chat/sessions/{response.json()['session_id']}", params={'project_id': a['id']}).json()
    assert [m['content'] for m in detail['messages']] == ['Question', 'Answer']
    with patch('app.api.chat.chat_with_llm_safe', side_effect=LLMError('Provider offline')):
        assert client.post('/api/chat', params={'project_id': a['id']}, json={'message': 'Unanswered'}).status_code == 502
    assert len(client.get('/api/chat/sessions', params={'project_id': a['id']}).json()) == 1


def test_empty_digest_does_not_fall_back_to_another_project(api):
    client, factory = api
    a, b = project(client), project(client, 'Dự án B')
    with factory() as db:
        db.add(EmailProcessedRecord(id='secret', project_id=b['id'], source='gmail', subject='Private B'))
        db.commit()
    digest = client.post('/api/emails/daily-digest', params={'project_id': a['id']}, json={})
    assert digest.status_code == 200
    assert digest.json()['total_emails'] == 0


def test_migration_preserves_legacy_rows_and_is_repeatable(tmp_path, monkeypatch):
    from app.database import database
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.exec_driver_sql('CREATE TABLE documents (id VARCHAR(36) PRIMARY KEY, filename VARCHAR(255), total_pages INTEGER, executive_summary TEXT, full_markdown TEXT, deadlines_json TEXT, created_at DATETIME)')
        conn.exec_driver_sql("INSERT INTO documents VALUES ('old-doc', 'old.pdf', 1, 'Original content', '', '[]', '2026-11-25 00:00:00')")
    monkeypatch.setattr(database, 'engine', engine)
    database.init_db()
    database.init_db()
    with engine.connect() as conn:
        row = conn.exec_driver_sql("SELECT project_id, executive_summary FROM documents WHERE id='old-doc'").one()
        assert row == ('legacy', 'Original content')
        assert conn.exec_driver_sql("SELECT COUNT(*) FROM projects WHERE id='legacy'").scalar() == 1
        assert 'project_id' in {c['name'] for c in inspect(conn).get_columns('chat_sessions')}
    engine.dispose()


def test_feedback_respects_project_setting_and_isolation(api):
    client, _ = api
    a, b = project(client), project(client, 'Dự án B')
    config = {**a['config'], 'collect_rl_feedback': False}
    assert client.patch(f"/api/projects/{a['id']}", json={'config': config}).status_code == 200
    feedback = {'agent_type': 'chat', 'prompt': 'Question', 'response': 'Answer', 'rating': 1}
    assert client.post('/api/feedback', params={'project_id': a['id']}, json=feedback).status_code == 403
    assert client.post('/api/feedback', params={'project_id': b['id']}, json=feedback).status_code == 200
    assert client.get('/api/feedback', params={'project_id': a['id']}).json() == []
    assert client.get('/api/feedback/stats', params={'project_id': a['id']}).json()['total_feedback'] == 0
    assert client.get('/api/feedback/stats', params={'project_id': b['id']}).json()['total_feedback'] == 1


def test_pdf_upload_is_persistent_and_file_cannot_cross_project(api):
    import pymupdf
    client, _ = api
    a, b = project(client), project(client, 'Dự án B')
    pdf = pymupdf.open()
    page = pdf.new_page()
    page.insert_text((50, 50), 'Real project document with enough text for extraction.')
    content = pdf.tobytes()
    pdf.close()
    response = LLMResponse(raw='Summary', content='## 1. TỔNG QUAN ĐIỀU HÀNH\nA summary\n## 2. CÁC LUẬN ĐIỂM CHÍNH\n- Key point')
    with patch('app.agents.summary_agent.chat_with_llm_safe', return_value=response):
        uploaded = client.post('/api/documents/summarize-pdf', params={'project_id': a['id']}, files={'file': ('../../same.pdf', content, 'application/pdf')})
    assert uploaded.status_code == 200, uploaded.text
    doc_id = uploaded.json()['id']
    assert client.get(f'/api/documents/{doc_id}/file', params={'project_id': a['id']}).content == content
    assert client.get(f'/api/documents/{doc_id}/file', params={'project_id': b['id']}).status_code == 404
    resources = client.get(f"/api/projects/{a['id']}/resources").json()
    assert resources['documents'][0]['filename'] == 'same.pdf'
    assert resources['documents'][0]['has_file'] is True
    client.delete(f"/api/projects/{a['id']}")
    assert client.get(f'/api/documents/{doc_id}/file', params={'project_id': a['id']}).status_code == 404
    client.post(f"/api/projects/{a['id']}/restore")
    assert client.get(f'/api/documents/{doc_id}/file', params={'project_id': a['id']}).content == content


def test_gmail_label_failure_does_not_report_success(api):
    client, _ = api
    with patch('app.api.emails.gmail_service.is_authenticated', return_value=False):
        assert client.get('/api/emails/mailbox-labels').status_code == 401
        assert client.post('/api/emails/mailbox-labels', json={'name': 'Dự án'}).status_code == 401
    with patch('app.api.emails.gmail_service.is_authenticated', return_value=True), patch('app.api.emails.gmail_service.get_or_create_label', return_value=None):
        assert client.post('/api/emails/mailbox-labels', json={'name': 'Dự án'}).status_code == 502
    assert client.get('/api/projects').json() == []


def test_calendar_default_and_duplicate_cannot_move_between_projects(api):
    client, factory = api
    a, b = project(client), project(client, 'Dự án B')
    client.patch(f"/api/projects/{a['id']}", json={'config': {**a['config'], 'default_reminder_minutes': 15}})
    event = {'title': f'Calendar ownership {uuid4()}', 'start_time': '2027-11-25T10:00:00', 'end_time': '2027-11-25T11:00:00'}
    first = client.post('/api/calendar/events', params={'project_id': a['id']}, json=event)
    assert first.status_code == 200, first.text
    assert first.json()['event']['reminder_minutes'] == 15
    assert client.post('/api/calendar/events', params={'project_id': a['id']}, json=event).status_code == 200
    assert client.post('/api/calendar/events', params={'project_id': b['id']}, json=event).status_code == 409
    with factory() as db:
        assert db.get(CalendarRecord, first.json()['event']['id']).project_id == a['id']
    assert client.get('/api/calendar/events', params={'project_id': b['id']}).json() == []


def test_report_file_cannot_cross_project_or_legacy_namespace(api):
    from pathlib import Path
    client, _ = api
    a, b = project(client), project(client, 'Dự án B')
    name = f"{a['id']}-report.pdf"
    path = Path('data/documents') / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'%PDF-1.7\nprivate report')
    url = f'/api/emails/daily-digest/download/{name}'
    assert client.get(url, params={'project_id': a['id']}).status_code == 200
    assert client.get(url, params={'project_id': b['id']}).status_code == 404
    assert client.get(url).status_code == 404
