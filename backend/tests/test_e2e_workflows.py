"""
End-to-End Workflow Tests for Mitanin Signal Prototype:
1. Happy Path: Alert -> Assign Task -> Mitanin replies Done -> Task Ledger shows Done with audit trail.
2. Escalation Workflow: Task created -> Advance Simulated Clock past escalation window -> Task transitions to Escalated with audit event.
"""

from datetime import datetime, timezone
from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app
from app.db.session import init_db, SessionLocal
from app.db.models import Task, TaskEvent, Alert

client = TestClient(app)


def test_e2e_happy_path_workflow():
    """
    E2E Happy Path:
    1. Fetch existing alerts
    2. Assign frontline task from alert for Mitanin
    3. Verify task created with status 'sent' and audit event
    4. Frontline Mitanin worker submits reply 'done'
    5. Verify task ledger shows status 'done' with full audit trail
    """
    # 1. Fetch alerts
    alerts_resp = client.get("/alerts")
    assert alerts_resp.status_code == 200
    alerts = alerts_resp.json()
    assert len(alerts) > 0
    target_alert = alerts[0]
    alert_id = target_alert["id"]

    # 2. Supervisor creates task
    task_payload = {
        "alert_id": alert_id,
        "title": "Door-to-door fever testing [E2E TEST]",
        "steps": [
            "Test symptomatic individuals with RDT kits",
            "Refer slide-positive cases immediately to sub-centre",
            "Log screening tally on Mitanin card"
        ],
        "owner": "Mitanin Sarita [SAMPLE]",
    }
    create_resp = client.post("/tasks", json=task_payload)
    assert create_resp.status_code == 200
    task_data = create_resp.json()
    task_id = task_data["id"]

    assert task_data["title"] == task_payload["title"]
    assert task_data["owner"] == task_payload["owner"]
    assert task_data["status"] == "sent"
    assert len(task_data["events"]) >= 1
    assert task_data["events"][0]["event"] == "task_created"

    # 3. Verify task appears in task list with status 'sent'
    list_sent_resp = client.get(f"/tasks?status=sent")
    assert list_sent_resp.status_code == 200
    sent_task_ids = [t["id"] for t in list_sent_resp.json()]
    assert task_id in sent_task_ids

    # 4. Frontline worker replies 'done'
    reply_payload = {
        "status": "done",
        "actor": "Mitanin Sarita [SAMPLE]",
        "notes": "Visited 28 households. 3 RDTs administered, all negative."
    }
    reply_resp = client.post(f"/tasks/{task_id}/reply", json=reply_payload)
    assert reply_resp.status_code == 200
    updated_task = reply_resp.json()
    assert updated_task["status"] == "done"

    # 5. Verify ledger shows status 'done' and complete audit trail
    detail_resp = client.get(f"/tasks/{task_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["status"] == "done"

    events = detail["events"]
    assert len(events) >= 2
    event_names = [e["event"] for e in events]
    assert "task_created" in event_names
    assert "mitanin_reply_done" in event_names

    # Check that task is in done list
    list_done_resp = client.get("/tasks?status=done")
    assert list_done_resp.status_code == 200
    done_ids = [t["id"] for t in list_done_resp.json()]
    assert task_id in done_ids


def test_e2e_escalation_workflow_with_simulated_clock():
    """
    E2E Escalation Workflow:
    1. Reset simulated clock to baseline anchor
    2. Create a new task (status 'sent')
    3. Verify task is in 'sent' status
    4. Advance simulated clock by 50 hours (past 48h escalation window)
    5. Verify task transitioned to 'escalated'
    6. Verify audit trail records the 'task_escalated' event
    7. Reset simulated clock back to baseline
    """
    # 1. Reset clock to baseline
    reset_resp = client.post("/clock/reset")
    assert reset_resp.status_code == 200

    # 2. Create task
    task_payload = {
        "title": "Spraying support escort [E2E ESCALATION TEST]",
        "steps": [
            "Guide IRS spray team to high-risk tolas",
            "Verify household acceptance"
        ],
        "owner": "Mitanin Anita [SAMPLE]",
    }
    create_resp = client.post("/tasks", json=task_payload)
    assert create_resp.status_code == 200
    task_id = create_resp.json()["id"]

    # Verify task starts as 'sent'
    detail_before = client.get(f"/tasks/{task_id}").json()
    assert detail_before["status"] == "sent"

    # 3. Advance clock by 50 hours (exceeding 48h escalation window)
    advance_resp = client.post("/clock/advance?hours=50")
    assert advance_resp.status_code == 200
    advance_data = advance_resp.json()
    assert advance_data["advanced_by_hours"] == 50
    assert task_id in advance_data["escalated_task_ids"]

    # 4. Verify task ledger shows status 'escalated'
    detail_after = client.get(f"/tasks/{task_id}").json()
    assert detail_after["status"] == "escalated"

    # 5. Verify audit event was logged
    event_names = [e["event"] for e in detail_after["events"]]
    assert any("escalat" in name.lower() for name in event_names)
    escalated_event = [e for e in detail_after["events"] if "escalat" in e["event"].lower()][0]
    assert "Simulated Clock" in escalated_event["actor"] or "System" in escalated_event["actor"]

    # 6. Clean up: reset clock
    reset_final = client.post("/clock/reset")
    assert reset_final.status_code == 200
