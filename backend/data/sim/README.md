# SIMULATED data. Not real surveillance data.

All datasets contained in this directory (`cases.csv`, `weather.csv`, `unit_map.csv`, `sim_truth.json`) are **SYNTHETICALLY GENERATED PROTOTYPE DATA**.

- They do **NOT** represent real patient records, actual disease surveillance from Chhattisgarh, or real IMD weather measurements.
- Generated with fixed random seed for reproducible research and prototype evaluation.
- Never use the words "validated", "deployed", or "proven".
- Do not read these files directly in application code; access them solely through the data contract loader (`backend/data/load.py`).
