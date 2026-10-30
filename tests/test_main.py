"""
Tests for context-handoff-ai.
Covers: carry-forward, validation, status transitions, radar scoring, AI fallback.
Uses a fresh in-memory SQLite DB per test.
"""
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

# Use in-memory SQLite for tests
TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def app_and_client():
    """
    Create a fresh FastAPI app + test DB per test function.
    Overrides the get_db dependency to use an in-memory SQLite DB.

    Key challenge: app.database creates a module-level `engine` and `Base` at
    import time, and app.main's lifespan calls Base.metadata.create_all(bind=engine)
    using that global engine. We patch `app.database.engine` to point at our
    test engine so lifespan's create_all lands in the right place.
    """
    import os
    import app.config as _config_module

    # Clear cached settings before env override
    _config_module.get_settings.cache_clear()
    os.environ["DATABASE_URL"] = TEST_DB_URL
    os.environ["LOG_FILE"] = "logs/test.log"
    os.environ.setdefault("GROQ_API_KEY", "")
    os.environ.setdefault("GEMINI_API_KEY", "")

    from app.database import Base, get_db
    import app.database as _db_module
    from app.main import app

    # Build our test engine — use StaticPool so all connections share the same
    # in-memory SQLite database (without it, each new connection = a new empty DB).
    engine = create_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Patch the module-level engine so lifespan's create_all uses our test DB
    original_engine = _db_module.engine
    _db_module.engine = engine

    # Create tables on our test engine
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        """Dependency override: yield session from our test engine."""
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Context manager form triggers lifespan startup/shutdown
    with TestClient(app, raise_server_exceptions=True) as client:
        yield client, engine

    # Restore state
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    _db_module.engine = original_engine
    _config_module.get_settings.cache_clear()


# ─── Health check ─────────────────────────────────────────────────────────────

def test_health(app_and_client):
    client, _ = app_and_client
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ─── Meeting CRUD ─────────────────────────────────────────────────────────────

def test_create_and_get_meeting(app_and_client):
    client, _ = app_and_client
    r = client.post("/api/meetings", json={"title": "Sprint 1 Planning", "type": "meeting"})
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Sprint 1 Planning"
    assert data["status"] == "draft"

    r2 = client.get(f"/api/meetings/{data['id']}")
    assert r2.status_code == 200
    assert r2.json()["id"] == data["id"]


def test_meeting_validation_empty_title(app_and_client):
    client, _ = app_and_client
    r = client.post("/api/meetings", json={"title": ""})
    assert r.status_code == 422
    assert "error" in r.json()


def test_meeting_invalid_type(app_and_client):
    client, _ = app_and_client
    r = client.post("/api/meetings", json={"title": "Test", "type": "invalid"})
    assert r.status_code == 422


# ─── Meeting status transitions ──────────────────────────────────────────────

def test_valid_status_transition(app_and_client):
    client, _ = app_and_client
    r = client.post("/api/meetings", json={"title": "Test Meeting"})
    mid = r.json()["id"]

    # draft → scheduled is valid
    r2 = client.patch(f"/api/meetings/{mid}/status", json={"status": "scheduled"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "scheduled"

    # scheduled → held is valid
    r3 = client.patch(f"/api/meetings/{mid}/status", json={"status": "held"})
    assert r3.status_code == 200


def test_invalid_status_transition(app_and_client):
    client, _ = app_and_client
    r = client.post("/api/meetings", json={"title": "Test Meeting"})
    mid = r.json()["id"]

    # draft → closed → draft: closed is terminal, should fail
    client.patch(f"/api/meetings/{mid}/status", json={"status": "held"})
    client.patch(f"/api/meetings/{mid}/status", json={"status": "closed"})
    r_invalid = client.patch(f"/api/meetings/{mid}/status", json={"status": "draft"})
    assert r_invalid.status_code == 422
    assert "error" in r_invalid.json()


# ─── Action Item transitions ──────────────────────────────────────────────────

def test_item_status_transition_open_to_done_requires_outcome(app_and_client):
    client, _ = app_and_client
    # Create meeting + item
    m = client.post("/api/meetings", json={"title": "M1"}).json()
    item = client.post("/api/items", json={
        "title": "Test item", "current_meeting_id": m["id"]
    }).json()

    # Closing without outcome should fail
    r = client.patch(f"/api/items/{item['id']}/status", json={"status": "done"})
    assert r.status_code == 422
    assert "outcome" in r.json()["error"]["message"].lower() or "outcome" in str(r.json())


def test_item_close_with_outcome(app_and_client):
    client, _ = app_and_client
    m = client.post("/api/meetings", json={"title": "M1"}).json()
    item = client.post("/api/items", json={
        "title": "Test item", "current_meeting_id": m["id"]
    }).json()

    r = client.patch(f"/api/items/{item['id']}/status", json={
        "status": "done", "outcome": "Completed as planned"
    })
    assert r.status_code == 200
    assert r.json()["status"] == "done"
    assert r.json()["outcome"] == "Completed as planned"


def test_item_invalid_transition(app_and_client):
    client, _ = app_and_client
    m = client.post("/api/meetings", json={"title": "M1"}).json()
    item = client.post("/api/items", json={
        "title": "Test item", "current_meeting_id": m["id"]
    }).json()

    # open → dropped requires outcome
    r = client.patch(f"/api/items/{item['id']}/status", json={
        "status": "dropped", "outcome": "Not needed"
    })
    assert r.status_code == 200

    # dropped → in_progress is invalid (dropped is terminal unless reopened)
    r2 = client.patch(f"/api/items/{item['id']}/status", json={"status": "in_progress"})
    assert r2.status_code == 422


def test_item_reopen(app_and_client):
    client, _ = app_and_client
    m = client.post("/api/meetings", json={"title": "M1"}).json()
    item = client.post("/api/items", json={"title": "Test item"}).json()

    client.patch(f"/api/items/{item['id']}/status", json={"status": "done", "outcome": "Done"})
    # Reopen
    r = client.patch(f"/api/items/{item['id']}/status", json={"status": "open"})
    assert r.status_code == 200
    assert r.json()["status"] == "open"


# ─── Carry-forward ────────────────────────────────────────────────────────────

def test_carry_forward_creates_new_meeting(app_and_client):
    client, _ = app_and_client

    # Create meeting with 2 open items and 1 done item
    m = client.post("/api/meetings", json={"title": "Source Meeting"}).json()

    item1 = client.post("/api/items", json={
        "title": "Open item 1", "current_meeting_id": m["id"]
    }).json()
    item2 = client.post("/api/items", json={
        "title": "Open item 2", "current_meeting_id": m["id"]
    }).json()
    item3 = client.post("/api/items", json={
        "title": "Done item", "current_meeting_id": m["id"]
    }).json()
    # Close item3
    client.patch(f"/api/items/{item3['id']}/status", json={"status": "done", "outcome": "Finished"})

    # Carry forward
    r = client.post(f"/api/meetings/{m['id']}/carry-forward", json={})
    assert r.status_code == 200
    result = r.json()
    assert result["carried_count"] == 2  # only open/in_progress items
    assert result["next_meeting_id"] != m["id"]

    # Verify items moved to new meeting
    new_mid = result["next_meeting_id"]
    items_in_new = client.get(f"/api/items?meeting_id={new_mid}").json()
    assert len(items_in_new) == 2


def test_carry_forward_logs_events(app_and_client):
    client, _ = app_and_client
    m = client.post("/api/meetings", json={"title": "M1"}).json()
    item = client.post("/api/items", json={"title": "Open item", "current_meeting_id": m["id"]}).json()

    client.post(f"/api/meetings/{m['id']}/carry-forward", json={})

    # Fetch item with events
    r = client.get(f"/api/items/{item['id']}")
    events = r.json()["events"]
    event_types = [e["event_type"] for e in events]
    assert "carried_forward" in event_types


def test_carry_forward_to_existing_meeting(app_and_client):
    client, _ = app_and_client
    m1 = client.post("/api/meetings", json={"title": "M1"}).json()
    m2 = client.post("/api/meetings", json={"title": "M2"}).json()
    client.post("/api/items", json={"title": "Item 1", "current_meeting_id": m1["id"]})

    r = client.post(f"/api/meetings/{m1['id']}/carry-forward", json={"next_meeting_id": m2["id"]})
    assert r.status_code == 200
    assert r.json()["next_meeting_id"] == m2["id"]


# ─── Participant & Decision ───────────────────────────────────────────────────

def test_add_and_remove_participant(app_and_client):
    client, _ = app_and_client
    m = client.post("/api/meetings", json={"title": "M"}).json()

    r = client.post(f"/api/meetings/{m['id']}/participants", json={"name": "Alice", "attendance": "invited"})
    assert r.status_code == 201
    pid = r.json()["id"]

    r2 = client.delete(f"/api/meetings/{m['id']}/participants/{pid}")
    assert r2.status_code == 204


def test_add_decision(app_and_client):
    client, _ = app_and_client
    m = client.post("/api/meetings", json={"title": "M"}).json()
    r = client.post(f"/api/meetings/{m['id']}/decisions", json={"text": "We decided X"})
    assert r.status_code == 201
    assert r.json()["text"] == "We decided X"


# ─── Radar scoring ────────────────────────────────────────────────────────────

def test_radar_score_no_owner():
    from app.services.radar import compute_risk_score
    score, signals = compute_risk_score(
        title="Follow up on something",
        owner=None,
        due_date=None,
        status="open",
        last_event_at=None,
        carry_count=0,
    )
    assert "no_owner" in signals
    assert "no_due_date" in signals
    assert score > 40  # definitely high risk


def test_radar_score_overdue():
    from app.services.radar import compute_risk_score
    past_date = datetime.now(timezone.utc) - timedelta(days=5)
    score, signals = compute_risk_score(
        title="Task with due date",
        owner="Alice",
        due_date=past_date,
        status="open",
        last_event_at=datetime.now(timezone.utc) - timedelta(days=1),
        carry_count=0,
    )
    assert "overdue" in signals
    assert score > 15  # overdue signal alone ≈ 17.2 (25/145 * 100)


def test_radar_score_vague_title():
    from app.services.radar import compute_risk_score
    score, signals = compute_risk_score(
        title="Look into the performance issue",
        owner="Bob",
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
        status="open",
        last_event_at=datetime.now(timezone.utc),
        carry_count=0,
    )
    assert "vague_title" in signals


def test_radar_score_clean_item():
    from app.services.radar import compute_risk_score
    future_date = datetime.now(timezone.utc) + timedelta(days=7)
    score, signals = compute_risk_score(
        title="Deploy auth service v2.1 to production",
        owner="Alice",
        due_date=future_date,
        status="in_progress",
        last_event_at=datetime.now(timezone.utc) - timedelta(hours=2),
        carry_count=0,
    )
    # Should have low score (no owner issue, not overdue, not vague, not stale)
    assert score < 30


def test_radar_score_carried_multiple():
    from app.services.radar import compute_risk_score
    score, signals = compute_risk_score(
        title="Task carried multiple times",
        owner="Charlie",
        due_date=datetime.now(timezone.utc) + timedelta(days=3),
        status="open",
        last_event_at=datetime.now(timezone.utc) - timedelta(days=10),
        carry_count=3,
    )
    assert "carried_multiple" in signals
    assert "stale" in signals


# ─── AI fallback ─────────────────────────────────────────────────────────────

def test_recap_fallback_extracts_decisions():
    from app.ai.fallback import recap_fallback
    notes = """Meeting notes Oct 1.
Decision: We will use FastAPI for the backend.
Decided: Deploy on Render using Docker.
Alice will write the schema by Friday.
"""
    result = recap_fallback(notes, ["Alice", "Bob"])
    assert len(result["decisions"]) >= 1
    assert any("FastAPI" in d or "Render" in d for d in result["decisions"])


def test_recap_fallback_extracts_action_items():
    from app.ai.fallback import recap_fallback
    notes = "Alice will deploy the service by Friday.\nBob to write tests by next week."
    result = recap_fallback(notes, ["Alice", "Bob"])
    assert isinstance(result["action_items"], list)


def test_brief_fallback_includes_key_sections():
    from app.ai.fallback import brief_fallback
    text = brief_fallback(
        for_person="Bob",
        title="Sprint Review",
        meeting_type="meeting",
        meeting_date="2026-10-20",
        summary="Team reviewed sprint progress.",
        decisions=["Use Redis for caching"],
        owned_items=[{"title": "Deploy service", "status": "open", "due_date": "2026-10-25"}],
        other_open=[],
        overdue_items=[],
        carried_items=[],
    )
    assert "Bob" in text
    assert "Deploy service" in text
    assert "Redis" in text


def test_ai_client_uses_fallback_when_no_keys(monkeypatch):
    """When both API keys are empty, call_ai should use the fallback function."""
    from app.ai import client as ai_client
    # Patch settings to have no keys
    monkeypatch.setattr(ai_client.settings, "groq_api_key", "")
    monkeypatch.setattr(ai_client.settings, "gemini_api_key", "")

    fallback_called = {}

    def my_fallback():
        fallback_called["yes"] = True
        return {"result": "from fallback"}

    result, mode = ai_client.call_ai(
        messages=[{"role": "user", "content": "test"}],
        task="test_task",
        fallback_fn=my_fallback,
        fallback_args={},
    )
    assert mode == "fallback"
    assert fallback_called.get("yes") is True


# ─── KB document CRUD ─────────────────────────────────────────────────────────

def test_kb_document_crud(app_and_client):
    client, _ = app_and_client

    r = client.post("/api/kb/documents", json={
        "title": "Test Doc", "content": "Some content", "doc_type": "doc"
    })
    assert r.status_code == 201
    doc_id = r.json()["id"]

    r2 = client.get(f"/api/kb/documents/{doc_id}")
    assert r2.json()["title"] == "Test Doc"

    r3 = client.put(f"/api/kb/documents/{doc_id}", json={"title": "Updated Doc"})
    assert r3.json()["title"] == "Updated Doc"

    r4 = client.delete(f"/api/kb/documents/{doc_id}")
    assert r4.status_code == 204


# ─── Error format ─────────────────────────────────────────────────────────────

def test_error_format_404(app_and_client):
    client, _ = app_and_client
    r = client.get("/api/meetings/99999")
    assert r.status_code == 404
    body = r.json()
    assert "error" in body
    assert "message" in body["error"]
    assert "request_id" in body["error"]


def test_error_format_422(app_and_client):
    client, _ = app_and_client
    r = client.post("/api/meetings", json={"title": ""})
    assert r.status_code == 422
    body = r.json()
    assert "error" in body


def test_request_id_in_response_header(app_and_client):
    client, _ = app_and_client
    r = client.get("/health")
    assert "x-request-id" in r.headers or "X-Request-ID" in r.headers

