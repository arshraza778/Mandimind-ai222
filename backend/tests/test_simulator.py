import json
from pathlib import Path
import pytest
from sim.generate import generate_simulated_dataset
from config import AppConfig, SkillGateConfig, ReactiveRuleConfig
from data.load import load_and_validate_data


def test_generate_weekly_simulation(tmp_path):
    summary = generate_simulated_dataset(granularity="weekly", output_dir=tmp_path, seed=42)
    assert summary["granularity"] == "weekly"
    assert summary["unit_count"] == 6
    assert summary["rows_per_unit"] == 312
    assert summary["total_cases_rows"] == 1872

    # Check files exist
    assert (tmp_path / "cases.csv").is_file()
    assert (tmp_path / "weather.csv").is_file()
    assert (tmp_path / "unit_map.csv").is_file()
    assert (tmp_path / "sim_truth.json").is_file()

    # Check sim_truth.json
    truth = json.loads((tmp_path / "sim_truth.json").read_text(encoding="utf-8"))
    assert "SIMULATED" in truth["header_note"]
    assert truth["units"]["BLK_A"]["weather_sensitive"] is True
    assert truth["units"]["BLK_B"]["weather_sensitive"] is True
    assert truth["units"]["BLK_C"]["weather_sensitive"] is False
    assert truth["units"]["BLK_D"]["weather_sensitive"] is True
    assert truth["units"]["BLK_E"]["weather_sensitive"] is True
    assert truth["units"]["BLK_F"]["weather_sensitive"] is False

    # Validate with loader
    config = AppConfig(
        data_source="simulated",
        cases_file=str(tmp_path / "cases.csv"),
        weather_file=str(tmp_path / "weather.csv"),
        unit_map_file=str(tmp_path / "unit_map.csv"),
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

    df, units, report = load_and_validate_data(config=config, raise_on_error=True)
    assert report["is_valid"] is True
    assert len(report["errors"]) == 0
    assert len(units) == 6
    assert len(df) == 1872


def test_generate_monthly_simulation(tmp_path):
    summary = generate_simulated_dataset(granularity="monthly", output_dir=tmp_path, seed=42)
    assert summary["granularity"] == "monthly"
    assert summary["unit_count"] == 6
    assert summary["rows_per_unit"] == 72
    assert summary["total_cases_rows"] == 432

    config = AppConfig(
        data_source="simulated",
        cases_file=str(tmp_path / "cases.csv"),
        weather_file=str(tmp_path / "weather.csv"),
        unit_map_file=str(tmp_path / "unit_map.csv"),
        granularity="monthly",
        geography_level="block",
        horizon_steps=[1, 2],
        weather_lags_steps=[1, 2],
        skill_gate=SkillGateConfig(min_win_share=0.6, min_median_improvement=0.05),
        evaluation_years=2,
        reactive_rule=ReactiveRuleConfig(history_years=5, sd_multiplier=2.0),
        escalation_hours=48,
        interpolate_weather=False
    )

    df, units, report = load_and_validate_data(config=config, raise_on_error=True)
    assert report["is_valid"] is True
    assert len(report["errors"]) == 0
    assert len(units) == 6
    assert len(df) == 432
