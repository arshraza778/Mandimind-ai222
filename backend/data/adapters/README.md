# Data Adapters

Adapters are responsible for taking disparate, raw data sources (e.g. HMIS/IHIP surveillance exports, ERA5 reanalysis grids, CHIRPS precipitation data, local clinic logs) and converting them strictly into the three Mitanin Signal contract files:

1. `cases.csv` (long format: `date`, `unit_id`, `cases`, optional `tests_done`, `pf_cases`, `deaths`, `reporting_flag`)
2. `weather.csv` (long format: `date`, `unit_id`, `rainfall_mm`, optional `temp_c`, `temp_max_c`, `humidity_pct`)
3. `unit_map.csv` (spatial index: `unit_id`, `unit_name`, `level`, optional `parent_id`, `latitude`, `longitude`)

---

## Architectural Rule
> **Adapters are the ONLY code allowed to know about raw formats.**

The core modeling pipeline, feature engineering, and forecasting modules know nothing about raw file formats, provider column namings, or messy source schemas. If a new real data source is introduced, create a new adapter in this folder that outputs the canonical files according to `backend/data/DATA_FORMAT.md`.

---

## Files in this Directory
- `adapter_template.py`: Python template implementing a standard conversion pipeline.
- `unit_map_template.csv`: Canonical template demonstrating the schema for administrative hierarchy and geographic mapping.
