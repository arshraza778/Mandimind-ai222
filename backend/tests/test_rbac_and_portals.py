"""
Comprehensive Automated Tests for Role-Based Authentication, Location Hierarchy,
Jurisdiction Restrictions, Public Portal, Field Employee Portal, and Supervisor Portal.
"""

from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import init_db, SessionLocal
from app.db.seed import seed_database

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_seeded():
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


def _login(username: str, password: str = "password123"):
    resp = client.post("/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed for {username}: {resp.text}"
    return resp.json()


def test_authentication_role_detection_and_logout():
    """
    Verifies:
    - Invalid credentials fail with 401.
    - Field Employee ('asha') logs in and is automatically identified as 'field_employee' (mitanin).
    - Block Supervisor ('verma') logs in and is automatically identified as 'supervisor' (block_supervisor).
    - Logout invalidates the session token so subsequent /auth/me calls return 401.
    """
    # 1. Invalid password rejected
    bad_resp = client.post("/auth/login", json={"username": "asha", "password": "wrongpassword"})
    assert bad_resp.status_code == 401

    # 2. Field employee login
    asha_login = _login("asha")
    assert asha_login["portal_role"] == "field_employee"
    assert asha_login["user"]["role"] == "mitanin"
    assert asha_login["user"]["block_id"] == "BLK_A"
    assert asha_login["user"]["village_id"] == "VIL_A1"
    asha_headers = {"Authorization": f"Bearer {asha_login['token']}"}

    me_resp = client.get("/auth/me", headers=asha_headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["portal_role"] == "field_employee"

    # 3. Supervisor login
    verma_login = _login("verma")
    assert verma_login["portal_role"] == "supervisor"
    assert verma_login["user"]["role"] == "block_supervisor"
    assert verma_login["user"]["block_id"] == "BLK_A"

    # 4. Logout revokes token
    logout_resp = client.post("/auth/logout", headers=asha_headers)
    assert logout_resp.status_code == 200

    me_after = client.get("/auth/me", headers=asha_headers)
    assert me_after.status_code == 401


def test_cascading_location_hierarchy_and_jurisdiction_enforcement():
    """
    Verifies:
    - Dynamic cascading dropdowns (District -> Block -> Village).
    - Employees and Block Supervisors cannot confirm or access locations outside their assigned jurisdiction.
    """
    # 1. Public cascading hierarchy
    h_all = client.get("/locations/hierarchy").json()
    assert len(h_all["districts"]) >= 2

    h_dist = client.get("/locations/hierarchy?district_id=DIST_SAMPLE").json()
    blk_ids = {b["unit_id"] for b in h_dist["blocks"]}
    assert "BLK_A" in blk_ids
    assert "BLK_B" in blk_ids

    h_blk = client.get("/locations/hierarchy?district_id=DIST_SAMPLE&block_id=BLK_A").json()
    vil_ids = {v["unit_id"] for v in h_blk["villages"]}
    assert "VIL_A1" in vil_ids
    assert "VIL_B1" not in vil_ids

    # 2. Employee jurisdiction enforcement on /locations/confirm
    asha_login = _login("asha")
    asha_headers = {"Authorization": f"Bearer {asha_login['token']}"}

    # Allowed location (DIST_SAMPLE -> BLK_A -> VIL_A1)
    ok_confirm = client.post(
        "/locations/confirm?district_id=DIST_SAMPLE&block_id=BLK_A&village_id=VIL_A1",
        headers=asha_headers,
    )
    assert ok_confirm.status_code == 200

    # Unauthorized block (BLK_B) -> 403 Forbidden
    forbidden_blk = client.post(
        "/locations/confirm?district_id=DIST_SAMPLE&block_id=BLK_B&village_id=VIL_B1",
        headers=asha_headers,
    )
    assert forbidden_blk.status_code == 403

    # Unauthorized village (VIL_A2 when Asha is assigned to VIL_A1) -> 403 Forbidden
    forbidden_vil = client.post(
        "/locations/confirm?district_id=DIST_SAMPLE&block_id=BLK_A&village_id=VIL_A2",
        headers=asha_headers,
    )
    assert forbidden_vil.status_code == 403


def test_public_risk_dashboard_location_specificity_and_honesty():
    """
    Verifies:
    - Public users can view location-specific risk information across Low, Moderate, High, Very High categories.
    - Changing location updates the actual risk category, climate metrics, forecast series, and recommendations.
    - Missing village-level granularity and simulated data status are clearly disclosed.
    """
    # High risk block (BLK_A)
    resp_a = client.get("/public/risk-dashboard?district_id=DIST_SAMPLE&block_id=BLK_A&village_id=VIL_A1")
    assert resp_a.status_code == 200
    data_a = resp_a.json()

    # Moderate risk block (BLK_B)
    resp_b = client.get("/public/risk-dashboard?district_id=DIST_SAMPLE&block_id=BLK_B&village_id=VIL_B1")
    assert resp_b.status_code == 200
    data_b = resp_b.json()

    # Low risk block (BLK_C)
    resp_c = client.get("/public/risk-dashboard?district_id=DIST_SAMPLE&block_id=BLK_C&village_id=VIL_C1")
    assert resp_c.status_code == 200
    data_c = resp_c.json()

    # Risk categories are NOT hardcoded to High everywhere
    assert data_a["risk"]["category"] in ("High", "Very High")
    assert data_b["risk"]["category"] == "Moderate"
    assert data_c["risk"]["category"] == "Low"

    # Recommendations match actual risk category
    assert data_a["recommendations"]["show_prominent_alert"] is True
    assert data_c["recommendations"]["show_prominent_alert"] is False
    assert data_a["recommendations"]["headline"] != data_c["recommendations"]["headline"]

    # Climate & forecast data differ by block
    assert data_a["climate"]["rainfall_4wk_mm"] != data_c["climate"]["rainfall_4wk_mm"] or \
           data_a["climate"]["cases_4wk_total"] != data_c["climate"]["cases_4wk_total"]
    assert data_a["alert_threshold"] != data_c["alert_threshold"]

    # Village granularity & simulated honesty disclosure present
    assert data_a["location"]["selected_level"] == "village"
    assert data_a["location"]["data_available_level"] == "block"
    assert "Block level" in data_a["location"]["granularity_disclosure"]
    assert data_a["data_status"]["is_simulated"] is True
    assert "SIMULATED" in data_a["data_status"]["honesty_disclosure"]


def test_field_employee_dashboard_my_tasks_and_report_submission():
    """
    Verifies:
    - Field Employees see only their own assigned tasks.
    - Field Employees cannot access supervisor endpoints or other employees' tasks.
    - Task updates (acknowledge -> start -> complete with notes & attachment) persist in DB.
    - Field report submission persists in DB.
    """
    asha_login = _login("asha")
    asha_headers = {"Authorization": f"Bearer {asha_login['token']}"}

    # 1. Fetch employee dashboard
    dash_resp = client.get("/employee/dashboard", headers=asha_headers)
    assert dash_resp.status_code == 200
    dash = dash_resp.json()
    assert dash["employee"]["username"] == "asha"
    assert len(dash["tasks"]) >= 1

    # Verify all returned tasks belong to Asha
    for t in dash["tasks"]:
        assert "asha" in t["owner"].lower()

    # 2. Verify Asha cannot access supervisor dashboard -> 403 Forbidden
    sup_attempt = client.get("/supervisor/dashboard", headers=asha_headers)
    assert sup_attempt.status_code == 403

    # 3. Acknowledge, Start, and Complete Asha's task and verify persistence
    target_task_id = dash["tasks"][0]["id"]

    ack_resp = client.post(
        f"/employee/tasks/{target_task_id}/action",
        headers=asha_headers,
        json={"action": "acknowledge", "notes": "Acknowledged task in Sector 4."},
    )
    assert ack_resp.status_code == 200
    assert ack_resp.json()["status"] == "acknowledged"

    start_resp = client.post(
        f"/employee/tasks/{target_task_id}/action",
        headers=asha_headers,
        json={"action": "start", "notes": "Started household fever sweep."},
    )
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "in_progress"

    comp_resp = client.post(
        f"/employee/tasks/{target_task_id}/action",
        headers=asha_headers,
        json={
            "action": "complete",
            "completion_notes": "Visited 12 homes, 2 RDTs conducted (0 positive), 3 water containers drained.",
            "evidence_attachment": "Sector4_Screening_Sheet_Oct.jpg",
        },
    )
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert comp_data["status"] == "done"
    assert "Visited 12 homes" in comp_data["completion_notes"]
    assert comp_data["evidence_attachment"] == "Sector4_Screening_Sheet_Oct.jpg"

    # Re-fetch My Tasks with status=completed to confirm persistence
    completed_list = client.get("/employee/tasks?status=completed", headers=asha_headers).json()
    assert any(t["id"] == target_task_id for t in completed_list)

    # 4. Submit a Field Report
    rep_resp = client.post(
        "/employee/reports",
        headers=asha_headers,
        json={
            "task_id": target_task_id,
            "title": "Sector 4 Post-Rain Larval & Fever Report",
            "village_id": "VIL_A1",
            "households_visited": 12,
            "rdt_conducted": 2,
            "positive_cases": 0,
            "stagnant_water_sites": 3,
            "nets_distributed": 5,
            "observations": "Drained 3 stagnant puddles near handpump; distributed 5 LLIN nets.",
            "evidence_notes": "Register entry #A1-77",
        },
    )
    assert rep_resp.status_code == 200
    assert rep_resp.json()["review_status"] == "pending_review"


def test_supervisor_dashboard_team_tasks_and_report_review():
    """
    Verifies:
    - Supervisor sees employees, tasks, and reports within their assigned jurisdiction (BLK_A).
    - Block A Supervisor ('verma') cannot access Block B ('BLK_B') -> 403 Forbidden.
    - Supervisor can assign new tasks, update task priority/deadlines, and review field reports.
    """
    verma_login = _login("verma")
    verma_headers = {"Authorization": f"Bearer {verma_login['token']}"}

    # 1. Fetch Supervisor Dashboard for BLK_A
    dash_resp = client.get("/supervisor/dashboard", headers=verma_headers)
    assert dash_resp.status_code == 200
    dash = dash_resp.json()
    assert dash["supervisor"]["username"] == "verma"
    assert "BLK_A" in dash["authorized_block_ids"]
    assert len(dash["employees"]) >= 3  # Asha, Rekha, Anita in BLK_A

    # 2. Verify Block A Supervisor cannot access Block B -> 403 Forbidden
    forbidden_resp = client.get("/supervisor/dashboard?block_id=BLK_B", headers=verma_headers)
    assert forbidden_resp.status_code == 403

    # 3. Assign new task to Rekha in BLK_A
    assign_resp = client.post(
        "/supervisor/tasks",
        headers=verma_headers,
        json={
            "title": "Emergency RDT sweep in Tokapal Tola",
            "description": "Screen febrile cases following rainfall spike.",
            "instructions": "Visit 20 homes in Tokapal Tola and report RDT results.",
            "steps": ["Visit 20 homes", "Perform RDTs", "Submit field report"],
            "owner": "Mitanin Rekha [SAMPLE]",
            "priority": "Critical",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A2",
        },
    )
    assert assign_resp.status_code == 200
    new_task = assign_resp.json()
    assert new_task["priority"] == "Critical"
    assert new_task["block_id"] == "BLK_A"

    # 4. Update task priority via PATCH /supervisor/tasks/{id}
    patch_resp = client.patch(
        f"/supervisor/tasks/{new_task['id']}",
        headers=verma_headers,
        json={"priority": "High", "notes": "Adjusted priority after initial triage."},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["priority"] == "High"

    # 5. Filter Team Tasks by priority=High
    team_tasks = client.get("/supervisor/team-tasks?priority=High", headers=verma_headers).json()
    assert any(t["id"] == new_task["id"] for t in team_tasks)

    # 6. Review a pending Field Report in BLK_A
    pending_reports = [r for r in dash["reports"] if r["review_status"] == "pending_review"]
    assert len(pending_reports) >= 1
    rep_id = pending_reports[0]["id"]

    rev_resp = client.post(
        f"/supervisor/reports/{rep_id}/review",
        headers=verma_headers,
        json={
            "review_status": "approved",
            "review_notes": "Approved by Block Supervisor K. Verma. Larvicide stock replenishment dispatched.",
        },
    )
    assert rev_resp.status_code == 200
    assert rev_resp.json()["review_status"] == "approved"
    assert "Verma" in rev_resp.json()["reviewer_name"]
