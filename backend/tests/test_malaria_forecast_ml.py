"""
Tests for Historical Malaria Case & Incidence Forecasting ML Pipeline and FastAPI Endpoints:
- Dataset inspection and feature engineering (`docs/archive/*.csv`)
- Artifact existence and integrity (`artifacts/malaria_forecast_model.joblib`, metrics, EDA, report, plots)
- `GET /predict/malaria-cases/status` and `GET /predict/malaria-cases/health`
- `GET /predict/malaria-cases` and `POST /predict/malaria-cases` with country lookup (India, Nigeria, Algeria, etc.)
- `POST /predict/malaria-cases` with custom 3-year historical incidence lags
- Walk-forward historical backtest mode (`base_year=2016`, `horizon_years=2` returning actual observed 2017–2018 values)
- Validation errors (`422`) on unsupported sub-district locations, incomplete custom lag triplets, or invalid horizons
- Integration in `GET /evidence` (`malaria_archive_model`)
"""

from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"

client = TestClient(app)


def test_malaria_forecast_artifacts_exist_and_valid():
    expected_files = [
        "malaria_forecast_model.joblib",
        "malaria_model_metrics.json",
        "malaria_dataset_analysis.json",
        "malaria_evaluation_report.csv",
        "malaria_forecast_evaluation.png",
        "malaria_feature_importance.png",
    ]
    for fname in expected_files:
        fpath = ARTIFACTS_DIR / fname
        assert fpath.exists(), f"Expected malaria artifact missing: {fname}"
        assert fpath.stat().st_size > 0, f"Malaria artifact is empty: {fname}"


def test_malaria_forecast_status_endpoint():
    res = client.get("/predict/malaria-cases/status")
    assert res.status_code == 200
    body = res.json()
    assert body["model_loaded"] is True
    assert body["status"] == "ready"
    assert body["selected_model"] == "HuberRegressor (Robust Linear ARX)"
    assert body["countries_count"] == 107
    assert "India" in body["countries"]
    assert "South-East Asia" in body["who_regions"]
    assert len(body["feature_columns"]["all_ordered"]) == 13

    test_metrics = body["selected_model_metrics"]["test_2017_2018"]
    base_metrics = body["baseline_comparison"]["Persistence Baseline (lag_1)"]["test_2017_2018"]
    assert test_metrics["mae"] < base_metrics["mae"]
    assert test_metrics["rmse"] < base_metrics["rmse"]
    assert len(body["regional_test_performance_2017_2018"]) == 6
    assert len(body["limitations_and_deployment_safeguards"]) >= 4


def test_malaria_forecast_india_default_get_and_post():
    res_get = client.get("/predict/malaria-cases?country=India&horizon_years=3")
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["status"] == "success"
    assert data["country"] == "India"
    assert data["who_region"] == "South-East Asia"
    assert data["base_year"] == 2018
    assert data["forecast_period"] == "2019–2021"
    assert len(data["forecasts"]) == 3
    assert data["input_lags_per_1000"]["incidence_lag_1"] == 5.33
    assert data["input_lags_per_1000"]["incidence_lag_2"] == 7.47
    assert data["input_lags_per_1000"]["incidence_lag_3"] == 9.99

    f_2019 = data["forecasts"][0]
    assert f_2019["year"] == 2019
    assert 0.0 < f_2019["predicted_incidence_per_1000"] < 15.0
    assert f_2019["ci_80_lower"] <= f_2019["predicted_incidence_per_1000"] <= f_2019["ci_80_upper"]
    assert f_2019["projected_reported_cases"] > 0
    assert f_2019["projected_estimated_cases"] > f_2019["projected_reported_cases"]
    assert len(data["mitanin_guidance"]["recommended_actions"]) >= 3
    assert "EXPERIMENTAL EPIDEMIOLOGICAL FORECAST" in data["experimental_disclaimer"]


def test_malaria_forecast_zero_elimination_lock_algeria():
    res = client.post(
        "/predict/malaria-cases",
        json={"country": "Algeria", "horizon_years": 2},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["country"] == "Algeria"
    for f in data["forecasts"]:
        assert f["predicted_incidence_per_1000"] == 0.0
        assert f["risk_category"] == "Low"


def test_malaria_forecast_custom_lags_and_location_granularity_disclosure():
    payload = {
        "country": "India",
        "who_region": "South-East Asia",
        "base_year": 2018,
        "horizon_years": 2,
        "incidence_lag_1": 145.0,
        "incidence_lag_2": 120.0,
        "incidence_lag_3": 98.0,
        "location_context": "Sample District · Sample Block A",
    }
    res = client.post("/predict/malaria-cases", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["predicted_next_year"]["predicted_incidence_per_1000"] > 100.0
    assert data["predicted_next_year"]["risk_category"] in ("High", "Very High")
    assert "Sample Block A" in data["granularity_limitation_note"]


def test_malaria_forecast_walk_forward_backtest_with_actuals():
    res = client.post(
        "/predict/malaria-cases",
        json={"country": "India", "base_year": 2016, "horizon_years": 2},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["base_year"] == 2016
    assert data["forecasts"][0]["year"] == 2017
    assert data["forecasts"][0]["actual_observed_incidence_per_1000"] == 7.47
    assert data["forecasts"][1]["year"] == 2018
    assert data["forecasts"][1]["actual_observed_incidence_per_1000"] == 5.33


def test_malaria_forecast_validation_errors():
    # Unsupported sub-district block passed as country without custom lags -> 422 limitation error
    res_block = client.post(
        "/predict/malaria-cases",
        json={"country": "Sample Block A", "horizon_years": 2},
    )
    assert res_block.status_code == 422
    assert "country-level annual records" in res_block.json()["detail"]

    # Incomplete custom lags (only 1 of 3 provided) -> 422
    res_partial_lags = client.post(
        "/predict/malaria-cases",
        json={"country": "India", "incidence_lag_1": 12.5},
    )
    assert res_partial_lags.status_code == 422

    # Invalid horizon (> 5 years) -> 422
    res_horizon = client.post(
        "/predict/malaria-cases",
        json={"country": "India", "horizon_years": 12},
    )
    assert res_horizon.status_code == 422

    # Negative incidence lag -> 422
    res_neg = client.post(
        "/predict/malaria-cases",
        json={
            "country": "India",
            "incidence_lag_1": -5.0,
            "incidence_lag_2": 10.0,
            "incidence_lag_3": 12.0,
        },
    )
    assert res_neg.status_code == 422


def test_evidence_endpoint_includes_malaria_archive_model():
    res = client.get("/evidence")
    assert res.status_code == 200
    data = res.json()
    assert "malaria_archive_model" in data
    assert data["malaria_archive_model"]["model_loaded"] is True
    assert data["malaria_archive_model"]["selected_model"] == "HuberRegressor (Robust Linear ARX)"
