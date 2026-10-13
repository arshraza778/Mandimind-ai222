"""
Tests for Product Claim Safeguards, Baseline-Relative Skill Score (including zero baseline MAE),
CSV Upload/Template Validation, and Alert -> Task -> Owner -> Deadline -> Completion Ledger Workflow.
"""

from fastapi.testclient import TestClient
from app.main import app
from forecast.evaluate import compute_baseline_relative_skill
from data.load import validate_uploaded_surveillance_csv, generate_csv_template_string

client = TestClient(app)


def test_skill_score_calculation_and_zero_baseline_mae():
    """
    Tests Skill = 1 - MAE_candidate / MAE_baseline and explicit handling of zero baseline MAE.
    """
    # Normal positive skill
    res_pos = compute_baseline_relative_skill(candidate_mae=6.0, baseline_mae=10.0)
    assert res_pos["skill_score"] == 0.4
    assert res_pos["skill_score_pct"] == "40.0%"
    assert res_pos["zero_baseline_mae_handled"] is False

    # Negative skill (candidate worse than baseline)
    res_neg = compute_baseline_relative_skill(candidate_mae=12.0, baseline_mae=10.0)
    assert res_neg["skill_score"] == -0.2
    assert res_neg["skill_score_pct"] == "-20.0%"

    # Zero baseline MAE with zero candidate MAE -> no division by zero
    res_zero_both = compute_baseline_relative_skill(candidate_mae=0.0, baseline_mae=0.0)
    assert res_zero_both["skill_score"] == 0.0
    assert res_zero_both["zero_baseline_mae_handled"] is True

    # Zero baseline MAE with positive candidate MAE -> no division by zero
    res_zero_base = compute_baseline_relative_skill(candidate_mae=3.5, baseline_mae=0.0)
    assert res_zero_base["skill_score"] == -1.0
    assert res_zero_base["zero_baseline_mae_handled"] is True

    # Missing MAE input
    res_none = compute_baseline_relative_skill(candidate_mae=None, baseline_mae=8.0)
    assert res_none["skill_score"] is None
    assert res_none["skill_score_pct"] == "N/A"


def test_evidence_endpoint_skill_gate_and_claim_verification_table():
    """
    Verifies rolling-origin evaluation endpoint exposes Skill score, Pass/Fail/Insufficient evidence,
    synthetic data disclaimer, and the 5-row claim-by-claim verification table.
    """
    res = client.get("/evidence")
    assert res.status_code == 200
    data = res.json()

    assert (
        data.get("synthetic_evaluation_notice")
        == "Illustrative evaluation on synthetic data; not evidence of real-world forecasting performance."
    )
    assert (
        data.get("forecast_horizon_target")
        == "Target forecast horizon: 2–4 weeks, subject to local validation."
    )

    claims = data.get("claims_verification_table", [])
    assert len(claims) == 5
    corrected_texts = [c["corrected_positioning"] for c in claims]
    assert "Routine surveillance may identify some surges only after cases rise; earlier warning remains a challenge." in corrected_texts
    assert "Target forecast horizon: 2–4 weeks, subject to local validation." in corrected_texts

    units = data.get("units", [])
    assert len(units) >= 6
    for u in units:
        assert u["skill_gate_status"] in ("Pass", "Fail", "Insufficient evidence")
        assert "skill_score" in u
        if u["skill_gate_status"] == "Fail":
            assert u["decision"] == "seasonal_baseline"


def test_csv_template_and_upload_validation_safeguards():
    """
    Tests downloadable CSV template and CSV upload validator:
    - catches missing columns or invalid negative case counts
    - never silently converts missing case counts to zero
    - never calculates incidence without a valid population denominator
    """
    tpl_res = client.get("/data/template-csv")
    assert tpl_res.status_code == 200
    assert "week_start,district,block,reported_cases,population,rainfall_mm,temperature_c" in tpl_res.text

    # Valid CSV with 1 row having missing reported_cases and 1 row having missing population
    csv_sample = generate_csv_template_string()
    up_res = client.post(
        "/data/upload-csv",
        json={"csv_content": csv_sample, "filename": "test_valid.csv"},
    )
    assert up_res.status_code == 200
    v_data = up_res.json()
    assert v_data["is_valid"] is True
    assert v_data["missing_cases_count"] == 1
    assert v_data["missing_cases_preserved_as_null"] is True
    # Check that row 3 (index 2) preserved reported_cases as None (not 0!)
    assert v_data["preview_rows"][2]["reported_cases"] is None
    # Check that row 4 (index 3, missing population) has incidence_per_1000 as None
    assert v_data["preview_rows"][3]["population"] is None
    assert v_data["preview_rows"][3]["incidence_per_1000"] is None

    # Invalid CSV: missing required columns and negative case count
    bad_csv = "week_start,district,block,reported_cases\n2025-07-07,Dist,Blk,-5\n"
    bad_res = validate_uploaded_surveillance_csv(bad_csv, "bad.csv")
    assert bad_res["is_valid"] is False
    assert len(bad_res["errors"]) >= 1


def test_alert_review_task_assignment_and_ledger_csv_export():
    """
    Tests end-to-end accountable workflow:
    Alert human review -> Task creation -> Owner reassignment & status transition -> Append-only ledger & CSV export.
    """
    # 1. Inspect alert detail & human review status
    alerts_res = client.get("/alerts")
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    assert len(alerts) > 0
    alert_id = alerts[0]["id"]

    # Acknowledge / human review alert
    rev_res = client.post(
        f"/alerts/{alert_id}/feedback",
        json={"action": "acknowledged", "notes": "Reviewed by supervisor before task assignment."},
    )
    assert rev_res.status_code == 200

    detail_res = client.get(f"/alerts/{alert_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["review_status"] == "Reviewed / Acknowledged"

    # 2. Create linked operational task
    create_res = client.post(
        "/tasks",
        json={
            "alert_id": alert_id,
            "disease_type": "malaria",
            "title": "Household fever check-in & stagnant water verification",
            "steps": ["Visit 10 households", "Check stagnant water containers"],
            "owner": "Mitanin Asha [SAMPLE]",
            "priority": "High",
        },
    )
    assert create_res.status_code == 200
    task_id = create_res.json()["id"]

    # 3. Reassign owner and transition status -> append-only ledger entry
    status_res = client.post(
        f"/tasks/{task_id}/status",
        json={
            "status": "completed",
            "owner": "Mitanin Sunita [SAMPLE]",
            "actor": "Supervisor [SAMPLE]",
            "completion_notes": "Completed household verification in 12 homes.",
        },
    )
    assert status_res.status_code == 200
    updated_task = status_res.json()
    assert updated_task["status"] == "done"
    assert updated_task["owner"] == "Mitanin Sunita [SAMPLE]"
    assert len(updated_task["events"]) >= 2

    # 4. Export completion ledger as CSV
    csv_res = client.get("/tasks/export-csv")
    assert csv_res.status_code == 200
    assert "task_id,alert_id,unit_name,disease_type,title,owner,priority,status" in csv_res.text
    assert "Mitanin Sunita [SAMPLE]" in csv_res.text
