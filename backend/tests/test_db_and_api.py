import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal, init_db
from app.db.models import Task, TaskEvent, User, Alert, PipelineRun
from app.db.clock import reset_clock, get_simulated_now

client = TestClient(app)


from app.db.seed import seed_database

@pytest.fixture(autouse=True)
def setup_and_reset_db():
    """Ensure database is initialized and clock is reset before tests."""
    init_db()
    db = SessionLocal()
    seed_database(db)
    reset_clock(db, anchor_time=datetime(2024, 1, 15, 9, 0, 0))
    db.close()
    yield


def test_api_docs_endpoints():
    """Verify OpenAPI documentation lists all expected endpoints."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = schema.get("paths", {})

    expected_routes = [
        "/health",
        "/meta",
        "/data/status",
        "/clock",
        "/clock/advance",
        "/clock/reset",
        "/users",
        "/alerts",
        "/alerts/{alert_id}",
        "/tasks",
        "/tasks/{task_id}",
        "/tasks/{task_id}/reply",
        "/tasks/{task_id}/status",
        "/dashboard/summary",
        "/runs/refresh"
    ]
    for route in expected_routes:
        assert route in paths, f"Missing route {route} in OpenAPI schema"


def test_seed_users_and_initial_alerts():
    """Verify seed script created users and 3 hand-crafted sample alerts."""
    # Check users
    u_resp = client.get("/users")
    assert u_resp.status_code == 200
    users = u_resp.json()
    assert len(users) >= 7
    roles = {u["role"] for u in users}
    assert "district_officer" in roles
    assert "block_supervisor" in roles
    assert "mitanin" in roles

    # Check alerts
    a_resp = client.get("/alerts")
    assert a_resp.status_code == 200
    alerts = a_resp.json()
    assert len(alerts) >= 3
    # Check alert detail
    detail_resp = client.get(f"/alerts/{alerts[0]['id']}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert "series" in detail
    assert "tasks" in detail


def test_create_task_and_audit_event():
    """Verify task creation links to alert, starts in 'sent' status, and logs event."""
    alerts = client.get("/alerts").json()
    alert_id = alerts[0]["id"]

    task_payload = {
        "alert_id": alert_id,
        "title": "Distribute RDT kits & verify fever cases",
        "steps": ["Survey Sector 4 households", "Administer rapid diagnostic tests", "Report positive cases"],
        "owner": "Mitanin Anita [SAMPLE]",
    }

    resp = client.post("/tasks", json=task_payload)
    assert resp.status_code == 200
    task = resp.json()

    assert task["id"] is not None
    assert task["alert_id"] == alert_id
    assert task["status"] == "sent"
    assert len(task["steps"]) == 3
    assert len(task["events"]) == 1
    assert task["events"][0]["event"] == "task_created"

    # Fetch task detail
    detail_resp = client.get(f"/tasks/{task['id']}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["title"] == task_payload["title"]


def test_mitanin_reply_done():
    """Verify Mitanin can reply 'done' and event is recorded."""
    # Create task
    task_payload = {
        "title": "LLIN Net verification",
        "steps": ["Inspect 10 bednets"],
        "owner": "Mitanin Sunita [SAMPLE]",
    }
    task = client.post("/tasks", json=task_payload).json()

    # Reply 'done'
    reply_payload = {
        "status": "done",
        "actor": "Mitanin Sunita [SAMPLE]",
        "notes": "All 10 households checked. Bednets in good condition."
    }
    resp = client.post(f"/tasks/{task['id']}/reply", json=reply_payload)
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["status"] == "done"

    # Audit events should now have 2 rows (created + reply)
    assert len(updated["events"]) == 2
    assert updated["events"][-1]["event"] == "mitanin_reply_done"
    assert "Bednets in good condition" in updated["events"][-1]["notes"]


def test_mitanin_reply_needs_help():
    """Verify Mitanin can reply 'needs_help'."""
    task_payload = {
        "title": "Larvicide application",
        "steps": ["Apply abate in water bodies"],
        "owner": "Mitanin Meena [SAMPLE]",
    }
    task = client.post("/tasks", json=task_payload).json()

    reply_payload = {
        "status": "needs_help",
        "actor": "Mitanin Meena [SAMPLE]",
        "notes": "Stock of chemical larvicide depleted at subcenter."
    }
    resp = client.post(f"/tasks/{task['id']}/reply", json=reply_payload)
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["status"] == "needs_help"
    assert updated["events"][-1]["event"] == "mitanin_reply_needs_help"


def test_escalation_after_advancing_clock():
    """
    Verify that advancing the clock past 48 hours automatically escalates
    unreplied 'sent' tasks and logs an escalation event.
    """
    # 1. Reset clock to anchor
    client.post("/clock/reset")

    # 2. Create task
    task = client.post("/tasks", json={
        "title": "Urgent IRS spraying check",
        "steps": ["Check spray status"],
        "owner": "Mitanin Radha [SAMPLE]"
    }).json()
    task_id = task["id"]
    assert task["status"] == "sent"

    # 3. Advance clock by 24 hours (less than 48h escalation threshold)
    adv_24 = client.post("/clock/advance?hours=24").json()
    assert task_id not in adv_24["escalated_task_ids"]

    # Status should still be 'sent'
    t24 = client.get(f"/tasks/{task_id}").json()
    assert t24["status"] == "sent"

    # 4. Advance clock by another 25 hours (total 49 hours > 48 hours threshold)
    adv_25 = client.post("/clock/advance?hours=25").json()
    assert task_id in adv_25["escalated_task_ids"]

    # Status must now be 'escalated'
    t49 = client.get(f"/tasks/{task_id}").json()
    assert t49["status"] == "escalated"

    # Check audit trail includes 'escalated_no_reply'
    event_names = [e["event"] for e in t49["events"]]
    assert "escalated_no_reply" in event_names


def test_refresh_preserves_existing_tasks_and_events():
    """
    Verify that a pipeline refresh creates a new run and new alerts,
    but NEVER deletes existing tasks, task events, or users.
    """
    # Create task before refresh
    task_before = client.post("/tasks", json={
        "title": "Historical Pre-Refresh Task",
        "steps": ["Step 1"],
        "owner": "Mitanin Anita [SAMPLE]"
    }).json()
    task_id = task_before["id"]

    # Client replies
    client.post(f"/tasks/{task_id}/reply", json={
        "status": "done",
        "notes": "Task completed prior to data refresh."
    })

    tasks_count_before = len(client.get("/tasks").json())
    users_count_before = len(client.get("/users").json())

    # Execute pipeline refresh
    refresh_resp = client.post("/runs/refresh")
    assert refresh_resp.status_code == 200
    refresh_data = refresh_resp.json()
    assert refresh_data["status"] == "success"
    assert "new_run_id" in refresh_data

    # Verify tasks, events, and users are still present and intact
    tasks_after = client.get("/tasks").json()
    assert len(tasks_after) == tasks_count_before

    users_after = client.get("/users").json()
    assert len(users_after) == users_count_before

    # Verify original task retains its events
    preserved_task = client.get(f"/tasks/{task_id}").json()
    assert preserved_task["status"] == "done"
    assert len(preserved_task["events"]) == 2


def test_dashboard_summary():
    """Verify dashboard summary metrics."""
    resp = client.get("/dashboard/summary")
    assert resp.status_code == 200
    summary = resp.json()
    assert "total_alerts" in summary
    assert "alerts_by_risk" in summary
    assert "tasks_by_status" in summary
    assert "clock_now" in summary
    assert "escalation_hours" in summary
    assert summary["escalation_hours"] == 48


def test_alert_detail_and_feedback():
    """Verify alert detail intelligence and feedback submission."""
    alerts = client.get("/alerts").json()
    alert_id = alerts[0]["id"]

    # 1. Fetch detail
    detail_resp = client.get(f"/alerts/{alert_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert "unit_name" in detail
    assert "method_card" in detail
    assert "similar_past_surges" in detail
    assert len(detail["similar_past_surges"]) >= 3
    assert detail["is_sample_alert"] is True

    # 2. Submit snooze feedback
    snooze_resp = client.post(f"/alerts/{alert_id}/feedback", json={
        "action": "snooze",
        "notes": "Snoozed for 24 hours pending local validation."
    })
    assert snooze_resp.status_code == 200
    assert snooze_resp.json()["alert"]["status"] == "snooze"

    # 3. Submit false_alarm feedback
    fa_resp = client.post(f"/alerts/{alert_id}/feedback", json={
        "action": "false_alarm",
        "notes": "Spike verified as retrospective data entry backlog."
    })
    assert fa_resp.status_code == 200
    assert fa_resp.json()["alert"]["status"] == "false_alarm"

