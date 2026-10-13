#!/usr/bin/env python3
"""
Mitanin Signal - Screen Capture Utility
Captures high-fidelity PNG screenshots of all prototype screens to docs/screens/
using headless Microsoft Edge / Chromium.

Screens captured:
1. docs/screens/01_dashboard.png
2. docs/screens/02_alert_detail.png
3. docs/screens/03_assign_task.png
4. docs/screens/04_task_ledger.png
5. docs/screens/05_mitanin_mobile.png
6. docs/screens/06_model_evidence.png
7. docs/screens/07_settings_data_status.png
"""

from pathlib import Path
import subprocess
import sys
import tempfile
import time

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "docs" / "screens"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Detect Edge executable on Windows
DEFAULT_EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_browser():
    for p in DEFAULT_EDGE_PATHS:
        if Path(p).is_file():
            return p
    # Fallback to PATH search for msedge or chrome
    for bin_name in ["msedge", "msedge.exe", "chrome", "chrome.exe", "chromium"]:
        res = subprocess.run(["where", bin_name], capture_output=True, text=True, shell=True)
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip().splitlines()[0]
    return None


def capture_all_screens(base_url: str = "http://127.0.0.1:5173"):
    browser = find_browser()
    if not browser:
        print("[ERROR] Microsoft Edge / Chrome executable not found on system.")
        sys.exit(1)

    print(f"Using browser: {browser}")
    print(f"Target URL   : {base_url}")
    print(f"Output Dir   : {OUTPUT_DIR}\n")

    screens = [
        {"name": "01_dashboard.png", "path": "#dashboard", "w": 1440, "h": 900, "label": "Dashboard"},
        {"name": "02_alert_detail.png", "path": "#alerts", "w": 1440, "h": 900, "label": "Alert Detail"},
        {"name": "03_assign_task.png", "path": "#tasks", "w": 1440, "h": 900, "label": "Assign Task Stepper"},
        {"name": "04_task_ledger.png", "path": "#ledger", "w": 1440, "h": 900, "label": "Task Ledger & Clock"},
        {"name": "05_mitanin_mobile.png", "path": "/mitanin", "w": 420, "h": 880, "label": "Mitanin Mobile View"},
        {"name": "06_model_evidence.png", "path": "#evidence", "w": 1440, "h": 900, "label": "Model Evidence & Skill Gate"},
        {"name": "07_settings_data_status.png", "path": "#settings", "w": 1440, "h": 900, "label": "Settings & Data Status"},
    ]

    with tempfile.TemporaryDirectory() as tmp_dir:
        for idx, sc in enumerate(screens, 1):
            target_url = f"{base_url.rstrip('/')}/{sc['path'].lstrip('/')}"
            out_path = OUTPUT_DIR / sc["name"]
            
            print(f"[{idx}/{len(screens)}] Capturing {sc['label']} -> {sc['name']}...")

            cmd = [
                browser,
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--hide-scrollbars",
                f"--user-data-dir={tmp_dir}",
                f"--window-size={sc['w']},{sc['h']}",
                "--virtual-time-budget=2000",
                f"--screenshot={str(out_path)}",
                target_url,
            ]

            try:
                res = subprocess.run(cmd, capture_output=True, timeout=20)
                if out_path.is_file() and out_path.stat().st_size > 1000:
                    print(f"    [OK] Saved ({out_path.stat().st_size // 1024} KB)")
                else:
                    print(f"    [WARN] Command finished but file check failed. Return code: {res.returncode}")
            except Exception as e:
                print(f"    [ERROR] Failed to capture {sc['name']}: {e}")

    print("\nAll screen captures complete! Files saved in docs/screens/")


if __name__ == "__main__":
    capture_all_screens()
