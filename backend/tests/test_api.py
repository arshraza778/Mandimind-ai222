from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_meta_endpoint():
    response = client.get("/meta")
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "simulated"
    assert data["granularity"] == "weekly"
    assert data["unit_label"] == "weeks"
    assert data["lead_time"] == "2-4 weeks (target)"


def test_model_evidence_endpoint():
    """
    Verifies that GET /evidence returns:
    - Table per unit: baseline error, weather error, win share, median improvement, verdict chip
    - Method note: 'Time-ordered evaluation: models are trained on earlier periods and tested on later ones.'
    - Plain-language summary box
    - Notice when data_source is simulated: 'These results come from simulated data and say nothing about real malaria in Chhattisgarh.'
    """
    response = client.get("/evidence")
    assert response.status_code == 200
    data = response.json()

    assert data["method_note"] == "Time-ordered evaluation: models are trained on earlier periods and tested on later ones."
    assert "plain_language_summary" in data
    assert len(data["plain_language_summary"]) > 20

    # Notice check for simulated data
    if data["data_source"] == "simulated":
        assert data["notice"] == "These results come from simulated data and say nothing about real malaria in Chhattisgarh."

    # Units table check
    units = data["units"]
    assert len(units) >= 6
    unit_map = {u["unit_id"]: u for u in units}

    for uid in ["BLK_A", "BLK_B", "BLK_C", "BLK_D", "BLK_E", "BLK_F"]:
        assert uid in unit_map
        u = unit_map[uid]
        assert "baseline_mae" in u
        assert "weather_mae" in u
        assert "win_share" in u
        assert "median_improvement" in u
        assert "verdict_chip" in u
        assert u["verdict_chip"] in ["Use weather", "Use baseline", "Not enough data", "No weather data"]

    # Verify Block C and F choose baseline
    assert unit_map["BLK_C"]["verdict_chip"] == "Use baseline"
    assert unit_map["BLK_F"]["verdict_chip"] == "Use baseline"


def test_model_evidence_disruption_toggle():
    """
    Verifies that the 'Exclude reporting-disruption periods' toggle
    recomputes through the API and changes numbers.
    """
    resp_false = client.get("/evidence?exclude_disruptions=false")
    resp_true = client.get("/evidence?exclude_disruptions=true")

    assert resp_false.status_code == 200
    assert resp_true.status_code == 200

    data_false = resp_false.json()
    data_true = resp_true.json()

    assert data_false["exclude_disruptions"] is False
    assert data_true["exclude_disruptions"] is True

    # Check that numbers change
    units_false = {u["unit_id"]: u for u in data_false["units"]}
    units_true = {u["unit_id"]: u for u in data_true["units"]}

    # Block B or other units should have different metrics
    mae_changed = False
    for uid in units_false:
        if units_false[uid]["baseline_mae"] != units_true[uid]["baseline_mae"] or \
           units_false[uid]["weather_mae"] != units_true[uid]["weather_mae"]:
            mae_changed = True
            break

    assert mae_changed is True, "Toggling exclude_disruptions must recompute and change the numbers."
