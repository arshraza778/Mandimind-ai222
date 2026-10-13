import pytest
from pathlib import Path
from config import load_config, ConfigError, AppConfig


def test_load_default_config():
    cfg = load_config()
    assert isinstance(cfg, AppConfig)
    assert cfg.data_source == "simulated"
    assert cfg.granularity == "weekly"
    assert cfg.unit_label == "weeks"
    assert cfg.geography_label == "block"
    assert cfg.banner_text == "PROTOTYPE - SIMULATED DATA - sample names only"


def test_monthly_granularity_and_district_geography(tmp_path):
    custom_yaml = tmp_path / "custom_config.yaml"
    custom_yaml.write_text("""
data_source: real
cases_file: data/cases.csv
weather_file: data/weather.csv
unit_map_file: data/unit_map.csv
granularity: monthly
geography_level: district
horizon_steps: [1, 2]
weather_lags_steps: [1, 2]
skill_gate:
  min_win_share: 0.55
  min_median_improvement: 0.02
evaluation_years: 1
reactive_rule:
  history_years: 3
  sd_multiplier: 1.5
escalation_hours: 24
""", encoding="utf-8")

    cfg = load_config(custom_yaml)
    assert cfg.data_source == "real"
    assert cfg.granularity == "monthly"
    assert cfg.unit_label == "months"
    assert cfg.geography_label == "district"
    assert cfg.banner_text == "PROTOTYPE - REAL DATA"


def test_invalid_granularity_fails_clearly(tmp_path):
    invalid_yaml = tmp_path / "invalid_config.yaml"
    invalid_yaml.write_text("""
data_source: simulated
cases_file: data/cases.csv
weather_file: data/weather.csv
unit_map_file: data/unit_map.csv
granularity: minutely
geography_level: block
horizon_steps: [2, 4]
weather_lags_steps: [2, 3]
skill_gate:
  min_win_share: 0.60
  min_median_improvement: 0.05
evaluation_years: 2
reactive_rule:
  history_years: 5
  sd_multiplier: 2
escalation_hours: 48
""", encoding="utf-8")

    with pytest.raises(ConfigError) as exc_info:
        load_config(invalid_yaml)

    err_msg = str(exc_info.value)
    assert "granularity" in err_msg
    assert "Configuration validation failed" in err_msg


def test_missing_file_fails_clearly(tmp_path):
    missing_file = tmp_path / "non_existent.yaml"
    with pytest.raises(ConfigError) as exc_info:
        load_config(missing_file)

    assert "Configuration file not found" in str(exc_info.value)
