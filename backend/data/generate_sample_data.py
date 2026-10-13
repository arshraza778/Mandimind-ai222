"""
Generator for baseline canonical simulated dataset matching contract.
Uses fixed random seed.
"""
import numpy as np
import pandas as pd
from pathlib import Path


def generate_contract_data(output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed=42)

    # 1. Unit map
    units = [
        {"unit_id": "BLK_A", "unit_name": "Block A", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.30, "longitude": 81.65},
        {"unit_id": "BLK_B", "unit_name": "Block B", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.20, "longitude": 81.55},
        {"unit_id": "BLK_C", "unit_name": "Block C", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.35, "longitude": 81.70},
        {"unit_id": "BLK_D", "unit_name": "Block D", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.15, "longitude": 81.60},
        {"unit_id": "BLK_E", "unit_name": "Block E", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.28, "longitude": 81.50},
        {"unit_id": "BLK_F", "unit_name": "Block F", "level": "block", "parent_id": "DIST_SAMPLE", "latitude": 21.10, "longitude": 81.75},
        {"unit_id": "DIST_SAMPLE", "unit_name": "Sample District", "level": "district", "parent_id": None, "latitude": 21.25, "longitude": 81.63},
    ]
    unit_map_df = pd.DataFrame(units)
    unit_map_df.to_csv(output_dir / "unit_map.csv", index=False)

    # Weekly date range: 3 years (156 weeks) from 2021-01-04 (Mondays)
    dates = pd.date_range(start="2021-01-04", periods=156, freq="W-MON").strftime("%Y-%m-%d").tolist()

    cases_records = []
    weather_records = []

    block_ids = ["BLK_A", "BLK_B", "BLK_C", "BLK_D", "BLK_E", "BLK_F"]

    for u_idx, u_id in enumerate(block_ids):
        # Base multiplier per block
        unit_scale = 1.0 + (u_idx * 0.2)
        for t_idx, d_str in enumerate(dates):
            week_of_year = t_idx % 52

            # Monsoon rainfall peak around weeks 24 to 36 (June to September)
            monsoon_intensity = np.exp(-0.5 * ((week_of_year - 30) / 4.5) ** 2)
            rain_mm = round(float(np.clip(monsoon_intensity * 120 + rng.normal(5, 4), 0, 300)), 1)
            temp_mean = round(float(28.0 + 6.0 * np.sin(2 * np.pi * (week_of_year - 15) / 52) + rng.normal(0, 1)), 1)
            humidity = round(float(np.clip(45 + monsoon_intensity * 40 + rng.normal(0, 3), 20, 98)), 1)

            # Malaria cases lag rainfall by 3-4 weeks (peak around weeks 28-36)
            seasonal_curve = np.exp(-0.5 * ((week_of_year - 34) / 5.0) ** 2)
            expected_cases = 10 * unit_scale + 35 * unit_scale * seasonal_curve
            cases = int(max(0, np.round(rng.poisson(expected_cases))))

            cases_records.append({
                "date": d_str,
                "unit_id": u_id,
                "cases": cases,
                "tests_done": cases * 4 + int(rng.integers(10, 30)),
                "pf_cases": int(cases * 0.75),
                "deaths": 1 if (cases > 50 and rng.random() < 0.1) else 0,
                "reporting_flag": 1
            })

            weather_records.append({
                "date": d_str,
                "unit_id": u_id,
                "rainfall_mm": rain_mm,
                "temp_c": temp_mean,
                "temp_max_c": round(temp_mean + 5.0, 1),
                "humidity_pct": humidity
            })

    cases_df = pd.DataFrame(cases_records)
    cases_df.to_csv(output_dir / "cases.csv", index=False)

    weather_df = pd.DataFrame(weather_records)
    weather_df.to_csv(output_dir / "weather.csv", index=False)

    print(f"Generated {len(cases_df)} cases and {len(weather_df)} weather rows in {output_dir}")


if __name__ == "__main__":
    generate_contract_data(Path("backend/data"))
