# Mitanin Signal Data Contract Specification

This document defines the strict data contract for Mitanin Signal. The ingestion system expects exactly three tidy tabular files (CSV format) regardless of whether the underlying data is simulated or converted from real surveillance and meteorological sources.

---

## 1. Cases File Contract (Long Format)

Each row represents health surveillance metrics for one spatial unit during one time period.

### Required Columns:
| Column | Type | Format / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `date` | String | `YYYY-MM-DD` | Start date of the period (ISO 8601). E.g., `2024-01-01`. |
| `unit_id` | String | Non-empty alphanumeric string | Unique identifier of the administrative unit (must match `unit_map`). |
| `cases` | Integer | $\ge 0$ (0 or positive integer) | Total confirmed/clinical malaria cases recorded in this period. |

### Optional Columns:
| Column | Type | Format / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `tests_done` | Integer | $\ge 0$ | Number of diagnostic tests performed (RDT or microscopy). |
| `pf_cases` | Integer | $\ge 0$ | Plasmodium falciparum confirmed cases. |
| `deaths` | Integer | $\ge 0$ | Malaria attributable deaths recorded. |
| `reporting_flag`| Integer | `0` or `1` | `1` indicates complete/normal reporting; `0` indicates known disruption or non-reporting. |

---

## 2. Weather File Contract (Long Format)

Weather observations may originate from distinct providers (e.g. ERA5, CHIRPS, IMD stations). They are ingested via a dedicated table joined on `(date, unit_id)`.

### Required Columns:
| Column | Type | Format / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `date` | String | `YYYY-MM-DD` | Start date of the period (ISO 8601, matching cases dates). |
| `unit_id` | String | Non-empty alphanumeric string | Administrative unit identifier (must match `unit_map`). |
| `rainfall_mm` | Float | $\ge 0.0$ | Cumulative rainfall in millimeters over the period. |

### Optional Columns:
| Column | Type | Format / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `temp_c` | Float | $-10.0$ to $60.0$ | Mean ambient temperature in Celsius. |
| `temp_max_c` | Float | $-10.0$ to $60.0$ | Maximum ambient temperature in Celsius. |
| `humidity_pct`| Float | $0.0$ to $100.0$ | Average relative humidity percentage. |

---

## 3. Unit Map Contract

Defines spatial topology, hierarchy, and coordinate metadata.

### Required Columns:
| Column | Type | Format / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `unit_id` | String | Non-empty alphanumeric string | Unique primary key. E.g., `BLK_A`. |
| `unit_name` | String | Non-empty string | Human-readable unit name. E.g., `Block A`. |
| `level` | String | `"block"` or `"district"` | Administrative tier. Must match `geography_level` in config. |

### Optional Columns:
| Column | Type | Format / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `parent_id` | String | Alphanumeric string | Identifier of the parent district if `level` is `block`. |
| `latitude` | Float | $-90.0$ to $90.0$ | Representative centroid latitude. |
| `longitude` | Float | $-180.0$ to $180.0$ | Representative centroid longitude. |

---

## 4. Ingestion & Quality Rules

### Fatal Errors (Block Ingestion):
1. **Missing Required Columns**: Any missing mandatory column immediately aborts loading.
2. **Duplicate `(date, unit_id)` Rows**: Each unit may only have one record per period.
3. **Negative or Non-integer Cases**: Case counts must be valid whole numbers $\ge 0$.
4. **Unknown `unit_id`**: Any `unit_id` not defined in `unit_map` raises an error.
5. **Unparseable Dates**: Dates must be strictly valid ISO `YYYY-MM-DD`.
6. **Granularity Mismatch**: Date spacing must adhere to config (`weekly`: strictly 7 days; `monthly`: monthly starts).

### Quality Warnings (Load with Report):
1. **Date Sequence Gaps**: Missing intermediate periods within a unit's timeline.
2. **Missing Weather Values**: Unmatched weather records or null readings.
3. **Long Runs of Zeros**: Prolonged periods ($\ge 8$ consecutive periods) of zero cases.
4. **Extreme Outliers**: Unusually elevated case counts ($> \text{mean} + 5\sigma$).
5. **Reporting Disruptions**: Periods where `reporting_flag == 0`.
6. **Insufficient History**: Units with fewer historical periods than required for model evaluation.

### Missing Data Policy:
- **Cases**: NEVER filled or imputed silently. Retained as missing and flagged in the quality report.
- **Weather**: Interpolated ONLY if explicitly enabled in `config.yaml` (`interpolate_weather: true`). The report explicitly counts filled values.

---

## 5. Adapters
Raw surveillance exports (such as IHIP, HMIS, ERA5, or CHIRPS extracts) must NEVER be loaded directly by the core model. Instead, bespoke conversion scripts in `backend/data/adapters/` normalize raw inputs into these three canonical contract files.
