"""
Historical Malaria Case & Incidence Forecasting ML Service (`docs/archive/*.csv`).

Loads the fitted scikit-learn Pipeline bundle from `artifacts/malaria_forecast_model.joblib`
once on startup (cached in memory) and executes validated single-year or multi-year
recursive forecasting using the exact feature preprocessing from `backend/train_malaria_model.py`.

Safety & Honesty Rules:
- Never retrains on API startup or per-request.
- Never fabricates sub-district (block/village) data when querying the WHO country archive;
  explicitly reports when a requested sub-district location is outside the WHO country-level
  dataset scope while linking India's national baseline to Chhattisgarh Mitanin workflows.
- Never presents model outputs as a confirmed clinical diagnosis.
- Clearly labels predictions as experimental decision-support projections.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
MALARIA_MODEL_PATH = ARTIFACTS_DIR / "malaria_forecast_model.joblib"
MALARIA_METRICS_PATH = ARTIFACTS_DIR / "malaria_model_metrics.json"
MALARIA_EDA_PATH = ARTIFACTS_DIR / "malaria_dataset_analysis.json"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from train_malaria_model import (
    ALL_FEATURE_COLS,
    CATEGORICAL_FEATURE_COLS,
    NUMERIC_FEATURE_COLS,
    classify_incidence_risk,
    classify_who_transmission_stratum,
    compute_incidence_feature_row,
)

_CACHED_MALARIA_BUNDLE: Optional[Dict[str, Any]] = None
_CACHED_MALARIA_MTIME: Optional[float] = None


MITANIN_RISK_GUIDANCE: Dict[str, Dict[str, Any]] = {
    "Very High": {
        "headline": "Very High Endemic Malaria Burden (≥250 cases per 1,000 at risk)",
        "mitanin_actions": [
            "Conduct proactive weekly door-to-door fever surveillance across all hamlets and perform immediate RDT testing on every febrile case.",
            "Verify RDT and ACT (Artemisinin-based Combination Therapy) stock buffers before peak monsoon transmission windows.",
            "Coordinate household LLIN (Long-Lasting Insecticidal Net) distribution and stagnant-water source reduction drives.",
        ],
        "escalation_instructions": (
            "Escalate immediately to the Block Medical Officer (BMO) / PHC Supervisor if cluster fever spikes "
            "or severe malaria warning signs (altered consciousness, convulsions, severe anemia, respiratory distress, "
            "inability to drink) occur. Call 108 for emergency referral."
        ),
    },
    "High": {
        "headline": "High Malaria Transmission Risk (100–250 cases per 1,000 at risk)",
        "mitanin_actions": [
            "Perform active household fever screening and point-of-care Rapid Diagnostic Testing (RDT) within 24 hours of fever onset.",
            "Ensure complete age-appropriate antimalarial treatment adherence for RDT-positive patients and follow up on Day 3.",
            "Inspect peridomestic water collection points, hand-pump runoffs, and खुले (open) containers for Anopheles breeding.",
        ],
        "escalation_instructions": (
            "Refer any patient with persistent high fever, vomiting, jaundice, or pregnancy-associated fever to the nearest "
            "Primary Health Centre (PHC) or Community Health Centre (CHC)."
        ),
    },
    "Moderate": {
        "headline": "Moderate Endemic Malaria Transmission (10–100 cases per 1,000 at risk)",
        "mitanin_actions": [
            "Test all suspected fever cases (especially fever with chills, rigor, or headache) using bivalent Malaria RDT kits.",
            "Promote nightly LLIN mosquito net usage, particularly for children under 5 and pregnant women.",
            "Log all RDT tests and positive cases promptly in the Mitanin field report ledger to prevent surveillance lag.",
        ],
        "escalation_instructions": (
            "Notify the ANM / Block Supervisor if two or more RDT-positive cases are detected in the same hamlet within 7 days."
        ),
    },
    "Low": {
        "headline": "Low / Declining Malaria Transmission (<10 cases per 1,000 at risk)",
        "mitanin_actions": [
            "Maintain vigilant passive and active RDT screening for all febrile patients so declining national trends do not mask localized forest/tribal pockets.",
            "Track travel history from high-endemic forest blocks or neighboring districts to detect imported or focal cases early.",
            "Continue community education on draining stagnant water after rainfall and sleeping under treated mosquito nets.",
        ],
        "escalation_instructions": (
            "Even when national or state averages are <10 per 1,000, forested tribal blocks (such as Bastar/Keshkal sentinel areas) "
            "can experience focal surges; report every positive RDT case to the PHC for focal vector control."
        ),
    },
}


def load_malaria_model_bundle() -> Optional[Dict[str, Any]]:
    """
    Loads the saved malaria forecasting model bundle from disk and caches it in memory.
    Reloads only if the artifact file modification timestamp changes.
    """
    global _CACHED_MALARIA_BUNDLE, _CACHED_MALARIA_MTIME
    if not MALARIA_MODEL_PATH.exists():
        return None
    try:
        mtime = MALARIA_MODEL_PATH.stat().st_mtime
        if _CACHED_MALARIA_BUNDLE is not None and _CACHED_MALARIA_MTIME == mtime:
            return _CACHED_MALARIA_BUNDLE
        bundle = joblib.load(MALARIA_MODEL_PATH)
        _CACHED_MALARIA_BUNDLE = bundle
        _CACHED_MALARIA_MTIME = mtime
        return bundle
    except Exception:
        return None


def get_malaria_model_status() -> Dict[str, Any]:
    """
    Returns complete health status, dataset summary, feature list, chronological split metrics,
    baseline comparisons, regional breakdown, and limitations for the trained malaria model.
    """
    bundle = load_malaria_model_bundle()
    metrics_data: Dict[str, Any] = {}
    eda_data: Dict[str, Any] = {}

    if MALARIA_METRICS_PATH.exists():
        try:
            with open(MALARIA_METRICS_PATH, "r", encoding="utf-8") as f:
                metrics_data = json.load(f)
        except Exception:
            metrics_data = {}

    if MALARIA_EDA_PATH.exists():
        try:
            with open(MALARIA_EDA_PATH, "r", encoding="utf-8") as f:
                eda_data = json.load(f)
        except Exception:
            eda_data = {}

    if bundle is None:
        return {
            "model_loaded": False,
            "status": "artifact_missing",
            "message": "Trained malaria forecast model artifact is not loaded.",
        }

    countries: List[str] = bundle.get("countries", [])
    who_regions: List[str] = bundle.get("who_regions", [])
    country_records: Dict[str, Any] = bundle.get("country_records", {})
    india_rec = country_records.get("India", {})

    return {
        "model_loaded": True,
        "status": "ready",
        "model_version": bundle.get("model_version", "1.0.0"),
        "trained_at": bundle.get("trained_at") or metrics_data.get("trained_at"),
        "selected_model": bundle.get("selected_model_name"),
        "selection_rationale": metrics_data.get("selection_rationale"),
        "dataset_directory": "docs/archive",
        "dataset_files": metrics_data.get("dataset_files", []),
        "primary_target_variable": metrics_data.get("primary_target_variable"),
        "auxiliary_target_variable": metrics_data.get("auxiliary_target_variable"),
        "countries_count": len(countries),
        "countries": countries,
        "who_regions": who_regions,
        "default_country": "India" if "India" in countries else (countries[0] if countries else ""),
        "india_summary": {
            "latest_observed_year": india_rec.get("latest_year"),
            "latest_incidence_per_1000": india_rec.get("latest_incidence_per_1000"),
            "latest_risk_category": india_rec.get("latest_risk_category"),
            "latest_who_stratum": india_rec.get("latest_who_stratum"),
        },
        "feature_columns": {
            "numeric": bundle.get("numeric_features", NUMERIC_FEATURE_COLS),
            "categorical": bundle.get("categorical_features", CATEGORICAL_FEATURE_COLS),
            "all_ordered": bundle.get("all_features_ordered", ALL_FEATURE_COLS),
        },
        "chronological_split_methodology": metrics_data.get("chronological_split_methodology", {}),
        "selected_model_metrics": metrics_data.get("selected_model_metrics", {}),
        "baseline_comparison": metrics_data.get("baseline_comparison", {}),
        "candidate_models": metrics_data.get("candidate_models", []),
        "auxiliary_reported_cases_model": metrics_data.get("auxiliary_reported_cases_model", {}),
        "regional_test_performance_2017_2018": metrics_data.get("regional_test_performance_2017_2018", []),
        "yearly_evaluation_performance_2015_2018": metrics_data.get("yearly_evaluation_performance_2015_2018", []),
        "permutation_feature_importance": metrics_data.get("permutation_feature_importance", []),
        "data_quality_findings": eda_data.get("data_quality_findings", []),
        "limitations_and_deployment_safeguards": metrics_data.get("limitations_and_deployment_safeguards", []),
    }


def run_malaria_case_forecast(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes validated malaria incidence & case trend forecasting using the loaded model bundle.

    Supports two modes:
    1. Country-based forecasting (`country="India"`, `horizon_years=3`):
       Uses the actual historical series from `docs/archive/*.csv` up to the latest observed year
       (or optional `base_year` in 2003..2018 for historical walk-forward verification) and
       forecasts `horizon_years` (1 to 5 years) ahead.
    2. Custom trajectory forecasting (`incidence_lag_1`, `incidence_lag_2`, `incidence_lag_3`, `who_region`, `base_year`):
       Computes the exact 13-feature vector from the user-supplied 3-year lags and forecasts
       `horizon_years` ahead.

    If a caller requests a sub-district location name (e.g., 'Sample Block A' or 'Bastar') as `country`
    without custom lags, returns a structured limitation error rather than fabricating sub-district numbers.
    """
    bundle = load_malaria_model_bundle()
    if bundle is None:
        raise RuntimeError("Malaria forecast model artifact is not loaded.")

    inc_pipe = bundle["incidence_pipeline"]
    country_records: Dict[str, Dict[str, Any]] = bundle["country_records"]
    who_regions: List[str] = bundle["who_regions"]
    uncertainty_cal: Dict[str, float] = bundle.get("uncertainty_calibration", {})
    q80_rel = float(uncertainty_cal.get("q80_relative_error", 0.14))
    q80_abs = float(uncertainty_cal.get("q80_absolute_error", 4.5))

    horizon_years = int(payload.get("horizon_years", 3))
    if horizon_years < 1 or horizon_years > 5:
        raise ValueError("horizon_years must be between 1 and 5 years (supported forecast horizon).")

    requested_country_raw = payload.get("country")
    requested_country = str(requested_country_raw).strip() if requested_country_raw else "India"
    requested_sublocation = payload.get("location_context")

    has_custom_lags = (
        payload.get("incidence_lag_1") is not None
        and payload.get("incidence_lag_2") is not None
        and payload.get("incidence_lag_3") is not None
    )

    # Case-insensitive country lookup
    country_map_ci = {c.lower(): c for c in country_records.keys()}
    matched_country = country_map_ci.get(requested_country.lower())

    if not matched_country and not has_custom_lags:
        raise ValueError(
            f"Unsupported location '{requested_country}' in WHO malaria archive. "
            f"The uploaded dataset (`docs/archive/*.csv`) contains country-level annual records for "
            f"{len(country_records)} countries (including 'India'), not sub-district block/village records. "
            f"Either select a supported country (e.g., 'India') or provide explicit 3-year incidence lags "
            f"(incidence_lag_1, incidence_lag_2, incidence_lag_3)."
        )

    country_info = country_records.get(matched_country) if matched_country else None
    who_region = str(
        payload.get("who_region")
        or (country_info["who_region"] if country_info else "South-East Asia")
    ).strip()

    if who_region not in who_regions:
        raise ValueError(
            f"Invalid who_region '{who_region}'. Supported WHO Regions: {', '.join(who_regions)}."
        )

    history_series: List[Dict[str, Any]] = []
    est_scale: Optional[float] = None
    rep_scale: Optional[float] = None

    if has_custom_lags:
        l1 = float(payload["incidence_lag_1"])
        l2 = float(payload["incidence_lag_2"])
        l3 = float(payload["incidence_lag_3"])
        if l1 < 0 or l2 < 0 or l3 < 0 or l1 > 1000 or l2 > 1000 or l3 > 1000:
            raise ValueError(
                "Incidence rates per 1,000 population at risk must be between 0.0 and 1000.0."
            )
        base_year = int(payload.get("base_year") or 2018)
        if base_year < 2002 or base_year > 2030:
            raise ValueError("base_year must be between 2002 and 2030.")

        if country_info:
            est_scale = country_info.get("cases_per_incidence_unit_estimated")
            rep_scale = country_info.get("cases_per_incidence_unit_reported")
            history_series = [h for h in country_info["history"] if h["year"] <= base_year]
        else:
            history_series = [
                {"year": base_year - 2, "incidence_per_1000": round(l3, 2)},
                {"year": base_year - 1, "incidence_per_1000": round(l2, 2)},
                {"year": base_year, "incidence_per_1000": round(l1, 2)},
            ]
    else:
        assert country_info is not None
        full_hist = country_info["history"]
        base_year = int(payload.get("base_year") or country_info["latest_year"])
        avail_years = [h["year"] for h in full_hist]
        if base_year not in avail_years or base_year < 2002:
            raise ValueError(
                f"base_year {base_year} is outside the available 3-lag historical range "
                f"(2002–{max(avail_years)}) for {matched_country}."
            )
        history_series = [h for h in full_hist if h["year"] <= base_year]
        if len(history_series) < 3:
            raise ValueError(f"At least 3 historical years are required up to base_year {base_year}.")
        l1 = float(history_series[-1]["incidence_per_1000"])
        l2 = float(history_series[-2]["incidence_per_1000"])
        l3 = float(history_series[-3]["incidence_per_1000"])
        est_scale = country_info.get("cases_per_incidence_unit_estimated")
        rep_scale = country_info.get("cases_per_incidence_unit_reported")

    # Actual lookup for post-base_year observations if user selected an earlier base_year (e.g., 2016)
    actual_future_lookup: Dict[int, Dict[str, Any]] = {}
    if country_info:
        for h in country_info["history"]:
            if h["year"] > base_year:
                actual_future_lookup[int(h["year"])] = h

    # Stepwise recursive forecasting for steps 1 .. horizon_years
    forecasts: List[Dict[str, Any]] = []
    curr_l1, curr_l2, curr_l3 = l1, l2, l3
    first_step_features: Optional[Dict[str, Any]] = None

    for step in range(1, horizon_years + 1):
        target_year = base_year + step
        feat_row = compute_incidence_feature_row(
            lag_1=curr_l1,
            lag_2=curr_l2,
            lag_3=curr_l3,
            year=target_year,
            who_region=who_region,
        )
        if step == 1:
            first_step_features = feat_row

        X_step = pd.DataFrame([feat_row])[ALL_FEATURE_COLS]
        raw_pred = float(np.maximum(0.0, inc_pipe.predict(X_step))[0])
        if curr_l1 == 0.0 and curr_l2 == 0.0 and curr_l3 == 0.0:
            pred_inc = 0.0
        else:
            pred_inc = round(raw_pred, 2)

        # Persistence baseline always predicts the base_year observed incidence (l1)
        persistence_inc = round(l1, 2)
        ma3_inc = round(float(np.mean([curr_l1, curr_l2, curr_l3])), 2)

        # Calibrated 80% uncertainty interval widening with step sqrt(step)
        if pred_inc == 0.0 and curr_l1 == 0.0:
            half_width = 0.0
        else:
            half_width = max(pred_inc * q80_rel, min(q80_abs, pred_inc * 0.30)) * np.sqrt(step)

        ci_lower = round(max(0.0, pred_inc - half_width), 2)
        ci_upper = round(pred_inc + half_width, 2)

        proj_est_cases = int(round(pred_inc * est_scale)) if (est_scale and pred_inc > 0) else (0 if pred_inc == 0 else None)
        proj_rep_cases = int(round(pred_inc * rep_scale)) if (rep_scale and pred_inc > 0) else (0 if pred_inc == 0 else None)

        actual_entry = actual_future_lookup.get(target_year)
        actual_inc = actual_entry["incidence_per_1000"] if actual_entry else None

        forecasts.append(
            {
                "step": step,
                "year": target_year,
                "predicted_incidence_per_1000": pred_inc,
                "persistence_baseline_per_1000": persistence_inc,
                "moving_avg_3yr_per_1000": ma3_inc,
                "ci_80_lower": ci_lower,
                "ci_80_upper": ci_upper,
                "risk_category": classify_incidence_risk(pred_inc),
                "who_transmission_stratum": classify_who_transmission_stratum(pred_inc),
                "projected_estimated_cases": proj_est_cases,
                "projected_reported_cases": proj_rep_cases,
                "actual_observed_incidence_per_1000": actual_inc,
            }
        )

        # Advance lags for next autoregressive step
        curr_l3 = curr_l2
        curr_l2 = curr_l1
        curr_l1 = pred_inc

    # Compute trend direction & explanation
    first_pred = forecasts[0]["predicted_incidence_per_1000"]
    last_pred = forecasts[-1]["predicted_incidence_per_1000"]
    delta_vs_base = round(first_pred - l1, 2)
    pct_change_vs_base = round(((first_pred - l1) / l1) * 100.0, 1) if l1 > 0.05 else 0.0

    if l1 == 0.0 and first_pred == 0.0:
        trend_direction = "Zero Indigenous Transmission Maintained"
    elif pct_change_vs_base <= -3.0:
        trend_direction = "Declining Trajectory"
    elif pct_change_vs_base >= 3.0:
        trend_direction = "Rising / Surge Trajectory"
    else:
        trend_direction = "Stable / Plateau Trajectory"

    primary_risk_cat = forecasts[0]["risk_category"]
    guidance_block = MITANIN_RISK_GUIDANCE.get(primary_risk_cat, MITANIN_RISK_GUIDANCE["Low"])

    associated_factors = [
        {
            "factor": "1-Year Lagged Incidence (inc_lag_1)",
            "value": f"{l1:.2f} per 1,000 (Year {base_year})",
            "explanation": "Strongest autoregressive predictor (Test Permutation Importance = 74.88 MAE units). Current endemic baseline anchors next year's transmission potential.",
        },
        {
            "factor": "Recent Annual Momentum (inc_diff_1 = lag_1 − lag_2)",
            "value": f"{l1 - l2:+.2f} per 1,000 ({base_year - 1} → {base_year})",
            "explanation": "Captures whether transmission is accelerating or declining prior to the forecast origin.",
        },
        {
            "factor": "3-Year Rolling Mean Burden (inc_roll_mean_3)",
            "value": f"{np.mean([l1, l2, l3]):.2f} per 1,000 ({base_year - 2}–{base_year})",
            "explanation": "Smooths single-year reporting fluctuations and reflects multi-year endemic reservoir pressure.",
        },
        {
            "factor": "WHO Region & Secular Control Trend",
            "value": f"{who_region} · {base_year - 2000} yrs since 2000",
            "explanation": "Accounts for regional endemicity structure and long-term LLIN/ACT control progress across 2000–2018.",
        },
    ]

    granularity_limitation_note = None
    if requested_sublocation:
        granularity_limitation_note = (
            f"Granularity Disclosure: Selected UI location is '{requested_sublocation}', whereas the uploaded "
            f"WHO dataset (`docs/archive/*.csv`) provides country-level annual surveillance (shown here for "
            f"{matched_country or requested_country}). Sub-district weekly block alerts in Chhattisgarh continue "
            f"to use the block surveillance pipeline."
        )

    return {
        "status": "success",
        "model_version": bundle.get("model_version", "1.0.0"),
        "selected_model": bundle.get("selected_model_name"),
        "country": matched_country or requested_country,
        "who_region": who_region,
        "location_context": requested_sublocation,
        "granularity_level": "country_annual",
        "granularity_limitation_note": granularity_limitation_note,
        "base_year": base_year,
        "forecast_period": f"{base_year + 1}–{base_year + horizon_years}",
        "horizon_years": horizon_years,
        "input_lags_per_1000": {
            "lag_1_year": base_year,
            "incidence_lag_1": round(l1, 2),
            "lag_2_year": base_year - 1,
            "incidence_lag_2": round(l2, 2),
            "lag_3_year": base_year - 2,
            "incidence_lag_3": round(l3, 2),
        },
        "engineered_features_step_1": first_step_features,
        "predicted_next_year": forecasts[0],
        "trend_summary": {
            "direction": trend_direction,
            "delta_next_year_per_1000": delta_vs_base,
            "pct_change_next_year": pct_change_vs_base,
            "horizon_end_incidence_per_1000": last_pred,
        },
        "forecasts": forecasts,
        "historical_series": history_series,
        "associated_factors": associated_factors,
        "mitanin_guidance": {
            "risk_category": primary_risk_cat,
            "headline": guidance_block["headline"],
            "recommended_actions": guidance_block["mitanin_actions"],
            "escalation_instructions": guidance_block["escalation_instructions"],
            "india_underreporting_context": (
                "In the uploaded WHO archive for India (2010–2017), estimated total malaria cases were ~10x–13x "
                "higher than routine facility-reported cases (e.g., 2017 India reported = 844,558 vs WHO estimated "
                "median = 9.59 million). Active village-level Mitanin fever screening and RDT testing directly "
                "close this underreporting gap."
            )
            if (matched_country == "India" or who_region == "South-East Asia")
            else None,
        },
        "experimental_disclaimer": (
            "EXPERIMENTAL EPIDEMIOLOGICAL FORECAST: Generated from historical WHO country-level annual malaria data "
            "(2000–2018) using a trained HuberRegressor pipeline. Statistical associations reflect historical lag "
            "correlations, not proven causal mechanisms, and must never be used as a clinical diagnosis."
        ),
    }
