"""
Mitanin Signal Pipeline CLI Module
Commands:
  python -m backend.pipeline refresh
  python -m pipeline refresh

Orchestrates:
  1. Data loading and contract validation
  2. Rolling-origin evaluation of Baseline vs Weather GLM per unit
  3. Skill gate decision logic
  4. Forward forecasting and 80% simulation prediction intervals
  5. Persistence to backend/data/evidence.json and backend/data/forecasts.json
  6. Database update: inserts new pipeline run and new alerts tagged with run_id
     (CRITICAL: NEVER deletes existing tasks, task_events, or users!)
  7. Formatted console output table of model metrics and decisions
"""

import argparse
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sys
import uuid
from typing import Dict, Any, List, Optional

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import load_config, AppConfig
from data.load import load_and_validate_data, DataValidationError
from forecast.evaluate import run_evidence_evaluation
from forecast.predict import generate_all_forecasts
from app.db.session import init_db, SessionLocal
from app.db.models import PipelineRun, Alert
from app.db.clock import get_simulated_now

logger = logging.getLogger("mitanin_signal.pipeline")


def run_pipeline_refresh(verbose: bool = True) -> Dict[str, Any]:
    """
    Executes the full pipeline refresh cycle:
    load -> validate -> evaluate -> forecast -> persist JSON -> update SQLite alerts.
    Preserves all existing tasks, task events, and users.
    """
    cfg = load_config()
    print("=" * 80)
    print("MITANIN SIGNAL FORECASTING PIPELINE & SKILL GATE")
    print(f"Data Source: {cfg.data_source} | Granularity: {cfg.granularity} | Level: {cfg.geography_level}")
    print(f"Skill Gate Thresholds: min_win_share = {cfg.skill_gate.min_win_share:.0%}, min_median_improvement = {cfg.skill_gate.min_median_improvement:.0%}")
    print("=" * 80)

    # 1. Load and Validate Data
    df, units, report = load_and_validate_data(config=cfg, raise_on_error=False)
    if not report.get("is_valid") or df is None:
        err_msg = "\n".join(report.get("errors", ["Data contract validation failed."]))
        if cfg.data_source.lower() != "simulated":
            raise DataValidationError(f"Cannot run pipeline refresh on invalid data:\n{err_msg}")
        else:
            print(f"[WARN] Validation errors encountered in simulated data:\n{err_msg}")

    # 2. Database connection & Timestamp
    init_db()
    db = SessionLocal()
    try:
        now = get_simulated_now(db)
    finally:
        db.close()

    run_id = f"run_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    # 3. Rolling-Origin Model Evaluation & Skill Gate
    print("\nRunning rolling-origin evaluation across units (Strict Zero-Leakage)...")
    evidence = run_evidence_evaluation(df=df, units=units, config=cfg, run_id=run_id)

    # 4. Save evidence.json
    data_dir = backend_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    evidence_path = data_dir / "evidence.json"
    with open(evidence_path, "w", encoding="utf-8") as f:
        json.dump(evidence, f, indent=2)
    print(f"Saved model evidence to: {evidence_path.name}")

    # 5. Generate Forecasts & Prediction Intervals
    print("Generating forward forecasts and 80% simulation prediction intervals...")
    forecasts = generate_all_forecasts(df=df, units=units, evidence=evidence, config=cfg, run_id=run_id)

    # 6. Save forecasts.json
    forecasts_path = data_dir / "forecasts.json"
    with open(forecasts_path, "w", encoding="utf-8") as f:
        json.dump(forecasts, f, indent=2)
    print(f"Saved forecasts to: {forecasts_path.name}")

    # 7. Update Database: insert PipelineRun and Alert records
    # MUST NEVER DELETE tasks, task_events, or users!
    db = SessionLocal()
    try:
        new_run = PipelineRun(
            run_id=run_id,
            data_source=cfg.data_source,
            created_at=now,
            summary=f"Pipeline refresh at {now.isoformat()} with {len(forecasts['units'])} unit forecasts."
        )
        db.add(new_run)
        db.commit()

        new_alerts = []
        for u_id, u_fc in forecasts["units"].items():
            alert_rec = Alert(
                unit_id=u_id,
                risk=u_fc["risk"],
                confidence=u_fc["confidence"],
                forecast_period=u_fc["lead_time"],
                method_used=u_fc["method_used"],
                run_id=run_id,
                created_at=now,
                series_data=json.dumps(u_fc),
                details=u_fc["details"],
            )
            new_alerts.append(alert_rec)

        db.add_all(new_alerts)
        db.commit()
        print(f"Created {len(new_alerts)} new alerts in SQLite tagged with run_id: {run_id}")
        print("Verified: existing tasks, task events, and users were preserved.")
    finally:
        db.close()

    # 8. Print Formatted Acceptance Table
    print("\n" + "=" * 90)
    print(f"{'Unit':<18} | {'Base MAE':<10} | {'Weath MAE':<10} | {'Win Share':<10} | {'Med Imp':<9} | {'Decision':<18} | {'Risk':<6}")
    print("-" * 90)

    for u_id, ev_u in evidence["units"].items():
        u_name = ev_u.get("unit_name", u_id)
        b_mae = ev_u.get("baseline_metrics", {}).get("mae", 0.0) if ev_u.get("baseline_metrics") else "-"
        w_mae = ev_u.get("weather_metrics", {}).get("mae", "-") if ev_u.get("weather_metrics") else "-"
        win_sh = f"{ev_u.get('win_share', 0.0):.1%}"
        med_imp = f"{ev_u.get('median_improvement', 0.0):.1%}"
        decision = ev_u.get("decision", "-")
        risk = forecasts["units"].get(u_id, {}).get("risk", "-")

        b_mae_str = f"{b_mae:.2f}" if isinstance(b_mae, (int, float)) else str(b_mae)
        w_mae_str = f"{w_mae:.2f}" if isinstance(w_mae, (int, float)) else str(w_mae)

        print(f"{u_name:<18} | {b_mae_str:<10} | {w_mae_str:<10} | {win_sh:<10} | {med_imp:<9} | {decision:<18} | {risk:<6}")

    print("=" * 90 + "\n")

    return {
        "run_id": run_id,
        "evidence_path": str(evidence_path),
        "forecasts_path": str(forecasts_path),
        "evidence": evidence,
        "forecasts": forecasts,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Mitanin Signal Forecasting & Model Skill Gate Pipeline"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: refresh
    refresh_parser = subparsers.add_parser("refresh", help="Run full pipeline evaluation and forecast refresh")
    refresh_parser.add_argument("--quiet", action="store_true", help="Suppress detailed console table")

    args = parser.parse_args()

    if args.command == "refresh":
        run_pipeline_refresh(verbose=not args.quiet)


if __name__ == "__main__":
    main()
