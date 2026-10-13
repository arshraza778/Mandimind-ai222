"""
Automated Tests for the Multi-Disease Climate Early-Warning System Upgrade:
1. All four risk modules (Malaria, Dengue, Diarrhoeal Disease, Heat-Related Health Risk) return valid structured output.
2. Location selection updates all four disease/risk displays and cross-location comparison.
3. Public portal displays multi-disease risk information without requiring login.
4. Field employee login opens the employee dashboard with multi-disease risks and restricts data to assigned locations.
5. Supervisor login opens the supervisor dashboard with multi-disease risks/alerts and restricts data to supervised locations.
6. Unauthorized role or location access is rejected by the backend across multi-disease endpoints.
7. Multi-disease alerts are deduplicated and support lifecycle transitions (active, acknowledged, resolved, expired) with audit fields.
8. Tasks and field reports can be created, filtered, updated, and completed for each supported disease or health risk.
9. Missing/insufficient historical data (BLK_F), water-quality honesty rules (never inferring contamination from rainfall alone), and separation of non-infectious heat risk from infectious ML forecasts are enforced.
"""

from datetime import datetime
from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app
from app.db.session import init_db, SessionLocal
from app.db.seed import seed_database
from app.db.clock import reset_clock
from app.db.models import Alert, PipelineRun

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_seeded_multi_disease_db():
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
        reset_clock(db, anchor_time=datetime(2024, 1, 15, 9, 0, 0))
    finally:
        db.close()
    yield


def _login(username: str, password: str = "password123") -> dict:
    resp = client.post("/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_all_four_risk_modules_return_valid_structured_output():
    """Verify Malaria, Dengue, Diarrhoeal Disease, and Heat-Related Health Risk return complete modular schemas."""
    resp = client.get("/diseases/overview?district_id=DIST_SAMPLE&block_id=BLK_A&village_id=VIL_A1")
    assert resp.status_code == 200
    data = resp.json()

    assert set(data["supported_diseases"]) == {"malaria", "dengue", "diarrhoea", "heat"}
    assert len(data["cards"]) == 4

    required_keys = {
        "disease_type",
        "name",
        "risk_domain",
        "is_infectious",
        "prediction_nature",
        "prediction_available",
        "risk_category",
        "supported_horizon",
        "model_version",
        "risk_estimate",
        "climate_indicators",
        "input_features",
        "supporting_evidence",
        "uncertainty",
        "documented_thresholds",
        "data_quality",
        "historical_trends",
        "forecast_chart",
        "recommendations",
        "last_updated",
    }

    for d_type in ("malaria", "dengue", "diarrhoea", "heat"):
        mod = data["diseases"][d_type]
        missing = required_keys - set(mod.keys())
        assert not missing, f"Module {d_type} missing keys: {missing}"
        assert mod["risk_category"] in ("Low", "Moderate", "High", "Very High")
        assert len(mod["recommendations"]["citizen_actions"]) >= 2
        assert len(mod["recommendations"]["health_worker_actions"]) >= 1
        assert "when_to_seek_care" in mod["recommendations"]

    # Heat risk must be explicitly separated from infectious diseases and labeled as rule-based meteorological index
    heat_mod = data["diseases"]["heat"]
    assert heat_mod["is_infectious"] is False
    assert heat_mod["risk_domain"] == "environmental_meteorological"
    assert heat_mod["prediction_nature"] == "meteorological_threshold_assessment"
    assert heat_mod["uncertainty"]["calculable"] is False

    # Diarrhoeal risk must never infer drinking-water contamination from rainfall alone
    dia_mod = data["diseases"]["diarrhoea"]
    assert dia_mod["is_infectious"] is True
    assert dia_mod["water_contamination_inferred_from_rainfall"] is False
    assert dia_mod["water_quality_telemetry_connected"] is False


def test_location_selection_updates_all_four_disease_displays():
    """Verify changing location (e.g. BLK_A vs BLK_B vs BLK_D) updates all 4 risk assessments and disease filters."""
    blk_a = client.get("/diseases/overview?district_id=DIST_SAMPLE&block_id=BLK_A").json()
    blk_b = client.get("/diseases/overview?district_id=DIST_SAMPLE&block_id=BLK_B").json()
    blk_d = client.get("/diseases/overview?district_id=DIST_SAMPLE&block_id=BLK_D").json()

    assert blk_a["diseases"]["malaria"]["risk_category"] == "Very High"
    assert blk_b["diseases"]["dengue"]["risk_category"] == "High"
    assert blk_d["diseases"]["heat"]["risk_category"] == "Very High"

    # Test single-disease filter on overview
    filtered = client.get("/diseases/overview?district_id=DIST_SAMPLE&block_id=BLK_B&disease_type=dengue").json()
    assert filtered["selected_filter"] == "dengue"
    assert len(filtered["cards"]) == 1
    assert filtered["cards"][0]["disease_type"] == "dengue"


def test_disease_specific_detail_pages_and_insufficient_data_honesty():
    """Verify dedicated /diseases/{disease_type}/detail endpoint and honest missing-data handling on BLK_F."""
    for d_type in ("malaria", "dengue", "diarrhoea", "heat"):
        resp = client.get(f"/diseases/{d_type}/detail?district_id=DIST_SAMPLE&block_id=BLK_A&village_id=VIL_A1")
        assert resp.status_code == 200
        detail = resp.json()
        assert detail["disease_type"] == d_type
        assert detail["assessment"]["disease_type"] == d_type
        assert "documented_thresholds" in detail
        assert "forecast_vs_diagnosis_notice" in detail
        assert len(detail["assessment"]["historical_trends"]) > 0

    # Verify BLK_F honestly reports insufficient historical observations for dengue and diarrhoea
    blk_f_dengue = client.get("/diseases/dengue/detail?district_id=DIST_SAMPLE&block_id=BLK_F").json()
    assert blk_f_dengue["assessment"]["prediction_available"] is False
    assert blk_f_dengue["assessment"]["prediction_nature"] == "insufficient_observations_experimental"
    assert blk_f_dengue["assessment"]["data_quality"]["status"] == "insufficient_historical_observations"
    assert blk_f_dengue["assessment"]["forecast_chart"] == []

    blk_f_dia = client.get("/diseases/diarrhoea/detail?district_id=DIST_SAMPLE&block_id=BLK_F").json()
    assert blk_f_dia["assessment"]["prediction_available"] is False
    assert blk_f_dia["assessment"]["water_contamination_inferred_from_rainfall"] is False
    assert blk_f_dia["assessment"]["forecast_chart"] == []


def test_public_portal_displays_multi_disease_risks_without_login():
    """Verify /public/risk-dashboard returns all 4 health risks, thresholds, and advisories without auth."""
    resp = client.get("/public/risk-dashboard?district_id=DIST_SAMPLE&block_id=BLK_A&village_id=VIL_A2")
    assert resp.status_code == 200
    pub = resp.json()
    assert "multi_disease" in pub
    assert len(pub["multi_disease"]["cards"]) == 4
    assert "documented_thresholds" in pub["multi_disease"]
    assert "forecast_vs_diagnosis_notice" in pub["multi_disease"]
    assert pub["data_status"]["is_simulated"] is True


def test_employee_and_supervisor_jurisdiction_and_multi_disease_workflows():
    """Verify Field Employee and Supervisor portals expose multi-disease risks, tasks, reports, and enforce RBAC."""
    asha_auth = _login("asha")
    asha_headers = {"Authorization": f"Bearer {asha_auth['token']}"}

    emp_dash = client.get("/employee/dashboard", headers=asha_headers)
    assert emp_dash.status_code == 200
    emp_data = emp_dash.json()
    assert len(emp_data["multi_disease"]["cards"]) == 4

    # Field employee cannot access another block's disease detail or overview
    unauth_ov = client.get("/diseases/overview?district_id=DIST_SAMPLE&block_id=BLK_B", headers=asha_headers)
    assert unauth_ov.status_code == 403
    unauth_det = client.get("/diseases/dengue/detail?district_id=DIST_SAMPLE&block_id=BLK_B", headers=asha_headers)
    assert unauth_det.status_code == 403

    # Field employee can submit a disease-tagged field report with suspected cases & emerging concern flag
    rep_resp = client.post(
        "/employee/reports",
        headers=asha_headers,
        json={
            "disease_type": "diarrhoea",
            "title": "Sector 4 Post-Rainfall Safe Water & ADD Check",
            "village_id": "VIL_A1",
            "households_visited": 14,
            "rdt_conducted": 0,
            "positive_cases": 0,
            "suspected_cases": 3,
            "emerging_concern": True,
            "stagnant_water_sites": 2,
            "nets_distributed": 15,
            "observations": "Distributed 15 ORS packets and chlorine tablets; 3 mild watery diarrhoea cases started on ORS.",
            "evidence_notes": "ORS Depot Register #A1-22",
        },
    )
    assert rep_resp.status_code == 200
    rep = rep_resp.json()
    assert rep["disease_type"] == "diarrhoea"
    assert rep["suspected_cases"] == 3
    assert rep["emerging_concern"] is True

    # Supervisor Verma (BLK_A) can create tasks for any supported disease in BLK_A, but not BLK_B
    verma_auth = _login("verma")
    verma_headers = {"Authorization": f"Bearer {verma_auth['token']}"}

    sup_dash = client.get("/supervisor/dashboard", headers=verma_headers)
    assert sup_dash.status_code == 200
    sup_data = sup_dash.json()
    assert len(sup_data["multi_disease"]["cards"]) == 4

    for d_type in ("malaria", "dengue", "diarrhoea", "heat"):
        t_resp = client.post(
            "/supervisor/tasks",
            headers=verma_headers,
            json={
                "disease_type": d_type,
                "title": f"Targeted {d_type} field action in VIL_A1",
                "instructions": f"Execute {d_type} protocol",
                "steps": [f"Step 1 for {d_type}"],
                "owner": "Mitanin Asha [SAMPLE]",
                "priority": "High",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_A",
                "village_id": "VIL_A1",
            },
        )
        assert t_resp.status_code == 200
        created_t = t_resp.json()
        assert created_t["disease_type"] == d_type

        # Filter employee tasks by disease_type
        emp_filtered = client.get(f"/employee/tasks?disease_type={d_type}", headers=asha_headers).json()
        assert any(t["id"] == created_t["id"] for t in emp_filtered)

        # Employee completes the task
        act_resp = client.post(
            f"/employee/tasks/{created_t['id']}/action",
            headers=asha_headers,
            json={"action": "complete", "completion_notes": f"Completed {d_type} action."},
        )
        assert act_resp.status_code == 200
        assert act_resp.json()["status"] == "done"

    # Supervisor Verma cannot assign a task in BLK_B
    forbidden_t = client.post(
        "/supervisor/tasks",
        headers=verma_headers,
        json={
            "disease_type": "dengue",
            "title": "Unauthorized Block B Dengue Task",
            "owner": "Mitanin Sunita [SAMPLE]",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_B",
        },
    )
    assert forbidden_t.status_code == 403


def test_multi_disease_alerts_deduplication_and_lifecycle():
    """Verify alerts exist across all 4 health risks, are deduplicated per run, and support acknowledge/resolve/expire."""
    db = SessionLocal()
    try:
        latest_run = db.query(PipelineRun).order_by(PipelineRun.created_at.desc(), PipelineRun.run_id.desc()).first()
        run_alerts = db.query(Alert).filter(Alert.run_id == latest_run.run_id).all()
        pairs = [(a.unit_id, a.disease_type, a.run_id) for a in run_alerts]
        assert len(pairs) == len(set(pairs)), "Duplicate alerts found for the same (unit_id, disease_type, run_id)!"
    finally:
        db.close()

    for d_type in ("malaria", "dengue", "diarrhoea", "heat"):
        alerts_d = client.get(f"/alerts?disease_type={d_type}").json()
        assert len(alerts_d) >= 1
        assert all(a["disease_type"] == d_type for a in alerts_d)

    # Test lifecycle status transitions (acknowledged -> resolved -> expired -> active) with audit tracking
    dengue_alert = client.get("/alerts?disease_type=dengue").json()[0]
    aid = dengue_alert["id"]

    for new_status in ("acknowledged", "resolved", "expired", "active"):
        st_resp = client.post(
            f"/alerts/{aid}/status",
            json={"action": new_status, "actor": "Supervisor P. Patel [SAMPLE]", "notes": f"Marked {new_status}"},
        )
        assert st_resp.status_code == 200
        updated_a = st_resp.json()["alert"]
        assert updated_a["status"] == new_status
        assert updated_a["updated_by"] is not None
        assert updated_a["updated_at"] is not None
