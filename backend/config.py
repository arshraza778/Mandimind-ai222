import os
from pathlib import Path
from typing import List, Optional, Literal, Dict, Any
import yaml
from pydantic import BaseModel, Field, ValidationError


class SkillGateConfig(BaseModel):
    min_win_share: float = Field(..., ge=0.0, le=1.0, description="Minimum win share required (0.0 to 1.0)")
    min_median_improvement: float = Field(..., description="Minimum median improvement required")


class ReactiveRuleConfig(BaseModel):
    history_years: int = Field(..., gt=0, description="Years of history for reactive threshold")
    sd_multiplier: float = Field(..., gt=0, description="Standard deviation multiplier")


class AppConfig(BaseModel):
    data_source: str = Field(..., min_length=1, description="Data source type (e.g. simulated, real)")
    cases_file: str = Field(..., min_length=1, description="Path to cases CSV file")
    weather_file: str = Field(..., min_length=1, description="Path to weather CSV file")
    unit_map_file: str = Field(..., min_length=1, description="Path to unit mapping file")
    granularity: Literal["weekly", "monthly"] = Field(..., description="Time granularity: 'weekly' or 'monthly'")
    geography_level: Literal["block", "district"] = Field(..., description="Geography level: 'block' or 'district'")
    horizon_steps: List[int] = Field(..., min_length=1, description="Forecast horizon steps")
    weather_lags_steps: List[int] = Field(..., min_length=1, description="Weather lag steps")
    skill_gate: SkillGateConfig
    evaluation_years: int = Field(..., gt=0, description="Evaluation window in years")
    reactive_rule: ReactiveRuleConfig
    escalation_hours: int = Field(..., gt=0, description="Hours before unreplied task escalates")
    interpolate_weather: bool = Field(default=False, description="Allow linear interpolation for weather gaps")

    @property
    def unit_label(self) -> str:
        """Unit label corresponding to granularity ('weeks' or 'months')."""
        if self.granularity == "weekly":
            return "weeks"
        elif self.granularity == "monthly":
            return "months"
        return self.granularity

    @property
    def geography_label(self) -> str:
        """Geography label ('block' or 'district')."""
        return self.geography_level

    @property
    def banner_text(self) -> str:
        """Banner text adhering to honesty rules."""
        if self.data_source.strip().lower() == "simulated":
            return "PROTOTYPE - SIMULATED DATA - sample names only"
        return f"PROTOTYPE - {self.data_source.upper()} DATA"


class ConfigError(ValueError):
    """Clear error raised when configuration loading or validation fails."""
    pass


def load_config(config_path: Optional[Path | str] = None) -> AppConfig:
    """
    Load and validate backend/config.yaml using Pydantic.
    Fails with a clear, readable message if the file is missing, invalid YAML, or contains schema errors.
    """
    if config_path is None:
        # Default to backend/config.yaml relative to backend folder or workspace root
        base_dir = Path(__file__).resolve().parent
        config_path = base_dir / "config.yaml"
        if not config_path.exists():
            config_path = base_dir.parent / "config.yaml"

    path = Path(config_path)
    if not path.is_file():
        raise ConfigError(f"Configuration file not found at: {path.resolve()}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            raw_data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise ConfigError(f"Failed to parse YAML configuration in {path}: {e}") from e

    if not isinstance(raw_data, dict):
        raise ConfigError(f"Invalid YAML structure in {path}: Expected a top-level dictionary/mapping, got {type(raw_data).__name__}.")

    try:
        return AppConfig(**raw_data)
    except ValidationError as err:
        error_lines = []
        for e in err.errors():
            loc = " -> ".join(str(p) for p in e.get("loc", []))
            msg = e.get("msg", "invalid")
            received = e.get("input")
            error_lines.append(f"  - Key '{loc}': {msg} (received: {received!r})")
        
        formatted_errors = "\n".join(error_lines)
        raise ConfigError(
            f"Configuration validation failed for '{path.name}':\n{formatted_errors}"
        ) from err
