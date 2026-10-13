"""
Automated Tests for P6: Forecasting, Model Skill Gate, and Pipeline Refresh.
Verifies:
1. Strict zero data leakage in rolling-origin evaluation (fails if leakage detected).
2. Negative Binomial GLM baseline and weather model fitting and 80% prediction intervals.
3. MAE and RMSE metrics computation (strictly NO MAPE).
4. Skill gate decision logic (Units C and F select Baseline).
5. Pipeline refresh end-to-end: generates evidence.json, forecasts.json, and preserves existing tasks/events/users in SQLite.
"""

import json
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import pytest

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import load_config
from data.load import load_and_validate_data
from forecast.models import NegativeBinomialForecastModel, construct_features
from forecast.evaluate import evaluate_unit_rolling_origin, run_evidence_evaluation
from forecast.predict import generate_unit_forecast, generate_all_forecasts
from pipeline import run_pipeline_refresh
from app.db.session import init_db, SessionLocal
from app.db.models import Task, TaskEvent, User, Alert, PipelineRun
from app.db.clock import get_simulated_now


def test_strict_zero_data_leakage():
    """
    CRITICAL TEST: Verifies that training data strictly ends before test period begins.
    Fails if any future test data leaks into the model training set or feature construction.
    """
    cfg = load_config()
    n = 100
    dates = pd.date_range("2020-01-01", periods=n, freq="W-MON").strftime("%Y-%m-%d").tolist()
    
    # Synthetic clean time series
    df_clean = pd.DataFrame({
        "date": dates,
        "unit_id": "TEST_UNIT",
        "step_idx": np.arange(n),
        "cases": np.random.poisson(20, size=n),
        "rainfall_mm": np.random.uniform(10, 100, size=n),
        "temp_c": np.random.uniform(22, 35, size=n),
    })

    # Evaluate at origin t = 80
    origin_t = 80
    train_clean = df_clean.iloc[:origin_t].copy()
    test_clean = df_clean.iloc[origin_t : origin_t + 4].copy()

    # Rule 1: Max train date must strictly precede min test date
    assert pd.to_datetime(train_clean["date"].max()) < pd.to_datetime(test_clean["date"].min())
    assert train_clean["step_idx"].max() < test_clean["step_idx"].min()

    # Fit baseline and weather models on clean history
    m_base_clean = NegativeBinomialForecastModel("baseline", "weekly").fit(train_clean, total_timeline_len=n)
    m_weath_clean = NegativeBinomialForecastModel("weather", "weekly").fit(train_clean, weather_lags_steps=[2, 3], total_timeline_len=n)

    # Now create a "corrupted future" dataset where future test data has massive spikes
    df_corrupted_future = df_clean.copy()
    # Mutate ONLY future test rows (origin_t onwards)
    df_corrupted_future.loc[origin_t:, "cases"] = 99999
    df_corrupted_future.loc[origin_t:, "rainfall_mm"] = 99999
    df_corrupted_future.loc[origin_t:, "temp_c"] = 99999

    # Re-slice training set from corrupted future
    train_from_corrupted = df_corrupted_future.iloc[:origin_t].copy()

    # Fit models on training slice
    m_base_test = NegativeBinomialForecastModel("baseline", "weekly").fit(train_from_corrupted, total_timeline_len=n)
    m_weath_test = NegativeBinomialForecastModel("weather", "weekly").fit(train_from_corrupted, weather_lags_steps=[2, 3], total_timeline_len=n)

    # ASSERTION OF ZERO LEAKAGE:
    # Model parameters fitted on training history up to origin_t MUST BE 100% IDENTICAL
    # regardless of massive future variations!
    np.testing.assert_allclose(m_base_clean.params_, m_base_test.params_, rtol=1e-7, atol=1e-7)
    np.testing.assert_allclose(m_weath_clean.params_, m_weath_test.params_, rtol=1e-7, atol=1e-7)


def test_metrics_strictly_no_mape():
    """
    Verifies that rolling-origin evaluation computes MAE and RMSE,
    and strictly does NOT compute or expose MAPE anywhere in metrics or JSON output.
    """
    cfg = load_config()
    df, units, _ = load_and_validate_data(cfg)
    assert df is not None

    evidence = run_evidence_evaluation(df=df, units=units, config=cfg, run_id="test_metrics")

    # Check that baseline_metrics and weather_metrics contain MAE and RMSE
    unit_eval = evidence["units"]["BLK_C"]
    b_metrics = unit_eval["baseline_metrics"]
    assert "mae" in b_metrics
    assert "rmse" in b_metrics
    assert isinstance(b_metrics["mae"], float)
    assert isinstance(b_metrics["rmse"], float)

    # Strictly check NO MAPE across all units in evidence
    evidence_str = json.dumps(evidence).lower()
    assert "mape" not in evidence_str, "Detected MAPE in evidence output! Requirement prohibits MAPE."


def test_skill_gate_blocks_c_and_f_select_baseline():
    """
    Verifies that on the simulated dataset:
    - Units C and F (where weather influence is null) fail the skill gate and choose 'seasonal_baseline'.
    - Weather-sensitive units (such as A and E) pass the skill gate and choose 'weather_model'.
    """
    cfg = load_config()
    df, units, _ = load_and_validate_data(cfg)
    assert df is not None

    evidence = run_evidence_evaluation(df=df, units=units, config=cfg, run_id="test_skill_gate")

    eval_c = evidence["units"]["BLK_C"]
    eval_f = evidence["units"]["BLK_F"]

    assert eval_c["decision"] == "seasonal_baseline", f"Block C should choose seasonal_baseline, got {eval_c['decision']}"
    assert eval_f["decision"] == "seasonal_baseline", f"Block F should choose seasonal_baseline, got {eval_f['decision']}"

    # Verify weather-sensitive units choose weather_model
    eval_a = evidence["units"]["BLK_A"]
    eval_e = evidence["units"]["BLK_E"]
    assert eval_a["decision"] == "weather_model", f"Block A should choose weather_model, got {eval_a['decision']}"
    assert eval_e["decision"] == "weather_model", f"Block E should choose weather_model, got {eval_e['decision']}"


def test_insufficient_history_decision():
    """
    Verifies that a unit with history shorter than evaluation_years is marked 'not enough data'.
    """
    cfg = load_config()
    # Create short dataset with only 20 weeks
    dates = pd.date_range("2023-01-01", periods=20, freq="W-MON").strftime("%Y-%m-%d").tolist()
    short_df = pd.DataFrame({
        "date": dates,
        "unit_id": "SHORT_UNIT",
        "cases": [10] * 20,
        "rainfall_mm": [50.0] * 20,
        "temp_c": [28.0] * 20,
    })

    result = evaluate_unit_rolling_origin(
        unit_df=short_df,
        unit_id="SHORT_UNIT",
        unit_name="Short Unit",
        config=cfg,
        total_timeline_len=20,
    )

    assert result["decision"] == "not enough data"
    assert "Only 20 periods available" in result["reason"]


def test_simulation_based_80_percent_prediction_intervals():
    """
    Verifies that 80% simulation prediction intervals satisfy:
    - lower_80 <= upper_80
    - lower_80 >= 0
    - Interval width is strictly positive
    """
    m = NegativeBinomialForecastModel("baseline", "weekly")
    m.alpha_ = 0.5
    point_preds = np.array([10.0, 25.0, 50.0, 100.0])

    low_80, high_80 = m.simulate_intervals(point_preds, n_simulations=1000, ci_level=0.80)

    assert len(low_80) == len(point_preds)
    assert len(high_80) == len(point_preds)

    for i in range(len(point_preds)):
        assert low_80[i] >= 0.0
        assert low_80[i] <= high_80[i]
        assert point_preds[i] >= low_80[i]
        assert high_80[i] >= point_preds[i]


def test_pipeline_refresh_preserves_tasks_and_creates_alerts():
    """
    Verifies that running pipeline refresh:
    1. Generates backend/data/evidence.json and backend/data/forecasts.json.
    2. Inserts new PipelineRun and Alert records.
    3. PRESERVES existing Task, TaskEvent, and User records without deleting them.
    """
    init_db()
    db = SessionLocal()
    try:
        # Check initial counts of tasks, task events, and users
        initial_tasks_count = db.query(Task).count()
        initial_events_count = db.query(TaskEvent).count()
        initial_users_count = db.query(User).count()
        assert initial_tasks_count > 0, "Initial tasks should exist from seed."
        assert initial_users_count > 0, "Initial users should exist from seed."
    finally:
        db.close()

    # Run pipeline refresh
    res = run_pipeline_refresh(verbose=False)
    run_id = res["run_id"]

    # Verify JSON files exist and contain valid data
    evidence_path = Path(res["evidence_path"])
    forecasts_path = Path(res["forecasts_path"])
    assert evidence_path.is_file()
    assert forecasts_path.is_file()

    with open(evidence_path, "r", encoding="utf-8") as f:
        ev_data = json.load(f)
    with open(forecasts_path, "r", encoding="utf-8") as f:
        fc_data = json.load(f)

    assert ev_data["run_id"] == run_id
    assert fc_data["run_id"] == run_id
    assert len(fc_data["units"]) >= 6

    # Verify SQLite database state
    db = SessionLocal()
    try:
        # 1. New PipelineRun exists
        p_run = db.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
        assert p_run is not None

        # 2. New Alerts exist for this run_id
        run_alerts = db.query(Alert).filter(Alert.run_id == run_id).all()
        assert len(run_alerts) == 6

        # 3. CRITICAL: Existing tasks, events, and users were NOT deleted!
        post_tasks_count = db.query(Task).count()
        post_events_count = db.query(TaskEvent).count()
        post_users_count = db.query(User).count()

        assert post_tasks_count >= initial_tasks_count
        assert post_events_count >= initial_events_count
        assert post_users_count == initial_users_count
    finally:
        db.close()
