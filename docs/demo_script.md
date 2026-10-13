# Mitanin Signal — 2-Minute Prototype Demo Walkthrough

This guide provides a crisp, timed 2-minute demonstration script for showcasing the Mitanin Signal malaria early-warning and frontline action-tracking prototype.

---

## Prerequisites (Pre-Flight Check)
Ensure both servers are running:
- **Backend API**: `http://127.0.0.1:8000/docs`
- **Frontend UI**: `http://127.0.0.1:5173`

Verify the top honesty banner is visible:
> `PROTOTYPE - SIMULATED DATA - sample names only`

---

## Demo Script Timeline (120 Seconds)

### 0:00 – 0:25 | 1. Executive Dashboard (`#dashboard`)
* **What to show**:
  1. Point out the top **Honesty Banner**: clarify that all surveillance numbers and names are synthetic to protect privacy.
  2. Review the **4 KPI Cards**: Active alerts, open tasks, reply rate within the 48h escalation window, and active weather-model units.
  3. Show the **Risk Overview Tiles**: highlight that Sample Block A and Block E trigger risk alerts with target lead times (`2-4 weeks (target)`).
  4. Point to the **Needs Action** list and click **"Details"** on Sample Block A.
* **Talking point**: *"Mitanin Signal combines climate indicators with historical surveillance to give block medical officers advance notice—always clearly marked as target lead times, not guaranteed predictions."*

---

### 0:25 – 0:45 | 2. Alert Detail Screen (`#alerts`)
* **What to show**:
  1. The **Forecast Cone**: 80% simulation prediction interval shaded with alert threshold line (mean + 2 SD).
  2. The **"Why this alert"** panel: shows environmental drivers (rainfall 3 weeks earlier, temperature 2 weeks earlier) only because the weather model passed the skill gate for this block.
  3. The **Skill Gate & Reactive Rule card**: shows that this alert triggers approximately 2 weeks earlier than a traditional reactive threshold.
  4. Click the primary action button: **"Assign task"**.
* **Talking point**: *"Unlike black-box models, each alert explains its physical drivers and compares itself against a reactive rule so supervisors know why the system triggered."*

---

### 0:45 – 1:05 | 3. Assign Task Stepper (`#tasks`)
* **What to show**:
  1. The **3-step stepper** (Alert Context → Task Details → Review & Send).
  2. Select a task template (e.g. *Fever testing* or *Spraying support*).
  3. Show the **Mitanin Picker**: shows frontline workers, open task workloads, and real-time availability badges.
  4. Look at the **Live Phone Preview** on the right: renders the exact SMS message the frontline Mitanin worker will receive.
  5. Click **"Confirm & assign task"**. The app immediately redirects to the Task Ledger.
* **Talking point**: *"Alerts without action change nothing. The system directly translates predictive risk into concrete frontline tasks assigned to local Mitanin health workers."*

---

### 1:05 – 1:25 | 4. Frontline Mitanin Mobile View (`/mitanin`)
* **What to show**:
  1. Switch to the mobile-first view (or navigate to `/mitanin`). Show the phone-like 420px frame.
  2. View the assigned task under **"My tasks"**.
  3. Tap into the task to view the 3 simple steps in large, legible typography.
  4. Point out the thumb-friendly, 56px action buttons: **"1 Done"** and **"2 Need help"**.
  5. Tap **"1 Done"**. Notice the instant visual feedback and confirmation.
* **Talking point**: *"Designed specifically for rural community health workers, the interface requires zero typing—just large, clear one-touch responses that feed straight back into the district ledger."*

---

### 1:25 – 1:45 | 5. Task Ledger & Simulated Clock (`#ledger`)
* **What to show**:
  1. Return to the **Task Ledger**: show the task now in the **"Done"** column.
  2. Click the task card to open the **Right-hand Audit Trail panel**: shows timestamped events (`task_created` and `mitanin_reply_done`).
  3. Demonstrate the **Simulated Clock Control**:
     - Find an unreplied task in the **"Sent"** column.
     - Click **"+48h (Escalation window)"** or **"+12h"**.
     - Watch the unanswered task immediately transition to **"Escalated"** with a red badge, accompanied by an `escalated_no_reply` audit event.
     - Click **"Reset"** to return the clock to baseline.
* **Talking point**: *"The audit ledger ensures supervisory accountability. The simulated clock demonstrates live that unaddressed alerts automatically escalate before opportunities for early intervention are lost."*

---

### 1:45 – 2:00 | 6. Model Evidence & Skill Gate (`#evidence`)
* **What to show**:
  1. Open the **Model Evidence** page.
  2. Point out the methodology note: *"Time-ordered evaluation: models are trained on earlier periods and tested on later ones."*
  3. Show the **Grouped Bar Chart**: compares Baseline MAE against Weather Model MAE across all 6 blocks.
  4. Show the **Verdict Chips**: point out that Block A and Block E show **"Use weather"**, whereas Block C and Block F show **"Use baseline"** because weather inputs failed the skill gate.
  5. Flip the **"Exclude reporting disruptions"** toggle: observe how error metrics and win shares immediately recompute live through the API.
* **Talking point**: *"If the weather model doesn't beat the baseline, it isn't used. The skill gate enforces scientific honesty: we only add complexity where it measurably improves accuracy."*

---

## Wrap-Up Summary
- **Honesty**: All synthetic data, lead time targets, and no overclaiming.
- **Workflow**: Closes the loop from climate forecast to frontline community action.
- **Verification**: Fully automated zero-leakage testing and end-to-end audit trails.
