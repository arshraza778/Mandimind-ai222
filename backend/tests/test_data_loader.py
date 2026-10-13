import pytest
from pathlib import Path
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from config import AppConfig, SkillGateConfig, ReactiveRuleConfig
from data.load import load_and_validate_data, DataValidationError

client = TestClient(app)


@pytest.fixture
def base_valid_data(tmp_path):
    """Creates a temporary valid minimal dataset adhering to contract."""
    unit_map_path = tmp_path / "unit_map.csv"
    cases_path = tmp_path / "cases.csv"
    weather_path = tmp_path / "weather.csv"

    unit_map_df = pd.DataFrame([
        {"unit_id": "U1", "unit_name": "Unit One", "level": "block"},
        {"unit_id": "U2", "unit_name": "Unit Two", "level": "block"},
    ])
    unit_map_df.to_csv(unit_map_path, index=False)

    cases_df = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "U1", "cases": 5},
        {"date": "2024-01-08", "unit_id": "U1", "cases": 8},
        {"date": "2024-01-01", "unit_id": "U2", "cases": 3},
        {"date": "2024-01-08", "unit_id": "U2", "cases": 4},
    ])
    cases_df.to_csv(cases_path, index=False)

    weather_df = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "U1", "rainfall_mm": 12.5},
        {"date": "2024-01-08", "unit_id": "U1", "rainfall_mm": 5.0},
        {"date": "2024-01-01", "unit_id": "U2", "rainfall_mm": 10.0},
        {"date": "2024-01-08", "unit_id": "U2", "rainfall_mm": 0.0},
    ])
    weather_df.to_csv(weather_path, index=False)

    config = AppConfig(
        data_source="simulated",
        cases_file=str(cases_path),
        weather_file=str(weather_path),
        unit_map_file=str(unit_map_path),
        granularity="weekly",
        geography_level="block",
        horizon_steps=[2, 4],
        weather_lags_steps=[2, 3],
        skill_gate=SkillGateConfig(min_win_share=0.6, min_median_improvement=0.05),
        evaluation_years=2,
        reactive_rule=ReactiveRuleConfig(history_years=5, sd_multiplier=2.0),
        escalation_hours=48,
        interpolate_weather=False
    )

    return config, unit_map_path, cases_path, weather_path


def test_valid_files_load(base_valid_data):
    config, _, _, _ = base_valid_data
    df, units, report = load_and_validate_data(config=config, raise_on_error=True)

    assert df is not None
    assert len(df) == 4
    assert len(units) == 2
    assert report["is_valid"] is True
    assert len(report["errors"]) == 0
    assert report["date_range"] == {"start": "2024-01-01", "end": "2024-01-08"}


def test_error_missing_required_column(base_valid_data):
    config, _, cases_path, _ = base_valid_data
    # Remove required 'cases' column
    df_bad = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "U1"},
    ])
    df_bad.to_csv(cases_path, index=False)

    with pytest.raises(DataValidationError) as exc:
        load_and_validate_data(config=config, raise_on_error=True)

    assert "missing required columns" in str(exc.value).lower()
    assert "cases" in str(exc.value)


def test_error_duplicate_date_unit_id(base_valid_data):
    config, _, cases_path, _ = base_valid_data
    # Duplicate (date, unit_id)
    df_dup = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "U1", "cases": 5},
        {"date": "2024-01-01", "unit_id": "U1", "cases": 10},
    ])
    df_dup.to_csv(cases_path, index=False)

    with pytest.raises(DataValidationError) as exc:
        load_and_validate_data(config=config, raise_on_error=True)

    assert "duplicate" in str(exc.value).lower()


def test_error_negative_cases(base_valid_data):
    config, _, cases_path, _ = base_valid_data
    # Negative cases
    df_neg = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "U1", "cases": -3},
    ])
    df_neg.to_csv(cases_path, index=False)

    with pytest.raises(DataValidationError) as exc:
        load_and_validate_data(config=config, raise_on_error=True)

    assert "negative" in str(exc.value).lower()


def test_error_non_integer_cases(base_valid_data):
    config, _, cases_path, _ = base_valid_data
    # Non-integer cases
    df_non_int = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "U1", "cases": 3.75},
    ])
    df_non_int.to_csv(cases_path, index=False)

    with pytest.raises(DataValidationError) as exc:
        load_and_validate_data(config=config, raise_on_error=True)

    assert "non-integer" in str(exc.value).lower()


def test_error_unknown_unit_id(base_valid_data):
    config, _, cases_path, _ = base_valid_data
    # Unknown unit_id not in unit_map
    df_unknown = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "UNKNOWN_BLOCK", "cases": 5},
    ])
    df_unknown.to_csv(cases_path, index=False)

    with pytest.raises(DataValidationError) as exc:
        load_and_validate_data(config=config, raise_on_error=True)

    assert "unknown unit_id" in str(exc.value).lower()
    assert "UNKNOWN_BLOCK" in str(exc.value)


def test_error_unparseable_dates(base_valid_data):
    config, _, cases_path, _ = base_valid_data
    # Unparseable date
    df_bad_date = pd.DataFrame([
        {"date": "invalid-date-format", "unit_id": "U1", "cases": 5},
    ])
    df_bad_date.to_csv(cases_path, index=False)

    with pytest.raises(DataValidationError) as exc:
        load_and_validate_data(config=config, raise_on_error=True)

    assert "unparseable date" in str(exc.value).lower()


def test_error_granularity_mismatch(base_valid_data):
    config, _, cases_path, _ = base_valid_data
    # Config is weekly (7 days), but provide daily dates (1 day diff)
    df_daily = pd.DataFrame([
        {"date": "2024-01-01", "unit_id": "U1", "cases": 5},
        {"date": "2024-01-02", "unit_id": "U1", "cases": 6},
    ])
    df_daily.to_csv(cases_path, index=False)

    with pytest.raises(DataValidationError) as exc:
        load_and_validate_data(config=config, raise_on_error=True)

    assert "granularity mismatch" in str(exc.value).lower()


def test_get_data_status_api():
    """Verify GET /data/status returns contract fields."""
    response = client.get("/data/status")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data or "data_source" in data
    assert "date_range" in data
    assert "unit_count" in data
    assert "errors" in data
    assert "warnings" in data
    assert data["is_valid"] is True
    assert data["unit_count"] == 6
    assert data["date_range"]["start"] == "2018-01-01"
    assert data["date_range"]["end"] == "2023-12-18"
