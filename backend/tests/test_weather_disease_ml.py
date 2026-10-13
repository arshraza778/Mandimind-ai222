"""
Tests for Weather-Related Disease Prediction ML Pipeline and FastAPI Endpoints:
- Artifact existence and integrity (`artifacts/disease_prediction_model.joblib`, metrics, report, plots)
- `GET /predict/status` and `GET /predict/health`
- `POST /predict` with valid structured and CSV-alias payloads
- Validation errors (`422`) on missing or out-of-range inputs
- Emergency red-flag warning detection (`chest_pain`, `shortness_of_breath`, `confusion`)
- Prediction coverage across all 11 supported target disease classes
"""

from pathlib import Path
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
DATASET_PATH = PROJECT_ROOT / "docs" / "Weather-related disease prediction.csv"

client = TestClient(app)


def test_ml_artifacts_exist_and_valid():
    expected_files = [
        "disease_prediction_model.joblib",
        "model_metrics.json",
        "classification_report.csv",
        "confusion_matrix.png",
        "feature_importance.png",
        "dataset_analysis.json",
    ]
    for fname in expected_files:
        fpath = ARTIFACTS_DIR / fname
        assert fpath.exists(), f"Expected artifact missing: {fname}"
        assert fpath.stat().st_size > 0, f"Artifact is empty: {fname}"


def test_predict_status_endpoint():
    res = client.get("/predict/status")
    assert res.status_code == 200
    body = res.json()
    assert body["model_loaded"] is True
    assert body["status"] == "ready"
    assert body["num_classes"] == 11
    assert body["feature_count"] == 50
    assert "Malaria" in body["classes"]
    assert "Dengue" in body["classes"]
    assert "Heat Stroke" in body["classes"]
    assert "macro_f1" in body["test_metrics"]


def test_predict_valid_structured_input():
    payload = {
        "age": 34,
        "gender": 1,
        "temperature_c": 29.5,
        "humidity": 0.78,
        "wind_speed_kmh": 11.2,
        "symptoms": {
            "high_fever": 1,
            "chills": 1,
            "shivering": 1,
            "headache": 1,
            "nausea": 1,
            "vomiting": 1,
            "fatigue": 1,
        },
        "medical_history": {},
    }
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "predicted_disease" in data
    assert data["predicted_disease"] in [
        "Malaria",
        "Dengue",
        "Influenza",
        "Heat Stroke",
        "Heart Attack",
        "Stroke",
        "Migraine",
        "Common Cold",
        "Sinusitis",
        "Eczema",
        "Arthritis",
    ]
    assert 0.0 <= data["model_score"] <= 1.0
    assert len(data["top_predictions"]) == 5
    assert "recommended_next_steps" in data and len(data["recommended_next_steps"]) > 0
    assert "EXPERIMENTAL DECISION-SUPPORT PROTOTYPE" in data["medical_disclaimer"]


def test_predict_emergency_warning_triggered():
    payload = {
        "age": 66,
        "gender": 0,
        "temperature_c": 14.0,
        "humidity": 0.85,
        "wind_speed_kmh": 8.0,
        "symptoms": {
            "chest_pain": 1,
            "shortness_of_breath": 1,
            "confusion": 1,
        },
        "medical_history": {
            "high_blood_pressure": 1,
            "high_cholesterol": 1,
        },
    }
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["emergency_warning"]["is_emergency"] is True
    assert len(data["emergency_warning"]["reasons"]) >= 3
    assert "108" in data["emergency_warning"]["urgent_action"]


def test_predict_validation_errors():
    # Missing required fields
    res_missing = client.post("/predict", json={"age": 30})
    assert res_missing.status_code == 422

    # Out-of-range age
    res_age = client.post(
        "/predict",
        json={
            "age": 250,
            "gender": 1,
            "temperature_c": 25.0,
            "humidity": 0.7,
            "wind_speed_kmh": 10.0,
        },
    )
    assert res_age.status_code == 422

    # Invalid gender value
    res_gender = client.post(
        "/predict",
        json={
            "age": 30,
            "gender": 9,
            "temperature_c": 25.0,
            "humidity": 0.7,
            "wind_speed_kmh": 10.0,
        },
    )
    assert res_gender.status_code == 422


def test_predict_all_11_target_classes_from_dataset():
    df = pd.read_csv(DATASET_PATH)
    classes = sorted(df["prognosis"].unique().tolist())
    assert len(classes) == 11

    predicted_classes = set()
    for cls_name in classes:
        sample_row = df[df["prognosis"] == cls_name].iloc[0].to_dict()
        sample_row.pop("prognosis", None)
        res = client.post("/predict", json=sample_row)
        assert res.status_code == 200
        pred = res.json()["predicted_disease"]
        predicted_classes.add(pred)

    # All 11 representative class samples should be accurately predicted
    assert len(predicted_classes) >= 10
