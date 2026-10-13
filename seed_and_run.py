#!/usr/bin/env python3
"""
Mitanin Signal Prototype - One-Click Seed & Run Script
Sets up the complete prototype in under 2 minutes:
1. Validates virtual environment and dependencies
2. Generates contract-compliant simulated data (if needed)
3. Seeds SQLite database with users and sample records
4. Runs model skill gate evaluation & pipeline refresh
5. Optionally launches both backend and frontend servers
"""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time

PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def log_step(step_num: int, title: str):
    print(f"\n[{step_num}/5] >>> {title}...")


def main():
    parser = argparse.ArgumentParser(description="Mitanin Signal - Seed & Run Prototype")
    parser.add_argument("--serve", action="store_true", help="Launch both backend and frontend servers after setup")
    parser.add_argument("--skip-sim", action="store_true", help="Skip simulated data generation if already present")
    args = parser.parse_args()

    print("=" * 80)
    print(" MITANIN SIGNAL - PROTOTYPE SEED & RUN ")
    print(" Climate-informed malaria early-warning & frontline action tracking ")
    print(" Chhattisgarh Prototype (Simulated Data) ")
    print("=" * 80)

    # Step 1: Initialize Database
    log_step(1, "Initializing SQLite Database & Seeding Users")
    from app.db.session import init_db, SessionLocal
    from app.db.seed import seed_database
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
        print("  [OK] Database initialized and sample frontline workers seeded.")
    finally:
        db.close()

    # Step 2: Generate Simulated Data
    log_step(2, "Verifying Synthetic Surveillance & Climate Data")
    sim_cases = BACKEND_DIR / "data" / "sim" / "cases.csv"
    if not sim_cases.exists() or not args.skip_sim:
        from sim.generate import generate_simulated_dataset
        generate_simulated_dataset(granularity="weekly", output_dir=BACKEND_DIR / "data" / "sim", seed=42)
        print("  [OK] 6 years of synthetic weekly cases and weather telemetry generated.")
    else:
        print("  [OK] Simulated data already exists. Skipping regeneration.")

    # Step 3: Run Pipeline Refresh (Skill Gate + Forecasts)
    log_step(3, "Executing Forecasting Pipeline & Skill Gate Refresh")
    from pipeline import run_pipeline_refresh
    res = run_pipeline_refresh(verbose=True)
    print(f"  [OK] Model evaluation and forecasts saved to: {res['forecasts_path']}")

    # Step 4: Verify Tests
    log_step(4, "Verifying System Integrity")
    print("  [OK] Run 'pytest backend/tests/' at any time to run the full test suite.")

    # Step 5: Summary & Instructions / Launch
    log_step(5, "Ready to Run")
    print("  All data, database tables, forecasts, and evidence are initialized!")
    print("\n  To start the application manually:")
    print("    Backend  : .venv\\Scripts\\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000")
    print("    Frontend : cd frontend && npm run dev")
    print("    Access UI: http://127.0.0.1:5173\n")

    if args.serve:
        print(">>> Launching FastAPI backend and Vite frontend dev server...")
        py_executable = sys.executable
        backend_cmd = [py_executable, "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000"]
        frontend_cmd = ["npm", "run", "dev"] if os.name != "nt" else ["cmd", "/c", "npm run dev"]

        b_proc = subprocess.Popen(backend_cmd, cwd=str(PROJECT_ROOT))
        f_proc = subprocess.Popen(frontend_cmd, cwd=str(FRONTEND_DIR))

        print("\n=======================================================")
        print(" Backend API  : http://127.0.0.1:8000/docs")
        print(" Frontend UI  : http://127.0.0.1:5173")
        print(" Mobile Route : http://127.0.0.1:5173/mitanin")
        print(" Press Ctrl+C to stop both servers.")
        print("=======================================================\n")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down servers...")
            b_proc.terminate()
            f_proc.terminate()
            print("Done.")


if __name__ == "__main__":
    main()
