# SIMULATED data. Not real surveillance data.
"""
Mitanin Signal Prototype - Synthetic Data Generator

Generates 6 years of climate and malaria surveillance data for 6 sample blocks
under 'Sample District' in Chhattisgarh according to the strict contract format.

Weather matters for Blocks A, B, D, and E (true lagged response), but NOT for
Blocks C and F, allowing the model skill gate to evaluate real differential skill.
True simulation parameters are stored in sim_truth.json for debugging only.
"""

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import pandas as pd

# Add backend directory to sys.path if not present
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))


def generate_simulated_dataset(
    granularity: str = "weekly",
    output_dir: Path = None,
    seed: int = 42
) -> Dict[str, Any]:
    """
    Generates 6 years of synthetic data matching the contract specification.
    """
    if output_dir is None:
        output_dir = backend_dir / "data" / "sim"
    output_dir.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(seed)

    # 1. Units Specification
    units = [
        {"unit_id": "DIST_SAMPLE", "unit_name": "Sample District", "level": "district", "parent_id": None, "latitude": 21.25, "longitude": 81.63},
        {"unit_id": "BLK_A", "unit_name": "Sample Block A", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.32, "longitude": 81.66},
        {"unit_id": "BLK_B", "unit_name": "Sample Block B", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.21, "longitude": 81.54},
        {"unit_id": "BLK_C", "unit_name": "Sample Block C", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.36, "longitude": 81.71},
        {"unit_id": "BLK_D", "unit_name": "Sample Block D", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.14, "longitude": 81.61},
        {"unit_id": "BLK_E", "unit_name": "Sample Block E", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.29, "longitude": 81.49},
        {"unit_id": "BLK_F", "unit_name": "Sample Block F", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.09, "longitude": 81.77},
    ]
    unit_map_df = pd.DataFrame(units)
    unit_map_path = output_dir / "unit_map.csv"
    unit_map_df.to_csv(unit_map_path, index=False)

    # 2. Timeline Generation (6 years: 2018-01-01 through 2023-12-31)
    if granularity == "weekly":
        periods = 52 * 6  # 312 weeks
        date_series = pd.date_range(start="2018-01-01", periods=periods, freq="W-MON")
        dates = date_series.strftime("%Y-%m-%d").tolist()
        steps_per_year = 52
        peak_step = 34.0  # Late August (week ~34)
        peak_width = 4.5
        temp_peak_step = 20.0  # May (week ~20)
        rain_lag = 3  # 3 weeks lag
    elif granularity == "monthly":
        periods = 12 * 6  # 72 months
        date_series = pd.date_range(start="2018-01-01", periods=periods, freq="MS")
        dates = date_series.strftime("%Y-%m-%d").tolist()
        steps_per_year = 12
        peak_step = 8.0  # August (month 8, 0-indexed ~7.5)
        peak_width = 1.2
        temp_peak_step = 4.5  # May (month 5, 0-indexed ~4.5)
        rain_lag = 1  # 1 month lag
    else:
        raise ValueError(f"Unsupported granularity: {granularity}. Choose 'weekly' or 'monthly'.")

    # 3. Unit Characteristics & True Parameters
    # Weather response enabled for A, B, D, E. Disabled (0.0) for C and F.
    unit_params = {
        "BLK_A": {"base_mean": 24.0, "trend_annual": -0.02, "weather_sensitive": True,  "rain_beta": 0.35, "temp_beta": 0.20, "dispersion": 8.0},
        "BLK_B": {"base_mean": 18.0, "trend_annual": -0.01, "weather_sensitive": True,  "rain_beta": 0.40, "temp_beta": 0.25, "dispersion": 6.0},
        "BLK_C": {"base_mean": 28.0, "trend_annual": -0.03, "weather_sensitive": False, "rain_beta": 0.00, "temp_beta": 0.00, "dispersion": 10.0},
        "BLK_D": {"base_mean": 14.0, "trend_annual": -0.01, "weather_sensitive": True,  "rain_beta": 0.30, "temp_beta": 0.15, "dispersion": 7.0},
        "BLK_E": {"base_mean": 20.0, "trend_annual": -0.02, "weather_sensitive": True,  "rain_beta": 0.38, "temp_beta": 0.22, "dispersion": 8.5},
        "BLK_F": {"base_mean": 32.0, "trend_annual": -0.04, "weather_sensitive": False, "rain_beta": 0.00, "temp_beta": 0.00, "dispersion": 12.0},
    }

    # 4. Generate Synthetic Weather Timeline per Block
    weather_records = []
    # Inter-annual monsoon intensity variation across the 6 years
    year_monsoon_multipliers = {
        2018: 0.95,
        2019: 1.20,  # Heavy monsoon year
        2020: 1.05,
        2021: 0.88,  # Below-average monsoon
        2022: 1.15,  # Active monsoon
        2023: 0.98,
    }

    unit_weather_cache: Dict[str, List[Dict[str, float]]] = {uid: [] for uid in unit_params}

    for u_idx, (u_id, params) in enumerate(unit_params.items()):
        spatial_rain_bias = 0.9 + (u_idx * 0.04)
        for t_idx, d_str in enumerate(dates):
            cal_year = int(d_str[:4])
            step_in_year = t_idx % steps_per_year
            monsoon_mult = year_monsoon_multipliers.get(cal_year, 1.0)

            # Seasonal rainfall curve (Gaussian peak centered in July-August)
            rain_center = (peak_step - (rain_lag * 1.5)) % steps_per_year
            rain_curve = math.exp(-0.5 * ((step_in_year - rain_center) / (peak_width * 1.1)) ** 2)
            
            # Base rainfall amount
            scale = 90.0 if granularity == "weekly" else 350.0
            expected_rain = rain_curve * scale * monsoon_mult * spatial_rain_bias
            actual_rain = float(np.clip(expected_rain + rng.normal(0, expected_rain * 0.15 + 2.0), 0.0, 500.0))
            actual_rain = round(actual_rain, 1)

            # Temperature curve: peaks in May
            temp_center = temp_peak_step
            temp_sine = math.cos(2 * math.pi * (step_in_year - temp_center) / steps_per_year)
            # Temp ranges roughly from 18°C (winter) to 36°C (summer)
            temp_mean = round(float(27.0 + 8.5 * temp_sine + rng.normal(0, 1.0)), 1)
            temp_max = round(temp_mean + float(rng.uniform(4.5, 7.5)), 1)
            humidity = round(float(np.clip(40.0 + (rain_curve * 45.0) + rng.normal(0, 3.0), 20.0, 98.0)), 1)

            w_entry = {
                "rainfall_mm": actual_rain,
                "temp_c": temp_mean,
                "temp_max_c": temp_max,
                "humidity_pct": humidity
            }
            unit_weather_cache[u_id].append(w_entry)

            weather_records.append({
                "date": d_str,
                "unit_id": u_id,
                "rainfall_mm": actual_rain,
                "temp_c": temp_mean,
                "temp_max_c": temp_max,
                "humidity_pct": humidity
            })

    weather_df = pd.DataFrame(weather_records)
    weather_path = output_dir / "weather.csv"
    weather_df.to_csv(weather_path, index=False)

    # 5. Generate Synthetic Cases Timeline
    cases_records = []
    # 2020-2021 disruption period: 2020-04-01 through 2021-03-31
    disruption_start = "2020-04-01"
    disruption_end = "2021-03-31"
    disruption_factor = 0.55  # 45% under-reported cases

    for u_id, params in unit_params.items():
        w_series = unit_weather_cache[u_id]
        base_size = params["base_mean"]
        annual_trend = params["trend_annual"]
        r_disp = params["dispersion"]

        # Compute normalized weather signals for response
        rain_vals = np.array([w["rainfall_mm"] for w in w_series])
        temp_vals = np.array([w["temp_c"] for w in w_series])
        rain_norm = (rain_vals - np.mean(rain_vals)) / (np.std(rain_vals) + 1e-6)
        temp_norm = (temp_vals - np.mean(temp_vals)) / (np.std(temp_vals) + 1e-6)

        for t_idx, d_str in enumerate(dates):
            year_idx = t_idx / steps_per_year
            step_in_year = t_idx % steps_per_year

            # 1. Secular trend: slow decline or change
            trend_multiplier = math.exp(annual_trend * year_idx)

            # 2. Baseline seasonality: Gaussian peak in Aug-Sep
            # Distance around peak (handling circular wrap-around)
            diff_step = min(abs(step_in_year - peak_step), steps_per_year - abs(step_in_year - peak_step))
            seasonal_multiplier = math.exp(-0.5 * (diff_step / peak_width) ** 2)

            # Expected base cases
            expected_cases = base_size * trend_multiplier * (0.3 + 1.8 * seasonal_multiplier)

            # 3. Weather influence (lagged by rain_lag steps)
            if params["weather_sensitive"] and t_idx >= rain_lag:
                lagged_rain = rain_norm[t_idx - rain_lag]
                lagged_temp = temp_norm[t_idx - rain_lag]
                weather_effect = math.exp(params["rain_beta"] * lagged_rain + params["temp_beta"] * lagged_temp)
                expected_cases *= weather_effect

            # 4. Reporting disruption (2020-21)
            is_disruption_period = disruption_start <= d_str <= disruption_end
            if is_disruption_period:
                expected_cases *= disruption_factor

            # Ensure positive mean
            expected_cases = max(0.2, expected_cases)

            # 5. Negative Binomial sampling (Poisson-Gamma mixture)
            # gamma shape k = r_disp, scale theta = expected / r_disp
            gamma_sample = rng.gamma(shape=r_disp, scale=expected_cases / r_disp)
            cases_sampled = int(rng.poisson(lam=gamma_sample))

            # Diagnostic tests and sub-metrics
            tests_done = int(cases_sampled * int(rng.integers(3, 7)) + rng.integers(15, 45))
            pf_cases = int(cases_sampled * float(rng.uniform(0.70, 0.85)))
            deaths = 1 if (cases_sampled > 45 and rng.random() < 0.08) else 0

            # Honesty rule contract note: reporting_flag = 0 during disruption, 1 normally
            reporting_flag = 0 if is_disruption_period else 1

            cases_records.append({
                "date": d_str,
                "unit_id": u_id,
                "cases": cases_sampled,
                "tests_done": tests_done,
                "pf_cases": pf_cases,
                "deaths": deaths,
                "reporting_flag": reporting_flag
            })

    cases_df = pd.DataFrame(cases_records)
    cases_path = output_dir / "cases.csv"
    cases_df.to_csv(cases_path, index=False)

    # 6. Save Ground Truth Simulation Parameters (for debugging and evaluation only)
    sim_truth = {
        "header_note": "SIMULATED data. Not real surveillance data.",
        "generated_timestamp": pd.Timestamp.now().isoformat(),
        "granularity": granularity,
        "seed": seed,
        "years": 6,
        "total_periods": periods,
        "date_range": {"start": dates[0], "end": dates[-1]},
        "disruption": {
            "period": f"{disruption_start} to {disruption_end}",
            "under_reporting_factor": disruption_factor,
            "reporting_flag": 1
        },
        "units": unit_params
    }
    truth_path = output_dir / "sim_truth.json"
    with open(truth_path, "w", encoding="utf-8") as f:
        json.dump(sim_truth, f, indent=2)

    # Summary
    summary = {
        "granularity": granularity,
        "output_dir": str(output_dir),
        "total_cases_rows": len(cases_df),
        "total_weather_rows": len(weather_df),
        "rows_per_unit": periods,
        "unit_count": len(unit_params),
        "date_range": {"start": dates[0], "end": dates[-1]},
        "truth_path": str(truth_path)
    }

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Mitanin Signal Synthetic Data Generator (Contract Format)"
    )
    parser.add_argument(
        "--granularity",
        type=str,
        default="weekly",
        choices=["weekly", "monthly"],
        help="Time granularity (weekly or monthly, default: weekly)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory to save contract files (default: backend/data/sim/)"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Fixed random seed for reproducibility (default: 42)"
    )
    args = parser.parse_args()

    out_path = Path(args.output_dir) if args.output_dir else backend_dir / "data" / "sim"

    print("==================================================================")
    print("SIMULATED data. Not real surveillance data.")
    print("==================================================================")
    print(f"Generating synthetic dataset: granularity={args.granularity}, seed={args.seed}")
    
    summary = generate_simulated_dataset(
        granularity=args.granularity,
        output_dir=out_path,
        seed=args.seed
    )

    print("\n--- GENERATION SUMMARY ---")
    print(f"Target Directory: {summary['output_dir']}")
    print(f"Granularity: {summary['granularity']}")
    print(f"Active Units: {summary['unit_count']} sample blocks")
    print(f"Rows per Unit: {summary['rows_per_unit']}")
    print(f"Total Rows: {summary['total_cases_rows']}")
    print(f"Date Range: {summary['date_range']['start']} to {summary['date_range']['end']}")
    print(f"Ground Truth Parameters: {summary['truth_path']}")
    print("--------------------------\n")


if __name__ == "__main__":
    main()
