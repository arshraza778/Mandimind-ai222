# Mitanin Signal: prototype spec

## What it is
A climate-informed malaria early-warning and action-tracking PROTOTYPE for Chhattisgarh. It forecasts risk, turns an alert into a task for frontline health workers, and records whether the task was done.

## Honesty rules (apply everywhere)
- All data is SIMULATED. Show a visible banner on every screen: "PROTOTYPE - SIMULATED DATA - sample names only".
- Never use the words "validated", "deployed" or "proven" in the UI or code comments.
- The 2-6 week lead time is a target, not a result. Label lead times "(target)".
- If the weather model does not beat the baseline, the system must say so and use the baseline.

## Scope (build)
1. Simulated data generator (6 sample blocks A-F in "Sample District").
2. Forecasting: seasonal baseline vs weather model, rolling time-ordered evaluation, skill gate.
3. Alerts with risk level (High/Medium/Low), confidence, forecast period, and which method was used.
4. Task workflow: alert -> task (owner, deadline, steps) -> Mitanin replies Done or Need help -> ledger.
5. 48-hour no-reply escalation to district (demo with a simulated clock).
6. Screens: Dashboard, Alert detail, Assign task, Task ledger, Model evidence, Mitanin mobile view.

## Planned, NOT built (show as "planned" in the UI where relevant)
Real SMS/IVR, Hindi/Chhattisgarhi messages, block-level real data, real case data, login/authentication.

## Stack
Backend: Python 3.11, FastAPI, SQLite (SQLAlchemy), pandas, numpy, statsmodels.
Frontend: React + Vite + TypeScript + Tailwind + Recharts.
Folders: backend/, frontend/, design/, spec.md, README.md.

## Design tokens
Ink #26215C, Purple #534AB7, Purple light #EEEDFE, Teal #0F6E56, Teal light #E1F5EE,
High/coral #C8472A on #FAECE7, Medium/amber #A8650A on #FAEEDA, Low/green #3B6D11 on #EAF3DE,
Background #F5F4FA, Border #E3E1EC, Text #1F1D2B, Muted #6B6880. Rounded corners 12-16px, clean cards, large readable text.
The design images in design/ are the visual reference. Match them when present.

## Quality rules
- Time-ordered evaluation only (no random train/test split).
- Fixed random seeds for simulated data.
- Add basic tests for the forecasting and escalation logic.
