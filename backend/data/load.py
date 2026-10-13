"""
Mitanin Signal Data Loader and Quality Validation Module
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import numpy as np
import pandas as pd

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import load_config, AppConfig

logger = logging.getLogger("mitanin_signal.data_loader")


class DataValidationError(ValueError):
    """Raised when critical contract errors block loading."""
    pass


def resolve_file_path(path_str: str) -> Path:
    """Resolve a configured file path against current working directory and backend directory."""
    raw_path = Path(path_str)
    if raw_path.is_file():
        return raw_path.resolve()

    backend_dir = Path(__file__).resolve().parent.parent
    candidate_backend = backend_dir / path_str
    if candidate_backend.is_file():
        return candidate_backend.resolve()

    workspace_root = backend_dir.parent
    candidate_root = workspace_root / path_str
    if candidate_root.is_file():
        return candidate_root.resolve()

    raise FileNotFoundError(f"Configured data file not found: {path_str}")


def validate_dates_and_granularity(
    df: pd.DataFrame, 
    source_name: str, 
    granularity: str,
    errors: List[str],
    warnings: List[str]
) -> pd.DataFrame:
    """Validates date format and granularity spacing."""
    if "date" not in df.columns or "unit_id" not in df.columns:
        return df

    # Check for unparseable dates
    parsed_dates = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
    bad_mask = parsed_dates.isna() & df["date"].notna()
    if bad_mask.any():
        bad_examples = df.loc[bad_mask, "date"].head(5).tolist()
        errors.append(f"[{source_name}] Unparseable date values found (expected YYYY-MM-DD): {bad_examples}")
        return df

    df = df.copy()
    df["dt"] = parsed_dates

    # Check granularity per unit
    for unit_id, group in df.groupby("unit_id"):
        sorted_dates = group["dt"].sort_values().drop_duplicates()
        if len(sorted_dates) < 2:
            continue

        diffs = (sorted_dates.diff().dropna().dt.days).tolist()
        if granularity == "weekly":
            # Granularity mismatch if steps are not multiples of 7 (e.g. 1 day, 2 days, 10 days)
            non_weekly = [d for d in diffs if d % 7 != 0]
            if non_weekly:
                errors.append(
                    f"[{source_name}] Granularity mismatch in unit '{unit_id}': expected weekly (7-day intervals), found step(s) of {non_weekly[:3]} days."
                )
                break
            
            # Gaps warning if any step is > 7 days
            gaps = [d for d in diffs if d > 7]
            if gaps:
                warnings.append(
                    f"[{source_name}] Date sequence gap in unit '{unit_id}': {len(gaps)} interval(s) > 7 days (e.g. {gaps[:2]} days)."
                )
        elif granularity == "monthly":
            # Granularity mismatch if steps are < 28 days
            too_short = [d for d in diffs if d < 28]
            if too_short:
                errors.append(
                    f"[{source_name}] Granularity mismatch in unit '{unit_id}': expected monthly (~30-day intervals), found step(s) of {too_short[:3]} days."
                )
                break

    return df


def load_and_validate_data(
    config: Optional[AppConfig] = None,
    raise_on_error: bool = False
) -> Tuple[Optional[pd.DataFrame], List[Dict[str, Any]], Dict[str, Any]]:
    """
    Reads contract files named in config, validates contract rules,
    computes quality report, and returns:
      - joined tidy DataFrame (None if errors present)
      - list of unit dictionaries
      - quality report dictionary
    """
    if config is None:
        config = load_config()

    errors: List[str] = []
    warnings: List[str] = []
    report: Dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data_source": config.data_source,
        "granularity": config.granularity,
        "geography_level": config.geography_level,
        "is_valid": False,
        "unit_count": 0,
        "date_range": None,
        "total_records": 0,
        "errors": errors,
        "warnings": warnings,
        "weather_interpolated_count": 0,
        "missing_cases_count": 0,
    }

    # 1. Resolve files
    try:
        unit_map_path = resolve_file_path(config.unit_map_file)
        cases_path = resolve_file_path(config.cases_file)
        weather_path = resolve_file_path(config.weather_file)
    except FileNotFoundError as e:
        errors.append(str(e))
        report["is_valid"] = False
        _save_and_print_report(report)
        if raise_on_error:
            raise DataValidationError(str(e))
        return None, [], report

    # 2. Load Unit Map
    try:
        unit_map_df = pd.read_csv(unit_map_path)
    except Exception as e:
        errors.append(f"Failed to read unit map file {unit_map_path}: {e}")
        unit_map_df = pd.DataFrame()

    required_unit_cols = ["unit_id", "unit_name", "level"]
    missing_unit_cols = [c for c in required_unit_cols if c not in unit_map_df.columns]
    if missing_unit_cols:
        errors.append(f"Unit map is missing required columns: {missing_unit_cols}")

    if not unit_map_df.empty and "unit_id" in unit_map_df.columns:
        if unit_map_df["unit_id"].duplicated().any():
            dups = unit_map_df.loc[unit_map_df["unit_id"].duplicated(), "unit_id"].tolist()
            errors.append(f"Duplicate unit_id values in unit map: {dups}")
        valid_unit_ids = set(unit_map_df["unit_id"].dropna().astype(str).str.strip())
    else:
        valid_unit_ids = set()

    # Filter unit map by geography level
    if "level" in unit_map_df.columns:
        filtered_units = unit_map_df[unit_map_df["level"] == config.geography_level].copy()
    else:
        filtered_units = unit_map_df.copy()
    unit_list = filtered_units.to_dict(orient="records")
    report["unit_count"] = len(unit_list)

    # 3. Load Cases File
    try:
        cases_df = pd.read_csv(cases_path)
    except Exception as e:
        errors.append(f"Failed to read cases file {cases_path}: {e}")
        cases_df = pd.DataFrame()

    required_cases_cols = ["date", "unit_id", "cases"]
    missing_cases_cols = [c for c in required_cases_cols if c not in cases_df.columns]
    if missing_cases_cols:
        errors.append(f"Cases file is missing required columns: {missing_cases_cols}")

    # 4. Load Weather File
    try:
        weather_df = pd.read_csv(weather_path)
    except Exception as e:
        errors.append(f"Failed to read weather file {weather_path}: {e}")
        weather_df = pd.DataFrame()

    required_weather_cols = ["date", "unit_id", "rainfall_mm"]
    missing_weather_cols = [c for c in required_weather_cols if c not in weather_df.columns]
    if missing_weather_cols:
        errors.append(f"Weather file is missing required columns: {missing_weather_cols}")

    # If schema validation failed, abort before value checks
    if errors:
        report["is_valid"] = False
        _save_and_print_report(report)
        if raise_on_error:
            raise DataValidationError("\n".join(errors))
        return None, unit_list, report

    # 5. Check unknown unit_ids
    cases_unit_ids = set(cases_df["unit_id"].astype(str).str.strip())
    unknown_case_units = cases_unit_ids - valid_unit_ids
    if unknown_case_units:
        errors.append(f"Cases file contains unknown unit_id(s) not in unit map: {sorted(list(unknown_case_units))[:10]}")

    weather_unit_ids = set(weather_df["unit_id"].astype(str).str.strip())
    unknown_weather_units = weather_unit_ids - valid_unit_ids
    if unknown_weather_units:
        errors.append(f"Weather file contains unknown unit_id(s) not in unit map: {sorted(list(unknown_weather_units))[:10]}")

    # 6. Check duplicates in (date, unit_id)
    if cases_df.duplicated(subset=["date", "unit_id"]).any():
        dup_cases = cases_df[cases_df.duplicated(subset=["date", "unit_id"])][["date", "unit_id"]].head(5).to_dict("records")
        errors.append(f"Duplicate (date, unit_id) pairs in cases file: {dup_cases}")

    if weather_df.duplicated(subset=["date", "unit_id"]).any():
        dup_weather = weather_df[weather_df.duplicated(subset=["date", "unit_id"])][["date", "unit_id"]].head(5).to_dict("records")
        errors.append(f"Duplicate (date, unit_id) pairs in weather file: {dup_weather}")

    # 7. Check cases value validity (negative or non-integer)
    raw_cases_series = cases_df["cases"]
    numeric_cases = pd.to_numeric(raw_cases_series, errors="coerce")
    if numeric_cases.isna().any():
        non_num_count = int(numeric_cases.isna().sum())
        errors.append(f"Non-numeric values found in cases column ({non_num_count} rows).")
    else:
        if (numeric_cases < 0).any():
            neg_count = int((numeric_cases < 0).sum())
            errors.append(f"Negative case counts detected ({neg_count} rows). Cases must be >= 0.")
        if (numeric_cases % 1 != 0).any():
            non_int_count = int((numeric_cases % 1 != 0).sum())
            errors.append(f"Non-integer values detected in cases column ({non_int_count} rows). Cases must be whole integers.")

    # 8. Date and Granularity validation
    validate_dates_and_granularity(cases_df, "Cases", config.granularity, errors, warnings)
    validate_dates_and_granularity(weather_df, "Weather", config.granularity, errors, warnings)

    # Stop here if any errors were detected
    if errors:
        report["is_valid"] = False
        _save_and_print_report(report)
        if raise_on_error:
            raise DataValidationError("\n".join(errors))
        return None, unit_list, report

    # 9. Perform Join (date, unit_id)
    cases_df["date"] = cases_df["date"].astype(str)
    cases_df["unit_id"] = cases_df["unit_id"].astype(str)
    weather_df["date"] = weather_df["date"].astype(str)
    weather_df["unit_id"] = weather_df["unit_id"].astype(str)

    joined_df = pd.merge(cases_df, weather_df, on=["date", "unit_id"], how="outer")

    # Filter to current geography level units if applicable
    if valid_unit_ids:
        active_ids = {u["unit_id"] for u in unit_list}
        joined_df = joined_df[joined_df["unit_id"].isin(active_ids)].copy()

    # Sort deterministically
    joined_df = joined_df.sort_values(["unit_id", "date"]).reset_index(drop=True)

    # 10. Check Missing Cases (Honesty rule: Never fill silently)
    missing_cases = int(joined_df["cases"].isna().sum())
    report["missing_cases_count"] = missing_cases
    if missing_cases > 0:
        warnings.append(f"{missing_cases} missing case value(s) in joined timeline. Retained as missing (never filled).")

    # 11. Weather Gaps & Interpolation Policy
    missing_weather = int(joined_df["rainfall_mm"].isna().sum())
    if missing_weather > 0:
        if config.interpolate_weather:
            # Interpolate linearly per unit
            joined_df["rainfall_mm"] = joined_df.groupby("unit_id")["rainfall_mm"].transform(
                lambda s: s.interpolate(method="linear", limit_direction="both")
            )
            now_missing = int(joined_df["rainfall_mm"].isna().sum())
            filled_count = missing_weather - now_missing
            report["weather_interpolated_count"] = filled_count
            warnings.append(
                f"Interpolated {filled_count} missing weather values per config policy (interpolate_weather=true)."
            )
        else:
            warnings.append(
                f"{missing_weather} missing weather value(s) detected. Kept as missing (interpolate_weather is disabled)."
            )

    # 12. Evaluate Outliers, Long runs of zeros, and History length
    min_required_periods = (config.evaluation_years * 52) if config.granularity == "weekly" else (config.evaluation_years * 12)

    for unit_id, group in joined_df.groupby("unit_id"):
        n_periods = len(group)
        if n_periods < min_required_periods:
            warnings.append(
                f"Unit '{unit_id}' has only {n_periods} periods (requires {min_required_periods} for {config.evaluation_years}-year evaluation)."
            )

        valid_cases = group["cases"].dropna()
        if not valid_cases.empty:
            # Outlier check
            u_mean = valid_cases.mean()
            u_std = valid_cases.std()
            if u_std > 0:
                high_thresh = u_mean + (5 * u_std)
                outliers = group[group["cases"] > high_thresh]
                for _, row in outliers.iterrows():
                    if row["cases"] > 10:
                        warnings.append(
                            f"Extreme outlier in unit '{unit_id}' on {row['date']}: {int(row['cases'])} cases (mean={u_mean:.1f}, std={u_std:.1f})."
                        )

            # Long runs of zeros
            is_zero = (valid_cases == 0).astype(int)
            runs = is_zero.groupby((is_zero != is_zero.shift()).cumsum()).cumsum()
            max_zeros = int(runs.max()) if not runs.empty else 0
            if max_zeros >= 8:
                warnings.append(
                    f"Unit '{unit_id}' has long run of zeros ({max_zeros} consecutive periods with 0 cases)."
                )

    # 13. Reporting flag disruption warnings
    if "reporting_flag" in joined_df.columns:
        disrupted = (joined_df["reporting_flag"] == 0).sum()
        if disrupted > 0:
            warnings.append(f"{int(disrupted)} period(s) marked with reporting_flag == 0 (reporting disruption).")

    # 14. Finalize Report
    report["is_valid"] = True
    report["total_records"] = len(joined_df)
    if not joined_df.empty:
        report["date_range"] = {
            "start": str(joined_df["date"].min()),
            "end": str(joined_df["date"].max())
        }

    _save_and_print_report(report)
    return joined_df, unit_list, report


def _save_and_print_report(report: Dict[str, Any]):
    """Saves report to backend/data/quality_report.json and prints summary."""
    backend_dir = Path(__file__).resolve().parent.parent
    report_file = backend_dir / "data" / "quality_report.json"
    try:
        report_file.parent.mkdir(parents=True, exist_ok=True)
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    except Exception as e:
        logger.warning(f"Could not write quality report to {report_file}: {e}")

    # Clean readable print
    status_str = "VALID" if report.get("is_valid") else "INVALID"
    print(f"\n================ DATA QUALITY REPORT [{status_str}] ================")
    print(f"Source: {report.get('data_source')} | Units: {report.get('unit_count')} | Records: {report.get('total_records')}")
    if report.get("date_range"):
        print(f"Date Range: {report['date_range']['start']} to {report['date_range']['end']}")
    
    if report.get("errors"):
        print(f"\nERRORS ({len(report['errors'])}):")
        for err in report["errors"]:
            print(f"  [ERROR] {err}")
    
    if report.get("warnings"):
        print(f"\nWARNINGS ({len(report['warnings'])}):")
        for warn in report["warnings"][:10]:
            print(f"  [WARN] {warn}")
        if len(report["warnings"]) > 10:
            print(f"  ... and {len(report['warnings']) - 10} more warning(s)")
    print("=================================================================\n")


def generate_csv_template_string() -> str:
    """
    Returns a downloadable CSV template with the documented surveillance + weather schema.
    """
    lines = [
        "week_start,district,block,reported_cases,population,rainfall_mm,temperature_c,relative_humidity_pct,reporting_completeness",
        "2025-07-07,Sample District,Sample Block A,18,125000,142.5,29.4,81.0,0.96",
        "2025-07-14,Sample District,Sample Block A,24,125000,168.0,28.8,84.5,0.94",
        "2025-07-21,Sample District,Sample Block A,,125000,115.2,30.1,79.0,0.65",
        "2025-07-07,Sample District,Sample Block B,11,,98.4,30.5,76.0,0.92",
    ]
    return "\n".join(lines) + "\n"


def validate_uploaded_surveillance_csv(csv_text: str, filename: str = "uploaded.csv") -> Dict[str, Any]:
    """
    Validates an uploaded CSV string against the surveillance + weather data contract:
      - Required columns (or aliases):
          * week_start (or date)
          * district (optional if unit_id provided, required in standard template)
          * block (or unit_id)
          * reported_cases (or cases)
          * rainfall_mm
          * temperature_c (or temp_c)
      - Optional columns:
          * population
          * relative_humidity_pct
          * reporting_completeness
      - Safeguards:
          * NEVER silently converts missing case counts into zero (preserves NaN and reports missing_cases_count).
          * NEVER calculates incidence without a valid (> 0) population denominator.
    """
    import io

    errors: List[str] = []
    warnings: List[str] = []

    if not csv_text or not csv_text.strip():
        return {
            "filename": filename,
            "is_valid": False,
            "total_rows": 0,
            "missing_cases_count": 0,
            "missing_cases_preserved_as_null": True,
            "incidence_calculated_rows": 0,
            "incidence_skipped_missing_population_rows": 0,
            "errors": ["Uploaded CSV file is empty."],
            "warnings": [],
            "preview_rows": [],
        }

    try:
        df = pd.read_csv(io.StringIO(csv_text.strip()), keep_default_na=True)
    except Exception as exc:
        return {
            "filename": filename,
            "is_valid": False,
            "total_rows": 0,
            "missing_cases_count": 0,
            "missing_cases_preserved_as_null": True,
            "incidence_calculated_rows": 0,
            "incidence_skipped_missing_population_rows": 0,
            "errors": [f"Could not parse CSV syntax: {exc}"],
            "warnings": [],
            "preview_rows": [],
        }

    cols = [str(c).strip() for c in df.columns]
    df.columns = cols

    date_col = "week_start" if "week_start" in cols else ("date" if "date" in cols else None)
    block_col = "block" if "block" in cols else ("unit_id" if "unit_id" in cols else None)
    cases_col = "reported_cases" if "reported_cases" in cols else ("cases" if "cases" in cols else None)
    rain_col = "rainfall_mm" if "rainfall_mm" in cols else None
    temp_col = "temperature_c" if "temperature_c" in cols else ("temp_c" if "temp_c" in cols else None)

    missing_required = []
    if not date_col:
        missing_required.append("week_start (or date)")
    if "district" not in cols and "unit_id" not in cols:
        missing_required.append("district")
    if not block_col:
        missing_required.append("block (or unit_id)")
    if not cases_col:
        missing_required.append("reported_cases (or cases)")
    if not rain_col:
        missing_required.append("rainfall_mm")
    if not temp_col:
        missing_required.append("temperature_c (or temp_c)")

    if missing_required:
        errors.append(
            f"Missing required column(s): {', '.join(missing_required)}. "
            "Download the CSV template for the exact schema."
        )
        return {
            "filename": filename,
            "is_valid": False,
            "total_rows": len(df),
            "missing_cases_count": 0,
            "missing_cases_preserved_as_null": True,
            "incidence_calculated_rows": 0,
            "incidence_skipped_missing_population_rows": 0,
            "errors": errors,
            "warnings": warnings,
            "preview_rows": [],
        }

    # 1. Validate dates
    parsed_dates = pd.to_datetime(df[date_col], format="%Y-%m-%d", errors="coerce")
    bad_dates = parsed_dates.isna()
    if bad_dates.any():
        bad_vals = df.loc[bad_dates, date_col].head(3).tolist()
        errors.append(f"Invalid date format in '{date_col}' (expected YYYY-MM-DD); examples: {bad_vals}")

    # 2. Validate reported_cases without silently converting missing values to zero
    raw_cases = df[cases_col]
    missing_mask = raw_cases.isna() | (raw_cases.astype(str).str.strip() == "")
    missing_cases_count = int(missing_mask.sum())
    if missing_cases_count > 0:
        warnings.append(
            f"{missing_cases_count} row(s) have missing '{cases_col}'. "
            "Missing case counts are preserved as null/missing and NEVER silently converted to zero."
        )

    non_missing_cases = raw_cases[~missing_mask]
    numeric_cases = pd.to_numeric(non_missing_cases, errors="coerce")
    if numeric_cases.isna().any():
        bad_case_vals = non_missing_cases[numeric_cases.isna()].head(3).tolist()
        errors.append(f"Non-numeric values in '{cases_col}': {bad_case_vals}")
    else:
        if (numeric_cases < 0).any():
            errors.append(f"Negative case counts found in '{cases_col}'. Reported cases must be >= 0.")
        if (numeric_cases % 1 != 0).any():
            errors.append(f"Non-integer case counts found in '{cases_col}'. Reported cases must be whole numbers.")

    # 3. Validate weather columns
    for w_col, w_label in [(rain_col, "rainfall_mm"), (temp_col, temp_col)]:
        w_raw = df[w_col]
        w_missing = w_raw.isna() | (w_raw.astype(str).str.strip() == "")
        w_non_missing = w_raw[~w_missing]
        w_num = pd.to_numeric(w_non_missing, errors="coerce")
        if w_num.isna().any():
            errors.append(f"Non-numeric values found in weather column '{w_label}'.")
        elif w_col == rain_col and (w_num < 0).any():
            errors.append("Negative rainfall values found in 'rainfall_mm'. Rainfall must be >= 0.")

    # 4. Validate optional reporting_completeness (0 to 1 or 0 to 100)
    if "reporting_completeness" in cols:
        rc_raw = df["reporting_completeness"].dropna()
        rc_num = pd.to_numeric(rc_raw, errors="coerce")
        if rc_num.isna().any():
            errors.append("Non-numeric values found in 'reporting_completeness'.")
        elif ((rc_num < 0) | (rc_num > 100)).any():
            errors.append("Values in 'reporting_completeness' must be between 0.0 and 1.0 (or 0 to 100%).")

    # 5. Population & incidence safeguard: never calculate incidence without a valid population denominator
    incidence_calculated_rows = 0
    incidence_skipped_rows = 0
    preview_rows: List[Dict[str, Any]] = []

    pop_col = "population" if "population" in cols else None
    if pop_col:
        pop_raw = df[pop_col]
        pop_missing = pop_raw.isna() | (pop_raw.astype(str).str.strip() == "")
        pop_num = pd.to_numeric(pop_raw[~pop_missing], errors="coerce")
        if pop_num.isna().any():
            errors.append("Non-numeric values found in 'population' column.")
        elif (pop_num <= 0).any():
            errors.append("Population denominator must be > 0 when provided.")

    for idx, row in df.head(10).iterrows():
        c_val = None if missing_mask.loc[idx] else float(pd.to_numeric(row[cases_col], errors="coerce"))
        p_val = None
        if pop_col and pd.notna(row[pop_col]) and str(row[pop_col]).strip() != "":
            p_parsed = pd.to_numeric(row[pop_col], errors="coerce")
            if pd.notna(p_parsed) and float(p_parsed) > 0:
                p_val = float(p_parsed)

        if c_val is not None and p_val is not None and p_val > 0:
            inc_1000 = round((c_val / p_val) * 1000.0, 4)
        else:
            inc_1000 = None

        preview_rows.append({
            "week_start": str(row[date_col]),
            "district": str(row["district"]) if "district" in cols and pd.notna(row["district"]) else "Sample District",
            "block": str(row[block_col]),
            "reported_cases": int(c_val) if (c_val is not None and not np.isnan(c_val)) else None,
            "population": int(p_val) if p_val is not None else None,
            "incidence_per_1000": inc_1000,
            "rainfall_mm": float(row[rain_col]) if pd.notna(row[rain_col]) and not errors else row[rain_col],
            "temperature_c": float(row[temp_col]) if pd.notna(row[temp_col]) and not errors else row[temp_col],
        })

    # Count incidence rows across entire dataframe
    for idx, row in df.iterrows():
        has_case = not missing_mask.loc[idx] and pd.notna(pd.to_numeric(row[cases_col], errors="coerce"))
        has_valid_pop = False
        if pop_col and pd.notna(row[pop_col]) and str(row[pop_col]).strip() != "":
            p_parsed = pd.to_numeric(row[pop_col], errors="coerce")
            if pd.notna(p_parsed) and float(p_parsed) > 0:
                has_valid_pop = True
        if has_case and has_valid_pop:
            incidence_calculated_rows += 1
        else:
            incidence_skipped_rows += 1

    if incidence_skipped_rows > 0:
        warnings.append(
            f"Incidence rate was NOT calculated for {incidence_skipped_rows} row(s) lacking a valid population denominator or case count."
        )

    return {
        "filename": filename,
        "is_valid": len(errors) == 0,
        "total_rows": int(len(df)),
        "columns_detected": cols,
        "missing_cases_count": missing_cases_count,
        "missing_cases_preserved_as_null": True,
        "incidence_calculated_rows": incidence_calculated_rows,
        "incidence_skipped_missing_population_rows": incidence_skipped_rows,
        "errors": errors,
        "warnings": warnings,
        "preview_rows": preview_rows,
    }

