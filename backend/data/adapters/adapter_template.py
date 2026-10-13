"""
Data Adapter Template

This template demonstrates how to ingest messy raw files (e.g. HMIS/IHIP surveillance 
tables, ERA5 or CHIRPS precipitation grids) and transform them into the three 
strict contract files expected by Mitanin Signal:
  1. cases.csv (date, unit_id, cases, ...)
  2. weather.csv (date, unit_id, rainfall_mm, ...)
  3. unit_map.csv (unit_id, unit_name, level, ...)

Remember: Adapters are the ONLY code allowed to know about raw vendor formats.
"""

from pathlib import Path
from typing import Optional
import pandas as pd


def adapt_hmis_cases(raw_hmis_path: Path, output_cases_path: Path) -> pd.DataFrame:
    """
    Example converter: Translates raw HMIS monthly surveillance export
    into canonical cases.csv contract format.
    """
    raw_df = pd.read_csv(raw_hmis_path)

    # Example: raw file might have columns 'ReportingMonth', 'FacilityBlockCode', 'MalariaTotalPositive'
    # 1. Parse date to ISO period start (YYYY-MM-DD)
    raw_df["date"] = pd.to_datetime(raw_df["ReportingMonth"]).dt.strftime("%Y-%m-01")

    # 2. Standardize unit identifier
    raw_df["unit_id"] = raw_df["FacilityBlockCode"].astype(str).str.strip()

    # 3. Cast cases to non-negative integer
    raw_df["cases"] = pd.to_numeric(raw_df["MalariaTotalPositive"], errors="coerce").fillna(0).astype(int)

    # 4. Filter only contract columns
    contract_cols = ["date", "unit_id", "cases"]
    if "TestsConducted" in raw_df.columns:
        raw_df["tests_done"] = pd.to_numeric(raw_df["TestsConducted"], errors="coerce").fillna(0).astype(int)
        contract_cols.append("tests_done")
    if "PfCount" in raw_df.columns:
        raw_df["pf_cases"] = pd.to_numeric(raw_df["PfCount"], errors="coerce").fillna(0).astype(int)
        contract_cols.append("pf_cases")

    cases_df = raw_df[contract_cols].sort_values(["unit_id", "date"]).reset_index(drop=True)

    output_cases_path.parent.mkdir(parents=True, exist_ok=True)
    cases_df.to_csv(output_cases_path, index=False)
    print(f"[Adapter] Wrote {len(cases_df)} cases records to {output_cases_path}")
    return cases_df


def adapt_era5_weather(raw_weather_path: Path, output_weather_path: Path) -> pd.DataFrame:
    """
    Example converter: Translates raw ERA5 / CHIRPS rainfall extraction
    into canonical weather.csv contract format.
    """
    raw_df = pd.read_csv(raw_weather_path)

    # Example: raw columns 'time', 'block_id', 'total_precipitation_mm', 't2m_celsius'
    raw_df["date"] = pd.to_datetime(raw_df["time"]).dt.strftime("%Y-%m-%d")
    raw_df["unit_id"] = raw_df["block_id"].astype(str).str.strip()
    raw_df["rainfall_mm"] = pd.to_numeric(raw_df["total_precipitation_mm"], errors="coerce").clip(lower=0.0)

    contract_cols = ["date", "unit_id", "rainfall_mm"]
    if "t2m_celsius" in raw_df.columns:
        raw_df["temp_c"] = pd.to_numeric(raw_df["t2m_celsius"], errors="coerce")
        contract_cols.append("temp_c")

    weather_df = raw_df[contract_cols].sort_values(["unit_id", "date"]).reset_index(drop=True)

    output_weather_path.parent.mkdir(parents=True, exist_ok=True)
    weather_df.to_csv(output_weather_path, index=False)
    print(f"[Adapter] Wrote {len(weather_df)} weather records to {output_weather_path}")
    return weather_df


def main():
    print("This is an adapter template. Customize function mappings for your raw provider.")


if __name__ == "__main__":
    main()
