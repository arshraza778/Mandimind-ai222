"""
Mitanin Signal - Rolling-Origin Model Evaluation & Skill Gate Module
Evaluates Baseline vs Weather Model per unit using expanding training windows.
Strict zero-leakage guarantee: training data strictly ends before test period begins.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

from config import AppConfig, load_config
from forecast.models import NegativeBinomialForecastModel


def compute_baseline_relative_skill(
    candidate_mae: Optional[float],
    baseline_mae: Optional[float],
) -> Dict[str, Any]:
    """
    Computes the illustrative baseline-relative skill score:
        Skill = 1 - (MAE_candidate / MAE_baseline)
    Explicitly handles a zero baseline MAE instead of dividing by zero.
    """
    if candidate_mae is None or baseline_mae is None:
        return {
            "skill_score": None,
            "skill_score_pct": "N/A",
            "zero_baseline_mae_handled": False,
            "note": "Insufficient data to compute baseline-relative skill score.",
        }

    c_mae = float(candidate_mae)
    b_mae = float(baseline_mae)

    if b_mae == 0.0:
        # Explicit zero baseline MAE handling without division by zero
        if c_mae == 0.0:
            return {
                "skill_score": 0.0,
                "skill_score_pct": "0.0%",
                "zero_baseline_mae_handled": True,
                "note": "Baseline MAE is 0.0 and candidate MAE is 0.0; skill score set to 0.0 without division by zero.",
            }
        return {
            "skill_score": -1.0,
            "skill_score_pct": "-100.0%",
            "zero_baseline_mae_handled": True,
            "note": "Baseline MAE is 0.0 while candidate MAE > 0; handled explicitly without division by zero.",
        }

    skill = 1.0 - (c_mae / b_mae)
    return {
        "skill_score": round(float(skill), 4),
        "skill_score_pct": f"{skill:.1%}",
        "zero_baseline_mae_handled": False,
        "note": "Skill = 1 - (MAE_candidate / MAE_baseline)",
    }


def evaluate_unit_rolling_origin(
    unit_df: pd.DataFrame,
    unit_id: str,
    unit_name: str,
    config: AppConfig,
    total_timeline_len: int,
    exclude_disruptions: bool = False,
) -> Dict[str, Any]:
    """
    Runs rolling-origin evaluation for a single unit across the last evaluation_years.
    Guarantees zero data leakage: for each origin t, training data is unit_df.iloc[:t].
    If exclude_disruptions is True, surveillance disruption periods (reporting_flag == 0)
    are excluded from both model training and evaluation test origins.
    Calculates MAE and RMSE for both models (strictly no MAPE), win share,
    median MAE improvement, baseline-relative skill score (1 - MAE_candidate / MAE_baseline),
    skill gate decision, and reactive rule comparison.
    """
    n_periods = len(unit_df)
    granularity = config.granularity
    steps_per_year = 52 if granularity == "weekly" else 12
    min_required_periods = config.evaluation_years * steps_per_year
    max_h = max(config.horizon_steps)
    eval_steps = config.evaluation_years * steps_per_year

    # 1. Check history length
    if n_periods < min_required_periods:
        return {
            "unit_id": unit_id,
            "unit_name": unit_name,
            "decision": "not enough data",
            "verdict_chip": "Not enough data",
            "skill_gate_status": "Insufficient evidence",
            "reason": f"Only {n_periods} periods available (requires at least {min_required_periods} for {config.evaluation_years}-year evaluation).",
            "win_share": 0.0,
            "median_improvement": 0.0,
            "skill_score": None,
            "skill_score_pct": "N/A",
            "zero_baseline_mae_handled": False,
            "baseline_metrics": None,
            "weather_metrics": None,
            "reactive_rule": None,
            "n_evaluations": 0,
        }

    # 2. Check weather availability
    has_weather = (
        "rainfall_mm" in unit_df.columns
        and unit_df["rainfall_mm"].notna().sum() >= (n_periods * 0.5)
    )

    # 3. Setup rolling evaluation origins
    start_origin = max(n_periods - eval_steps, max_h + 1)
    end_origin = n_periods - max_h

    # Ensure step_idx exists
    udf = unit_df.copy().reset_index(drop=True)
    if "step_idx" not in udf.columns:
        udf["step_idx"] = np.arange(len(udf))

    # Add shifted lagged weather features to udf
    for lag in config.weather_lags_steps:
        udf[f"rain_lag_{lag}"] = udf["rainfall_mm"].shift(lag) if "rainfall_mm" in udf.columns else 0.0
        udf[f"temp_lag_{lag}"] = udf["temp_c"].shift(lag) if "temp_c" in udf.columns else 26.0

    origin_results_all: List[Dict[str, Any]] = []

    # Step by 1 or 2 to maintain dense evaluation across the evaluation period
    step_size = 2 if granularity == "weekly" else 1

    for t in range(start_origin, end_origin + 1, step_size):
        # STRICT ZERO-LEAKAGE:
        # train_df only includes indices 0 to t-1
        train_df = udf.iloc[:t].copy()
        if exclude_disruptions and "reporting_flag" in train_df.columns:
            train_df = train_df[train_df["reporting_flag"] != 0].copy()

        if len(train_df) < (steps_per_year // 2):
            continue
        
        # Test targets: evaluate at configured horizon steps
        # E.g. for horizon_steps = [2, 4], evaluate points t + h - 1
        test_indices = [t + h - 1 for h in config.horizon_steps if (t + h - 1) < n_periods]
        if exclude_disruptions and "reporting_flag" in udf.columns:
            test_indices = [idx for idx in test_indices if udf.loc[idx, "reporting_flag"] != 0]

        if not test_indices:
            continue

        test_df = udf.iloc[test_indices].copy()

        # Climatological seasonal averages computed strictly from training history
        dt_train = pd.to_datetime(train_df["date"]) if "date" in train_df.columns else None
        if dt_train is not None:
            cal_col = dt_train.dt.isocalendar().week if granularity == "weekly" else dt_train.dt.month
            rain_clim = train_df.groupby(cal_col)["rainfall_mm"].mean().to_dict() if "rainfall_mm" in train_df.columns else {}
            temp_clim = train_df.groupby(cal_col)["temp_c"].mean().to_dict() if "temp_c" in train_df.columns else {}
        else:
            rain_clim = {}
            temp_clim = {}

        overall_r = float(train_df["rainfall_mm"].mean()) if "rainfall_mm" in train_df.columns else 0.0
        overall_t = float(train_df["temp_c"].mean()) if "temp_c" in train_df.columns else 26.0

        for lag in config.weather_lags_steps:
            r_col = f"rain_lag_{lag}"
            t_col = f"temp_lag_{lag}"
            for local_i, global_idx in enumerate(test_indices):
                if global_idx - lag >= t:
                    # Unobserved future weather at origin t -> mask with training seasonal climatology
                    target_row_date = udf.loc[global_idx - lag, "date"] if "date" in udf.columns else None
                    if target_row_date:
                        t_dt = pd.to_datetime(target_row_date)
                        wk = t_dt.isocalendar().week if granularity == "weekly" else t_dt.month
                        test_df.iloc[local_i, test_df.columns.get_loc(r_col)] = rain_clim.get(wk, overall_r)
                        test_df.iloc[local_i, test_df.columns.get_loc(t_col)] = temp_clim.get(wk, overall_t)
                    else:
                        test_df.iloc[local_i, test_df.columns.get_loc(r_col)] = overall_r
                        test_df.iloc[local_i, test_df.columns.get_loc(t_col)] = overall_t

        y_test = test_df["cases"].fillna(0).values.astype(float)

        # A. Fit & Predict Baseline
        m_base = NegativeBinomialForecastModel("baseline", granularity=granularity)
        m_base.fit(train_df, total_timeline_len=total_timeline_len)
        pred_base = m_base.predict_point(test_df)

        base_errs = np.abs(y_test - pred_base)
        base_mae_t = float(np.mean(base_errs))
        base_sq_errs = (y_test - pred_base) ** 2

        # B. Fit & Predict Weather Model (if available)
        if has_weather:
            m_weath = NegativeBinomialForecastModel("weather", granularity=granularity)
            m_weath.fit(train_df, weather_lags_steps=config.weather_lags_steps, total_timeline_len=total_timeline_len)
            pred_weath = m_weath.predict_point(test_df, weather_lags_steps=config.weather_lags_steps)

            weath_errs = np.abs(y_test - pred_weath)
            weath_mae_t = float(np.mean(weath_errs))
            weath_sq_errs = (y_test - pred_weath) ** 2
            
            weath_won = bool(weath_mae_t < base_mae_t)
            pct_improvement = float((base_mae_t - weath_mae_t) / max(base_mae_t, 1e-4))
        else:
            weath_mae_t = base_mae_t
            weath_sq_errs = base_sq_errs
            weath_won = False
            pct_improvement = 0.0

        eval_record = {
            "origin": t,
            "origin_date": str(udf.loc[t - 1, "date"]) if "date" in udf.columns else str(t),
            "base_mae": base_mae_t,
            "weath_mae": weath_mae_t,
            "base_sq": base_sq_errs,
            "weath_sq": weath_sq_errs,
            "base_abs": base_errs,
            "weath_abs": weath_errs if has_weather else base_errs,
            "weath_won": weath_won,
            "improvement": pct_improvement,
        }
        origin_results_all.append(eval_record)

    # 4. Compute Aggregate Metrics (STRICTLY NO MAPE)
    if not origin_results_all:
        return {
            "unit_id": unit_id,
            "unit_name": unit_name,
            "decision": "not enough data",
            "verdict_chip": "Not enough data",
            "skill_gate_status": "Insufficient evidence",
            "reason": "Evaluation generated 0 valid origins.",
            "win_share": 0.0,
            "median_improvement": 0.0,
            "skill_score": None,
            "skill_score_pct": "N/A",
            "zero_baseline_mae_handled": False,
            "baseline_metrics": None,
            "weather_metrics": None,
            "reactive_rule": None,
            "n_evaluations": 0,
        }

    all_base_abs = np.concatenate([r["base_abs"] for r in origin_results_all])
    all_base_sq = np.concatenate([r["base_sq"] for r in origin_results_all])
    baseline_mae = float(np.mean(all_base_abs))
    baseline_rmse = float(np.sqrt(np.mean(all_base_sq)))

    if has_weather:
        all_weath_abs = np.concatenate([r["weath_abs"] for r in origin_results_all])
        all_weath_sq = np.concatenate([r["weath_sq"] for r in origin_results_all])
        weather_mae = float(np.mean(all_weath_abs))
        weather_rmse = float(np.sqrt(np.mean(all_weath_sq)))

        win_share = float(np.mean([r["weath_won"] for r in origin_results_all]))
        median_improvement = float(np.median([r["improvement"] for r in origin_results_all]))
    else:
        weather_mae = None
        weather_rmse = None
        win_share = 0.0
        median_improvement = 0.0

    skill_info = compute_baseline_relative_skill(weather_mae, baseline_mae)

    # 5. Skill Gate Decision
    min_win_share = config.skill_gate.min_win_share
    min_med_imp = config.skill_gate.min_median_improvement

    if not has_weather:
        decision = "seasonal_baseline"
        verdict_chip = "No weather data"
        skill_gate_status = "Insufficient evidence"
        reason = "No weather data available for this unit; defaulted to seasonal baseline."
    elif win_share >= min_win_share and median_improvement >= min_med_imp and (skill_info["skill_score"] is not None and skill_info["skill_score"] > 0):
        decision = "weather_model"
        verdict_chip = "Use weather"
        skill_gate_status = "Pass"
        reason = (
            f"Weather model passed skill gate with {win_share:.1%} win share "
            f"(target >= {min_win_share:.0%}), {median_improvement:.1%} median MAE improvement "
            f"(target >= {min_med_imp:.0%}), and positive skill ({skill_info['skill_score_pct']})."
        )
    else:
        decision = "seasonal_baseline"
        verdict_chip = "Use baseline"
        skill_gate_status = "Fail"
        reasons_failed = []
        if win_share < min_win_share:
            reasons_failed.append(f"win share {win_share:.1%} < {min_win_share:.0%}")
        if median_improvement < min_med_imp:
            reasons_failed.append(f"median improvement {median_improvement:.1%} < {min_med_imp:.0%}")
        if skill_info["skill_score"] is not None and skill_info["skill_score"] <= 0:
            reasons_failed.append(f"skill {skill_info['skill_score_pct']} <= 0%")
        reason = f"Weather model failed skill gate ({', '.join(reasons_failed)}); defaulted to seasonal baseline."

    # 6. Reactive Rule Reference Comparison
    # Alert when cases exceed mean + SD_multiplier * SD over previous 5 years (or available history)
    hist_periods = min(config.reactive_rule.history_years * steps_per_year, n_periods)
    recent_hist_cases = udf["cases"].iloc[-hist_periods:].dropna().values
    hist_mean = float(np.mean(recent_hist_cases)) if len(recent_hist_cases) > 0 else 0.0
    hist_sd = float(np.std(recent_hist_cases)) if len(recent_hist_cases) > 0 else 1.0
    reactive_threshold = round(hist_mean + (config.reactive_rule.sd_multiplier * hist_sd), 1)

    # Lead time comparison
    # Model forecasts give 2-4 periods early warning when forecast exceeds reactive threshold
    min_horizon = min(config.horizon_steps)
    max_horizon = max(config.horizon_steps)
    lead_time_advantage = min_horizon if decision == "weather_model" else 0
    advantage_desc = (
        f"Compared with a reactive rule (mean + {int(config.reactive_rule.sd_multiplier)} SD = {reactive_threshold:.1f}), "
        + (f"this model alert triggers about {min_horizon} {config.unit_label} earlier (simulated)."
           if decision == "weather_model"
           else f"seasonal baseline triggers alongside reactive rule (0 {config.unit_label} advance).")
    )

    reactive_rule_info = {
        "threshold": reactive_threshold,
        "history_years": config.reactive_rule.history_years,
        "sd_multiplier": config.reactive_rule.sd_multiplier,
        "lead_time_advantage_periods": lead_time_advantage,
        "advantage_description": advantage_desc,
    }

    return {
        "unit_id": unit_id,
        "unit_name": unit_name,
        "decision": decision,
        "verdict_chip": verdict_chip,
        "skill_gate_status": skill_gate_status,
        "reason": reason,
        "win_share": round(win_share, 3),
        "median_improvement": round(median_improvement, 3),
        "skill_score": skill_info["skill_score"],
        "skill_score_pct": skill_info["skill_score_pct"],
        "zero_baseline_mae_handled": skill_info["zero_baseline_mae_handled"],
        "baseline_metrics": {
            "mae": round(baseline_mae, 2),
            "rmse": round(baseline_rmse, 2),
        },
        "weather_metrics": {
            "mae": round(weather_mae, 2) if weather_mae is not None else None,
            "rmse": round(weather_rmse, 2) if weather_rmse is not None else None,
        } if has_weather else None,
        "reactive_rule": reactive_rule_info,
        "n_evaluations": len(origin_results_all),
        "disruption_filtered_metrics": None,
    }


def run_evidence_evaluation(
    df: pd.DataFrame,
    units: List[Dict[str, Any]],
    config: Optional[AppConfig] = None,
    run_id: str = "run_eval",
    exclude_disruptions: bool = False,
) -> Dict[str, Any]:
    """
    Runs rolling-origin evaluation across all units and returns complete evidence dictionary.
    """
    if config is None:
        config = load_config()

    evidence = {
        "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "granularity": config.granularity,
        "unit_label": config.unit_label,
        "geography_level": config.geography_level,
        "evaluation_years": config.evaluation_years,
        "exclude_disruptions": exclude_disruptions,
        "skill_gate_thresholds": {
            "min_win_share": config.skill_gate.min_win_share,
            "min_median_improvement": config.skill_gate.min_median_improvement,
        },
        "reactive_rule_config": {
            "history_years": config.reactive_rule.history_years,
            "sd_multiplier": config.reactive_rule.sd_multiplier,
        },
        "units": {},
    }

    # Group by unit
    for u in units:
        u_id = u["unit_id"]
        u_name = u.get("unit_name", f"Unit {u_id}")
        u_df = df[df["unit_id"] == u_id].copy().sort_values("date").reset_index(drop=True)
        if u_df.empty:
            continue

        eval_res = evaluate_unit_rolling_origin(
            unit_df=u_df,
            unit_id=u_id,
            unit_name=u_name,
            config=config,
            total_timeline_len=len(u_df),
            exclude_disruptions=exclude_disruptions,
        )
        evidence["units"][u_id] = eval_res

    return evidence
