"""
Database seeding module for initial prototype setup
Creates location hierarchy, sample users with hashed passwords, sample alerts,
seed tasks, field reports, and notifications.
"""

from datetime import datetime, timezone, timedelta
import json
from sqlalchemy.orm import Session
from app.db.models import (
    User,
    Alert,
    Task,
    TaskEvent,
    PipelineRun,
    LocationUnit,
    FieldReport,
    Notification,
    TranslatedTaskTemplate,
)
from app.db.clock import get_simulated_now
from app.auth import hash_password


LOCATION_SEED_DATA = [
    # Districts
    {
        "unit_id": "DIST_SAMPLE",
        "unit_name": "Sample District (Bastar Demo Region)",
        "level": "district",
        "parent_id": None,
        "forecast_unit_id": "BLK_A",
        "latitude": 21.25,
        "longitude": 81.63,
        "health_facility": json.dumps({
            "name": "District Hospital - Sample District [PROTOTYPE]",
            "type": "District Hospital (DH)",
            "phone": "104 / 07782-222000 (Sample)",
            "services": ["24x7 Malaria Microscopy & RDT", "Inpatient Severe Malaria Ward", "ACT & IV Artesunate Stock"],
        }),
    },
    {
        "unit_id": "DIST_SOUTH_BASTAR",
        "unit_name": "South Bastar Region [SAMPLE DISTRICT]",
        "level": "district",
        "parent_id": None,
        "forecast_unit_id": "BLK_E",
        "latitude": 19.10,
        "longitude": 81.35,
        "health_facility": json.dumps({
            "name": "Regional Civil Hospital - South Bastar [PROTOTYPE]",
            "type": "District Hospital (DH)",
            "phone": "104 / 07856-252100 (Sample)",
            "services": ["Rapid Diagnostic Testing", "Vector Control Dispatch Unit", "Emergency Referral Transport (108)"],
        }),
    },
    # Blocks under DIST_SAMPLE
    {
        "unit_id": "BLK_A",
        "unit_name": "Sample Block A",
        "level": "block",
        "parent_id": "DIST_SAMPLE",
        "forecast_unit_id": "BLK_A",
        "latitude": 21.32,
        "longitude": 81.66,
        "health_facility": json.dumps({
            "name": "Community Health Centre (CHC) - Sample Block A",
            "type": "Community Health Centre (CHC)",
            "phone": "104 / +91-7782-200101 (Sample)",
            "services": ["RDT & Blood Slide Lab", "3-Day ACT Blister Pack Dispensary", "LLIN Distribution Point"],
        }),
    },
    {
        "unit_id": "BLK_B",
        "unit_name": "Sample Block B",
        "level": "block",
        "parent_id": "DIST_SAMPLE",
        "forecast_unit_id": "BLK_B",
        "latitude": 21.21,
        "longitude": 81.54,
        "health_facility": json.dumps({
            "name": "Community Health Centre (CHC) - Sample Block B",
            "type": "Community Health Centre (CHC)",
            "phone": "104 / +91-7782-200102 (Sample)",
            "services": ["Fever Clinic & RDT", "Antimalarial Drug Store", "Larvicide Supply Unit"],
        }),
    },
    {
        "unit_id": "BLK_C",
        "unit_name": "Sample Block C",
        "level": "block",
        "parent_id": "DIST_SAMPLE",
        "forecast_unit_id": "BLK_C",
        "latitude": 21.36,
        "longitude": 81.71,
        "health_facility": json.dumps({
            "name": "Primary Health Centre (PHC) - Sample Block C",
            "type": "Primary Health Centre (PHC)",
            "phone": "104 / +91-7782-200103 (Sample)",
            "services": ["Routine Malaria Testing", "Mitanin Kit Replenishment"],
        }),
    },
    {
        "unit_id": "BLK_D",
        "unit_name": "Sample Block D",
        "level": "block",
        "parent_id": "DIST_SAMPLE",
        "forecast_unit_id": "BLK_D",
        "latitude": 21.14,
        "longitude": 81.61,
        "health_facility": json.dumps({
            "name": "Primary Health Centre (PHC) - Sample Block D",
            "type": "Primary Health Centre (PHC)",
            "phone": "104 / +91-7782-200104 (Sample)",
            "services": ["Outpatient Fever Screening", "RDT & Paracetamol/ACT Supply"],
        }),
    },
    {
        "unit_id": "BLK_E",
        "unit_name": "Sample Block E",
        "level": "block",
        "parent_id": "DIST_SAMPLE",
        "forecast_unit_id": "BLK_E",
        "latitude": 21.29,
        "longitude": 81.49,
        "health_facility": json.dumps({
            "name": "Community Health Centre (CHC) - Sample Block E (Forest Sector)",
            "type": "Community Health Centre (CHC)",
            "phone": "104 / +91-7782-200105 (Sample)",
            "services": ["24x7 Forest Sector Fever Triage", "RDT & Slide Microscopy", "Mobile Health Van Base"],
        }),
    },
    {
        "unit_id": "BLK_F",
        "unit_name": "Sample Block F",
        "level": "block",
        "parent_id": "DIST_SAMPLE",
        "forecast_unit_id": "BLK_F",
        "latitude": 21.09,
        "longitude": 81.77,
        "health_facility": json.dumps({
            "name": "Primary Health Centre (PHC) - Sample Block F",
            "type": "Primary Health Centre (PHC)",
            "phone": "104 / +91-7782-200106 (Sample)",
            "services": ["Routine Surveillance Lab", "Community Bednet Distribution"],
        }),
    },
    # Blocks under DIST_SOUTH_BASTAR (mapped to telemetry units BLK_E and BLK_F)
    {
        "unit_id": "BLK_SB_1",
        "unit_name": "Keshkal Forest Block [SAMPLE]",
        "level": "block",
        "parent_id": "DIST_SOUTH_BASTAR",
        "forecast_unit_id": "BLK_E",
        "latitude": 19.15,
        "longitude": 81.40,
        "health_facility": json.dumps({
            "name": "CHC Keshkal Forest [PROTOTYPE]",
            "type": "Community Health Centre (CHC)",
            "phone": "104 / +91-7856-200201 (Sample)",
            "services": ["RDT Screening", "ACT Therapy", "IRS Coordination"],
        }),
    },
    {
        "unit_id": "BLK_SB_2",
        "unit_name": "Makdi Valley Block [SAMPLE]",
        "level": "block",
        "parent_id": "DIST_SOUTH_BASTAR",
        "forecast_unit_id": "BLK_F",
        "latitude": 19.05,
        "longitude": 81.30,
        "health_facility": json.dumps({
            "name": "PHC Makdi Valley [PROTOTYPE]",
            "type": "Primary Health Centre (PHC)",
            "phone": "104 / +91-7856-200202 (Sample)",
            "services": ["Malaria RDT Clinic", "Mitanin Drug Depot"],
        }),
    },
    # Villages under BLK_A
    {"unit_id": "VIL_A1", "unit_name": "Sample Village A1 (Sector 4 Hamlet)", "level": "village", "parent_id": "BLK_A", "forecast_unit_id": "BLK_A", "latitude": 21.33, "longitude": 81.67},
    {"unit_id": "VIL_A2", "unit_name": "Sample Village A2 (Tokapal Tola)", "level": "village", "parent_id": "BLK_A", "forecast_unit_id": "BLK_A", "latitude": 21.31, "longitude": 81.65},
    {"unit_id": "VIL_A3", "unit_name": "Sample Village A3 (Keslur Hamlet)", "level": "village", "parent_id": "BLK_A", "forecast_unit_id": "BLK_A", "latitude": 21.34, "longitude": 81.68},
    # Villages under BLK_B
    {"unit_id": "VIL_B1", "unit_name": "Sample Village B1 (Kanger Hamlet)", "level": "village", "parent_id": "BLK_B", "forecast_unit_id": "BLK_B", "latitude": 21.22, "longitude": 81.55},
    {"unit_id": "VIL_B2", "unit_name": "Sample Village B2 (Neganar Tola)", "level": "village", "parent_id": "BLK_B", "forecast_unit_id": "BLK_B", "latitude": 21.20, "longitude": 81.53},
    {"unit_id": "VIL_B3", "unit_name": "Sample Village B3 (Darbha Camp)", "level": "village", "parent_id": "BLK_B", "forecast_unit_id": "BLK_B", "latitude": 21.19, "longitude": 81.56},
    # Villages under BLK_C
    {"unit_id": "VIL_C1", "unit_name": "Sample Village C1 (Karpawand)", "level": "village", "parent_id": "BLK_C", "forecast_unit_id": "BLK_C", "latitude": 21.37, "longitude": 81.72},
    {"unit_id": "VIL_C2", "unit_name": "Sample Village C2 (Muli Hamlet)", "level": "village", "parent_id": "BLK_C", "forecast_unit_id": "BLK_C", "latitude": 21.35, "longitude": 81.70},
    {"unit_id": "VIL_C3", "unit_name": "Sample Village C3 (Bhanpuri)", "level": "village", "parent_id": "BLK_C", "forecast_unit_id": "BLK_C", "latitude": 21.38, "longitude": 81.73},
    # Villages under BLK_D
    {"unit_id": "VIL_D1", "unit_name": "Sample Village D1 (Chitrakote)", "level": "village", "parent_id": "BLK_D", "forecast_unit_id": "BLK_D", "latitude": 21.15, "longitude": 81.62},
    {"unit_id": "VIL_D2", "unit_name": "Sample Village D2 (Mardoom)", "level": "village", "parent_id": "BLK_D", "forecast_unit_id": "BLK_D", "latitude": 21.13, "longitude": 81.60},
    {"unit_id": "VIL_D3", "unit_name": "Sample Village D3 (Badanjee)", "level": "village", "parent_id": "BLK_D", "forecast_unit_id": "BLK_D", "latitude": 21.16, "longitude": 81.63},
    # Villages under BLK_E
    {"unit_id": "VIL_E1", "unit_name": "Sample Village E1 (Forest Hamlet)", "level": "village", "parent_id": "BLK_E", "forecast_unit_id": "BLK_E", "latitude": 21.30, "longitude": 81.50},
    {"unit_id": "VIL_E2", "unit_name": "Sample Village E2 (Bade Rajpur)", "level": "village", "parent_id": "BLK_E", "forecast_unit_id": "BLK_E", "latitude": 21.28, "longitude": 81.48},
    {"unit_id": "VIL_E3", "unit_name": "Sample Village E3 (Pharasgaon)", "level": "village", "parent_id": "BLK_E", "forecast_unit_id": "BLK_E", "latitude": 21.27, "longitude": 81.51},
    # Villages under BLK_F
    {"unit_id": "VIL_F1", "unit_name": "Sample Village F1 (Shampur)", "level": "village", "parent_id": "BLK_F", "forecast_unit_id": "BLK_F", "latitude": 21.10, "longitude": 81.78},
    {"unit_id": "VIL_F2", "unit_name": "Sample Village F2 (Hirapur)", "level": "village", "parent_id": "BLK_F", "forecast_unit_id": "BLK_F", "latitude": 21.08, "longitude": 81.76},
    {"unit_id": "VIL_F3", "unit_name": "Sample Village F3 (Banskot)", "level": "village", "parent_id": "BLK_F", "forecast_unit_id": "BLK_F", "latitude": 21.11, "longitude": 81.79},
    # Villages under BLK_SB_1 & BLK_SB_2
    {"unit_id": "VIL_SB1_1", "unit_name": "Dhanora Forest Tola [SAMPLE]", "level": "village", "parent_id": "BLK_SB_1", "forecast_unit_id": "BLK_E", "latitude": 19.16, "longitude": 81.41},
    {"unit_id": "VIL_SB1_2", "unit_name": "Pipra Creek Hamlet [SAMPLE]", "level": "village", "parent_id": "BLK_SB_1", "forecast_unit_id": "BLK_E", "latitude": 19.14, "longitude": 81.39},
    {"unit_id": "VIL_SB2_1", "unit_name": "Makdi Central Hamlet [SAMPLE]", "level": "village", "parent_id": "BLK_SB_2", "forecast_unit_id": "BLK_F", "latitude": 19.06, "longitude": 81.31},
    {"unit_id": "VIL_SB2_2", "unit_name": "Borgaon Tola [SAMPLE]", "level": "village", "parent_id": "BLK_SB_2", "forecast_unit_id": "BLK_F", "latitude": 19.04, "longitude": 81.29},
]


USER_CREDENTIALS_SPEC = [
    {
        "name": "Officer R. Sharma [SAMPLE DISTRICT CHIEF]",
        "username": "sharma",
        "password": "password123",
        "role": "district_officer",
        "unit_id": "DIST_SAMPLE",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_A",
        "village_id": "VIL_A1",
        "phone": "+91-94000-10001",
        "designation": "District Malaria Officer (Supervisor)",
    },
    {
        "name": "Supervisor K. Verma [SAMPLE SUPERVISOR BLK A]",
        "username": "verma",
        "password": "password123",
        "role": "block_supervisor",
        "unit_id": "BLK_A",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_A",
        "village_id": "VIL_A1",
        "phone": "+91-94000-10002",
        "designation": "Block Malaria Supervisor — Sample Block A",
    },
    {
        "name": "Supervisor P. Patel [SAMPLE SUPERVISOR BLK B]",
        "username": "patel",
        "password": "password123",
        "role": "block_supervisor",
        "unit_id": "BLK_B",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_B",
        "village_id": "VIL_B1",
        "phone": "+91-94000-10003",
        "designation": "Block Malaria Supervisor — Sample Block B",
    },
    {
        "name": "Mitanin Asha [SAMPLE]",
        "username": "asha",
        "password": "password123",
        "role": "mitanin",
        "unit_id": "BLK_A",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_A",
        "village_id": "VIL_A1",
        "phone": "+91-94000-20001",
        "designation": "Community Health Worker (Mitanin) — Sector 4 Hamlet",
    },
    {
        "name": "Mitanin Rekha [SAMPLE]",
        "username": "rekha",
        "password": "password123",
        "role": "mitanin",
        "unit_id": "BLK_A",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_A",
        "village_id": "VIL_A2",
        "phone": "+91-94000-20002",
        "designation": "Community Health Worker (Mitanin) — Tokapal Tola",
    },
    {
        "name": "Mitanin Sunita [SAMPLE]",
        "username": "sunita",
        "password": "password123",
        "role": "mitanin",
        "unit_id": "BLK_B",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_B",
        "village_id": "VIL_B1",
        "phone": "+91-94000-20003",
        "designation": "Community Health Worker (Mitanin) — Kanger Hamlet",
    },
    {
        "name": "Mitanin Anita [SAMPLE]",
        "username": "anita",
        "password": "password123",
        "role": "mitanin",
        "unit_id": "BLK_A",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_A",
        "village_id": "VIL_A3",
        "phone": "+91-94000-20004",
        "designation": "Community Health Worker (Mitanin) — Keslur Hamlet",
    },
    {
        "name": "Mitanin Meena [SAMPLE]",
        "username": "meena",
        "password": "password123",
        "role": "mitanin",
        "unit_id": "BLK_E",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_E",
        "village_id": "VIL_E1",
        "phone": "+91-94000-20005",
        "designation": "Community Health Worker (Mitanin) — Forest Hamlet",
    },
    {
        "name": "Mitanin Radha [SAMPLE]",
        "username": "radha",
        "password": "password123",
        "role": "mitanin",
        "unit_id": "BLK_C",
        "district_id": "DIST_SAMPLE",
        "block_id": "BLK_C",
        "village_id": "VIL_C1",
        "phone": "+91-94000-20006",
        "designation": "Community Health Worker (Mitanin) — Karpawand",
    },
]


def seed_database(db: Session):
    """Seeds official LGD location hierarchy, demo locations, users with hashed passwords, alerts, tasks, reports, and notifications."""
    from app.lgd_locations import import_lgd_locations_to_db

    # 0. Seed legacy demo locations (marked is_demo=True) and import official Chhattisgarh LGD dataset (33 districts, 146 blocks)
    existing_loc_ids = {loc.unit_id for loc in db.query(LocationUnit).all()}
    new_locs = []
    for loc_spec in LOCATION_SEED_DATA:
        if loc_spec["unit_id"] not in existing_loc_ids:
            spec_copy = dict(loc_spec)
            spec_copy["is_demo"] = True
            new_locs.append(LocationUnit(**spec_copy))
    if new_locs:
        db.add_all(new_locs)
        db.commit()

    import_lgd_locations_to_db(db)

    # 1. Seed or Upgrade Sample Users with hashed passwords and location assignments
    existing_users = db.query(User).all()
    if len(existing_users) == 0:
        for u_spec in USER_CREDENTIALS_SPEC:
            u = User(
                name=u_spec["name"],
                username=u_spec["username"],
                password_hash=hash_password(u_spec["password"], salt=f"seed_{u_spec['username']}"),
                role=u_spec["role"],
                unit_id=u_spec["unit_id"],
                district_id=u_spec["district_id"],
                block_id=u_spec["block_id"],
                village_id=u_spec["village_id"],
                phone=u_spec["phone"],
                designation=u_spec["designation"],
            )
            db.add(u)
        db.commit()
    else:
        # Backfill credentials & location hierarchy on existing users if missing
        spec_by_name = {s["name"]: s for s in USER_CREDENTIALS_SPEC}
        updated_any = False
        for u in existing_users:
            spec = spec_by_name.get(u.name)
            if spec:
                if not u.username:
                    u.username = spec["username"]
                    updated_any = True
                if not u.password_hash:
                    u.password_hash = hash_password(spec["password"], salt=f"seed_{spec['username']}")
                    updated_any = True
                if not u.district_id:
                    u.district_id = spec["district_id"]
                    updated_any = True
                if not u.block_id:
                    u.block_id = spec["block_id"]
                    updated_any = True
                if not u.village_id:
                    u.village_id = spec["village_id"]
                    updated_any = True
                if not u.phone:
                    u.phone = spec["phone"]
                    updated_any = True
                if not u.designation:
                    u.designation = spec["designation"]
                    updated_any = True
                # Fix Sunita's unit_id to BLK_B if needed, or preserve
        if updated_any:
            db.commit()

    # Link supervisor_id for Mitanin users
    verma = db.query(User).filter(User.username == "verma").first()
    patel = db.query(User).filter(User.username == "patel").first()
    sharma = db.query(User).filter(User.username == "sharma").first()
    for u in db.query(User).filter(User.role == "mitanin").all():
        if not u.supervisor_id:
            if u.block_id == "BLK_A" and verma:
                u.supervisor_id = verma.id
            elif u.block_id == "BLK_B" and patel:
                u.supervisor_id = patel.id
            elif sharma:
                u.supervisor_id = sharma.id
    db.commit()

    # 2. Seed Initial Hand-Crafted Sample Alerts if none exist
    if db.query(Alert).count() == 0:
        now = get_simulated_now(db)
        run_id = "run_sample_init"

        run = db.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
        if not run:
            run = PipelineRun(
                run_id=run_id,
                data_source="simulated",
                created_at=now,
                summary="Initial bootstrap sample run with hand-crafted prototype alerts."
            )
            db.add(run)
            db.commit()

        alerts_config = [
            {
                "unit_id": "BLK_A",
                "risk": "High",
                "confidence": 0.85,
                "forecast_period": "3-4 wks (target)",
                "method_used": "weather_model",
                "details": "SAMPLE ALERT - Weather model indicates high anomaly risk (+38% above seasonal baseline).",
                "sparkline": [18, 22, 28, 35, 42, 50],
                "lead_time": "3-4 wks (target)",
            },
            {
                "unit_id": "BLK_B",
                "risk": "Medium",
                "confidence": 0.72,
                "forecast_period": "2-3 wks (target)",
                "method_used": "weather_model",
                "details": "SAMPLE ALERT - Weather model shows moderate surge in vector transmission.",
                "sparkline": [12, 14, 16, 20, 24, 28],
                "lead_time": "2-3 wks (target)",
            },
            {
                "unit_id": "BLK_C",
                "risk": "Low",
                "confidence": 0.65,
                "forecast_period": "-",
                "method_used": "seasonal_baseline",
                "details": "SAMPLE ALERT - Weather model failed skill gate; baseline indicates normal endemic transmission.",
                "sparkline": [15, 13, 16, 12, 14, 11],
                "lead_time": "-",
            },
            {
                "unit_id": "BLK_D",
                "risk": "Low",
                "confidence": 0.68,
                "forecast_period": "-",
                "method_used": "weather_model",
                "details": "SAMPLE ALERT - Low climate risk, transmission index remains low.",
                "sparkline": [10, 15, 8, 14, 11, 9],
                "lead_time": "-",
            },
            {
                "unit_id": "BLK_E",
                "risk": "Medium",
                "confidence": 0.70,
                "forecast_period": "3-4 wks (target)",
                "method_used": "weather_model",
                "details": "SAMPLE ALERT - Climate index triggered medium risk threshold.",
                "sparkline": [14, 16, 19, 23, 27, 32],
                "lead_time": "3-4 wks (target)",
            },
            {
                "unit_id": "BLK_F",
                "risk": "Low",
                "confidence": 0.60,
                "forecast_period": "-",
                "method_used": "seasonal_baseline",
                "details": "SAMPLE ALERT - Standard seasonal baseline within expected variation.",
                "sparkline": [16, 14, 15, 12, 11, 13],
                "lead_time": "-",
            },
        ]

        series_template = {
            "historical": [
                {"period": "W-4", "actual": 22},
                {"period": "W-3", "actual": 26},
                {"period": "W-2", "actual": 34},
                {"period": "W-1", "actual": 42},
            ],
            "forecast": [
                {"period": "W+1 (target)", "baseline": 30, "model": 48, "ci_lower": 38, "ci_upper": 58},
                {"period": "W+2 (target)", "baseline": 32, "model": 52, "ci_lower": 41, "ci_upper": 64},
                {"period": "W+3 (target)", "baseline": 34, "model": 55, "ci_lower": 43, "ci_upper": 68},
                {"period": "W+4 (target)", "baseline": 35, "model": 53, "ci_lower": 40, "ci_upper": 66},
            ]
        }

        created_alerts = []
        for ac in alerts_config:
            s_data = dict(series_template)
            s_data["sparkline"] = ac["sparkline"]
            s_data["lead_time"] = ac["lead_time"]

            alert = Alert(
                unit_id=ac["unit_id"],
                risk=ac["risk"],
                confidence=ac["confidence"],
                forecast_period=ac["forecast_period"],
                method_used=ac["method_used"],
                run_id=run_id,
                created_at=now,
                series_data=json.dumps(s_data),
                details=ac["details"],
            )
            created_alerts.append(alert)

        db.add_all(created_alerts)
        db.commit()

    # 3. Seed Sample Tasks matching dashboard KPI state if empty
    user_by_name = {u.name: u for u in db.query(User).all()}
    now = get_simulated_now(db)
    alerts = db.query(Alert).all()
    alert_map = {a.unit_id: a.id for a in alerts}

    if db.query(Task).count() == 0:
        tasks_to_create = [
            {
                "alert_id": alert_map.get("BLK_A"),
                "title": "Distribute RDT kits & fever screen in Sector 4",
                "description": "High-priority door-to-door fever screening and RDT kit distribution in Sector 4 Hamlet following elevated rainfall lag signal.",
                "instructions": "Visit at least 15 households in Sector 4 Hamlet, test all fever cases with bivalent RDT kits, and log slide numbers.",
                "steps": json.dumps(["Survey Sector 4 households", "Administer rapid diagnostic tests", "Report positive cases"]),
                "owner": "Mitanin Anita [SAMPLE]",
                "priority": "High",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_A",
                "village_id": "VIL_A3",
                "location_name": "Sample District · Sample Block A · Sample Village A3 (Keslur Hamlet)",
                "status": "sent",
                "created_at": now - timedelta(hours=14),
                "deadline": now + timedelta(hours=34),
            },
            {
                "alert_id": alert_map.get("BLK_E"),
                "title": "Verify LLIN bednet coverage in high-risk hamlets",
                "description": "Audit Long-Lasting Insecticidal Net (LLIN) usage and physical condition across vulnerable forest fringe households.",
                "instructions": "Inspect bednets in 25 households, prioritize pregnant women and children under 5, and record replacement needs.",
                "steps": json.dumps(["Check 25 households in Forest Hamlet", "Record net usage and damage", "Requisition replacements"]),
                "owner": "Mitanin Meena [SAMPLE]",
                "priority": "Medium",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_E",
                "village_id": "VIL_E1",
                "location_name": "Sample District · Sample Block E · Sample Village E1 (Forest Hamlet)",
                "status": "sent",
                "created_at": now - timedelta(hours=8),
                "deadline": now + timedelta(hours=40),
            },
            {
                "alert_id": alert_map.get("BLK_B"),
                "title": "Inspect water bodies for larval breeding",
                "description": "Environmental vector control sweep around post-monsoon stagnant water pools and drainage channels.",
                "instructions": "Survey perimeter ditches and handpump runoff pools; apply biological larvicide where mosquito larvae are observed.",
                "steps": json.dumps(["Check stagnant drainage ditches", "Apply biological larvicide if positive"]),
                "owner": "Mitanin Sunita [SAMPLE]",
                "priority": "Medium",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_B",
                "village_id": "VIL_B1",
                "location_name": "Sample District · Sample Block B · Sample Village B1 (Kanger Hamlet)",
                "status": "acknowledged",
                "created_at": now - timedelta(hours=20),
                "deadline": now + timedelta(hours=28),
            },
            {
                "alert_id": alert_map.get("BLK_A"),
                "title": "Follow up confirmed falciparum cases",
                "description": "Ensure full 3-day Artemisinin-based Combination Therapy (ACT) adherence and screen household contacts.",
                "instructions": "Check blister pack completion for index patients and perform temperature/RDT check on family members.",
                "steps": json.dumps(["Ensure full 3-day ACT course completion", "Check household contacts for fever"]),
                "owner": "Mitanin Anita [SAMPLE]",
                "priority": "High",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_A",
                "village_id": "VIL_A3",
                "location_name": "Sample District · Sample Block A · Sample Village A3 (Keslur Hamlet)",
                "status": "done",
                "completion_notes": "All 3 patients completed full ACT regimen; 8 household contacts screened negative.",
                "evidence_attachment": "ACT_Followup_Register_BLK_A.pdf (Verified)",
                "created_at": now - timedelta(hours=36),
                "deadline": now + timedelta(hours=12),
            },
            {
                "alert_id": alert_map.get("BLK_B"),
                "title": "Community fever alert camp coordination",
                "description": "Organize village health sanitation committee (VHSNC) awareness and fever screening camp.",
                "instructions": "Coordinate with Sarpanch and ANM to set up RDT screening desk at Panchayat Bhawan.",
                "steps": json.dumps(["Notify village leaders", "Conduct mass screening camp at Panchayat hall"]),
                "owner": "Mitanin Sunita [SAMPLE]",
                "priority": "Low",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_B",
                "village_id": "VIL_B1",
                "location_name": "Sample District · Sample Block B · Sample Village B1 (Kanger Hamlet)",
                "status": "done",
                "completion_notes": "42 villagers attended camp; 6 RDTs performed, 0 positive.",
                "evidence_attachment": "Panchayat_Camp_Tally_Sheet.jpg",
                "created_at": now - timedelta(hours=42),
                "deadline": now + timedelta(hours=6),
            },
            {
                "alert_id": alert_map.get("BLK_A"),
                "title": "Active fever surveillance & stagnant water clearance — Sector 4",
                "description": "Targeted household fever check and larval source elimination in Sector 4 Hamlet.",
                "instructions": "Visit 12 high-risk homes near stream embankment, test febrile individuals, and guide container drainage.",
                "steps": json.dumps(["Visit 12 homes in Sector 4 Hamlet", "Conduct RDT on any fever cases", "Clear stagnant water containers"]),
                "owner": "Mitanin Asha [SAMPLE]",
                "priority": "High",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_A",
                "village_id": "VIL_A1",
                "location_name": "Sample District · Sample Block A · Sample Village A1 (Sector 4 Hamlet)",
                "status": "sent",
                "created_at": now - timedelta(hours=10),
                "deadline": now + timedelta(hours=24),
            },
            {
                "alert_id": alert_map.get("BLK_A"),
                "title": "Pre-monsoon LLIN bednet audit — Tokapal Tola",
                "description": "Household verification of insecticide-treated bednet usage in Tokapal Tola.",
                "instructions": "Check net hanging status in 15 homes and demonstrate evening mosquito net discipline.",
                "steps": json.dumps(["Inspect 15 homes in Tokapal Tola", "Record torn nets needing replacement"]),
                "owner": "Mitanin Rekha [SAMPLE]",
                "priority": "Medium",
                "district_id": "DIST_SAMPLE",
                "block_id": "BLK_A",
                "village_id": "VIL_A2",
                "location_name": "Sample District · Sample Block A · Sample Village A2 (Tokapal Tola)",
                "status": "acknowledged",
                "created_at": now - timedelta(hours=16),
                "deadline": now + timedelta(hours=20),
            },
        ]

        for t_spec in tasks_to_create:
            owner_user = user_by_name.get(t_spec["owner"])
            task = Task(
                alert_id=t_spec["alert_id"],
                title=t_spec["title"],
                description=t_spec["description"],
                instructions=t_spec["instructions"],
                steps=t_spec["steps"],
                owner=t_spec["owner"],
                owner_id=owner_user.id if owner_user else None,
                assigned_by="Supervisor K. Verma [SAMPLE SUPERVISOR BLK A]" if t_spec["block_id"] == "BLK_A" else "Supervisor P. Patel [SAMPLE SUPERVISOR BLK B]",
                priority=t_spec["priority"],
                district_id=t_spec["district_id"],
                block_id=t_spec["block_id"],
                village_id=t_spec["village_id"],
                location_name=t_spec["location_name"],
                status=t_spec["status"],
                completion_notes=t_spec.get("completion_notes"),
                evidence_attachment=t_spec.get("evidence_attachment"),
                created_at=t_spec["created_at"],
                updated_at=t_spec["created_at"],
                deadline=t_spec["deadline"],
            )
            db.add(task)
            db.commit()
            db.refresh(task)

            ev1 = TaskEvent(
                task_id=task.id,
                event="task_created",
                actor=task.assigned_by or "Supervisor [SAMPLE]",
                timestamp=t_spec["created_at"],
                notes="Initial task dispatch."
            )
            db.add(ev1)

            if t_spec["status"] == "acknowledged":
                ev2 = TaskEvent(
                    task_id=task.id,
                    event="status_changed_to_acknowledged",
                    actor=t_spec["owner"],
                    timestamp=t_spec["created_at"] + timedelta(hours=2),
                    notes="Frontline worker acknowledged task assignment."
                )
                db.add(ev2)
            elif t_spec["status"] == "done":
                ev2 = TaskEvent(
                    task_id=task.id,
                    event="mitanin_reply_done",
                    actor=t_spec["owner"],
                    timestamp=t_spec["created_at"] + timedelta(hours=18),
                    notes=t_spec.get("completion_notes") or "Completed on schedule."
                )
                db.add(ev2)

            db.commit()
    else:
        # Backfill location/priority metadata on existing tasks if missing
        existing_tasks = db.query(Task).all()
        updated_tasks = False
        for t in existing_tasks:
            owner_user = user_by_name.get(t.owner)
            expected_owner_id = owner_user.id if owner_user else None
            if t.owner_id != expected_owner_id:
                t.owner_id = expected_owner_id
                updated_tasks = True
            if not t.district_id:
                t.district_id = "DIST_SAMPLE"
                updated_tasks = True
            if not t.block_id:
                if t.alert and t.alert.unit_id:
                    t.block_id = t.alert.unit_id
                elif owner_user and owner_user.block_id:
                    t.block_id = owner_user.block_id
                else:
                    t.block_id = "BLK_A"
                updated_tasks = True
            if not t.village_id:
                if owner_user and owner_user.village_id:
                    t.village_id = owner_user.village_id
                else:
                    t.village_id = f"VIL_{t.block_id[-1]}1" if t.block_id and t.block_id.startswith("BLK_") else "VIL_A1"
                updated_tasks = True
            if not t.priority:
                t.priority = "High" if t.block_id == "BLK_A" else "Medium"
                updated_tasks = True
            if not t.description:
                t.description = f"Field response action for {t.title} in {t.block_id}."
                updated_tasks = True
            if not t.instructions:
                try:
                    steps_list = json.loads(t.steps)
                    t.instructions = " · ".join(steps_list)
                except Exception:
                    t.instructions = t.steps
                updated_tasks = True
            if not t.location_name:
                t.location_name = f"Sample District · {t.block_id} · {t.village_id}"
                updated_tasks = True
        if updated_tasks:
            db.commit()

        # Ensure Mitanin Asha has at least one assigned task in existing DB
        asha_user = user_by_name.get("Mitanin Asha [SAMPLE]")
        if asha_user:
            asha_task_count = db.query(Task).filter(Task.owner.ilike("%Asha%")).count()
            if asha_task_count == 0:
                t_asha = Task(
                    alert_id=alert_map.get("BLK_A"),
                    title="Active fever surveillance & stagnant water clearance — Sector 4",
                    description="Targeted household fever check and larval source elimination in Sector 4 Hamlet.",
                    instructions="Visit 12 high-risk homes near stream embankment, test febrile individuals, and guide container drainage.",
                    steps=json.dumps(["Visit 12 homes in Sector 4 Hamlet", "Conduct RDT on any fever cases", "Clear stagnant water containers"]),
                    owner="Mitanin Asha [SAMPLE]",
                    owner_id=asha_user.id,
                    assigned_by="Supervisor K. Verma [SAMPLE SUPERVISOR BLK A]",
                    priority="High",
                    district_id="DIST_SAMPLE",
                    block_id="BLK_A",
                    village_id="VIL_A1",
                    location_name="Sample District · Sample Block A · Sample Village A1 (Sector 4 Hamlet)",
                    status="sent",
                    created_at=now - timedelta(hours=10),
                    updated_at=now - timedelta(hours=10),
                    deadline=now + timedelta(hours=24),
                )
                db.add(t_asha)
                db.commit()
                db.refresh(t_asha)
                db.add(TaskEvent(
                    task_id=t_asha.id,
                    event="task_created",
                    actor="Supervisor K. Verma [SAMPLE SUPERVISOR BLK A]",
                    timestamp=now - timedelta(hours=10),
                    notes="Initial task dispatch to Mitanin Asha."
                ))
                db.commit()

    # 3b. Ensure deduplicated Multi-Disease Alerts (dengue, diarrhoea, heat) and enrich malaria alerts
    now = get_simulated_now(db)
    latest_run = db.query(PipelineRun).order_by(PipelineRun.created_at.desc(), PipelineRun.run_id.desc()).first()
    active_run_id = latest_run.run_id if latest_run else "run_sample_init"

    # Backfill disease_type and trigger_reason on any existing alerts
    for a in db.query(Alert).all():
        changed_a = False
        if not a.disease_type:
            a.disease_type = "malaria"
            changed_a = True
        if not a.trigger_reason:
            a.trigger_reason = a.details or f"Forecast exceeded threshold for {a.disease_type} in {a.unit_id}."
            changed_a = True
        if not a.recommended_actions:
            a.recommended_actions = json.dumps([
                "Conduct active household screening in high-risk hamlets",
                "Verify diagnostic and treatment stock at village sub-centre",
                "Coordinate environmental vector/water source control",
            ])
            changed_a = True
        if changed_a:
            db.add(a)
    db.commit()

    multi_disease_alert_specs = [
        # Dengue alerts
        {
            "unit_id": "BLK_B",
            "disease_type": "dengue",
            "risk": "High",
            "confidence": 0.83,
            "forecast_period": "2-4 wks (target)",
            "method_used": "weather_model",
            "details": "SAMPLE DENGUE ALERT - Post-monsoon Aedes container-breeding suitability (74/100) and rising case cluster in Sample Block B.",
            "trigger_reason": "Forecast weekly dengue cases (24/wk) exceed block threshold (19/wk) with high Aedes breeding suitability (74/100).",
            "recommended_actions": [
                "Execute door-to-door domestic water container inspection and emptying",
                "Apply biological larvicide to non-drainable peri-domestic water bodies",
                "Refer acute febrile cases with retro-orbital/joint pain for NS1/IgM testing at CHC",
            ],
            "sparkline": [8, 11, 14, 17, 21, 24],
        },
        {
            "unit_id": "BLK_A",
            "disease_type": "dengue",
            "risk": "Medium",
            "confidence": 0.76,
            "forecast_period": "2-4 wks (target)",
            "method_used": "weather_model",
            "details": "SAMPLE DENGUE ALERT - Moderate Aedes breeding suitability (58/100) following intermittent rainfall in Sample Block A.",
            "trigger_reason": "Aedes container-breeding suitability index reached 58/100 with moderate post-monsoon case trajectory.",
            "recommended_actions": [
                "Conduct weekly household dry-day container emptying campaign",
                "Monitor febrile clusters in Sector 4 and Tokapal Tola",
            ],
            "sparkline": [5, 7, 9, 12, 14, 16],
        },
        # Diarrhoeal disease alerts
        {
            "unit_id": "BLK_E",
            "disease_type": "diarrhoea",
            "risk": "High",
            "confidence": 0.82,
            "forecast_period": "1-3 wks (target)",
            "method_used": "weather_model",
            "details": "SAMPLE DIARRHOEA ALERT - Elevated Acute Diarrhoeal Disease (ADD) cases following heavy rainfall runoff in Sample Block E. (Note: Does not infer water contamination from rainfall alone.)",
            "trigger_reason": "ADD weekly surveillance trajectory + heavy rainfall anomaly (>90th percentile). Direct water-quality sensor data not connected.",
            "recommended_actions": [
                "Pre-position ORS packets and Zinc sulfate tablets at all hamlet depots",
                "Distribute halogen/chlorine tablets and advise boiling drinking water per official guidance",
                "Request PHE department water-safety testing at community handpumps and open wells",
            ],
            "sparkline": [14, 18, 24, 31, 35, 38],
        },
        {
            "unit_id": "BLK_A",
            "disease_type": "diarrhoea",
            "risk": "Medium",
            "confidence": 0.75,
            "forecast_period": "1-3 wks (target)",
            "method_used": "weather_model",
            "details": "SAMPLE DIARRHOEA ALERT - Moderate seasonal ADD uptick in Sample Block A; strengthen safe-water precautions.",
            "trigger_reason": "Moderate seasonal monsoon runoff and ADD case uptick above baseline mean + 0.5 SD.",
            "recommended_actions": [
                "Check village handpump platforms for drainage stagnation",
                "Verify household ORS availability and safe drinking-water storage",
            ],
            "sparkline": [10, 12, 15, 19, 22, 24],
        },
        # Heat-related health risk alerts (non-infectious meteorological index)
        {
            "unit_id": "BLK_D",
            "disease_type": "heat",
            "risk": "High",
            "confidence": 0.90,
            "forecast_period": "1-2 wks meteorological window",
            "method_used": "meteorological_heat_index",
            "details": "SAMPLE HEAT ALERT - Meteorological Tmax 42.8°C and Apparent Heat Index 45.6°C exceed Red Heatwave threshold in Sample Block D.",
            "trigger_reason": "Rule-based meteorological threshold: Tmax ≥ 42.0°C and Heat Index ≥ 45.0°C (Non-infectious thermal stress assessment).",
            "recommended_actions": [
                "Advise avoiding strenuous outdoor labor between 12:00 PM and 4:00 PM",
                "Conduct daily hydration and cooling check-ins for elderly residents, infants, and pregnant women",
                "Verify ORS corners and PHC/CHC heatstroke cooling ward readiness",
            ],
            "sparkline": [36, 38, 40, 42, 44, 46],
        },
        {
            "unit_id": "BLK_B",
            "disease_type": "heat",
            "risk": "High",
            "confidence": 0.85,
            "forecast_period": "1-2 wks meteorological window",
            "method_used": "meteorological_heat_index",
            "details": "SAMPLE HEAT ALERT - Orange Heat Advisory in Sample Block B (Tmax 39.8°C, Apparent Heat Index 42.1°C).",
            "trigger_reason": "Rule-based meteorological threshold: Tmax ≥ 39.0°C and Apparent Heat Index ≥ 40.5°C.",
            "recommended_actions": [
                "Distribute ORS packets to outdoor MGNREGA worksites and vulnerable households",
                "Promote midday shade rest and frequent hydration",
            ],
            "sparkline": [34, 36, 38, 40, 41, 42],
        },
        {
            "unit_id": "BLK_A",
            "disease_type": "heat",
            "risk": "Medium",
            "confidence": 0.80,
            "forecast_period": "1-2 wks meteorological window",
            "method_used": "meteorological_heat_index",
            "details": "SAMPLE HEAT WATCH - Moderate thermal load in Sample Block A (Tmax 36.4°C, Heat Index 38.2°C).",
            "trigger_reason": "Rule-based meteorological threshold: Heat Index between 36.0°C and 40.4°C (Yellow Watch).",
            "recommended_actions": [
                "Maintain regular hydration during afternoon field hours",
                "Check on elderly and infant hydration during household visits",
            ],
            "sparkline": [32, 34, 35, 36, 37, 38],
        },
    ]

    for spec in multi_disease_alert_specs:
        # Deduplication check: never create duplicate alert for same (unit_id, disease_type, run_id)
        exists = (
            db.query(Alert)
            .filter(
                Alert.unit_id == spec["unit_id"],
                Alert.disease_type == spec["disease_type"],
                Alert.run_id == active_run_id,
            )
            .first()
        )
        if not exists:
            s_data = {
                "sparkline": spec["sparkline"],
                "lead_time": spec["forecast_period"],
            }
            db.add(
                Alert(
                    unit_id=spec["unit_id"],
                    disease_type=spec["disease_type"],
                    risk=spec["risk"],
                    confidence=spec["confidence"],
                    forecast_period=spec["forecast_period"],
                    method_used=spec["method_used"],
                    run_id=active_run_id,
                    created_at=now,
                    series_data=json.dumps(s_data),
                    details=spec["details"],
                    trigger_reason=spec["trigger_reason"],
                    recommended_actions=json.dumps(spec["recommended_actions"]),
                    status="active",
                )
            )
    db.commit()

    # 3c. Seed Multi-Disease Tasks (Dengue, Diarrhoeal Disease, Heat Stress) if not present
    multi_disease_tasks_spec = [
        {
            "disease_type": "dengue",
            "unit_id": "BLK_A",
            "title": "Dengue container-breeding inspection & dry-day drive — Sector 4",
            "description": "Inspect domestic water drums, coolers, and peri-domestic containers for Aedes larvae in Sector 4 Hamlet.",
            "instructions": "Visit 15 homes, empty uncovered stagnant water containers, and educate families on daytime mosquito protection.",
            "steps": json.dumps(["Inspect coolers, tyres, and open drums in 15 homes", "Empty stagnant water breeding sites", "Refer high-fever cases with joint pain to CHC"]),
            "owner": "Mitanin Asha [SAMPLE]",
            "priority": "Medium",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
            "location_name": "Sample District · Sample Block A · Sample Village A1 (Sector 4 Hamlet)",
            "status": "sent",
        },
        {
            "disease_type": "diarrhoea",
            "unit_id": "BLK_A",
            "title": "Safe-water advisory, ORS/Zinc stock check & ADD surveillance — Sector 4",
            "description": "Strengthen Acute Diarrhoeal Disease (ADD) surveillance and distribute ORS/halogen tablets following monsoon runoff.",
            "instructions": "Verify household ORS & Zinc availability, distribute chlorine tablets, and check handpump platform drainage.",
            "steps": json.dumps(["Distribute ORS packets and halogen tablets to vulnerable homes", "Check handpump surroundings for runoff stagnation", "Log any acute watery diarrhoea cases"]),
            "owner": "Mitanin Asha [SAMPLE]",
            "priority": "Medium",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
            "location_name": "Sample District · Sample Block A · Sample Village A1 (Sector 4 Hamlet)",
            "status": "in_progress",
        },
        {
            "disease_type": "heat",
            "unit_id": "BLK_B",
            "title": "Heatwave hydration check & vulnerable elderly outreach — Kanger Hamlet",
            "description": "Meteorological Heat Advisory response: check elderly residents, infants, and outdoor workers for heat exhaustion.",
            "instructions": "Visit vulnerable elderly households before 11:30 AM, distribute ORS packets, and advise avoiding midday outdoor labor.",
            "steps": json.dumps(["Check on 10 elderly/vulnerable households", "Set up ORS hydration corner at Panchayat Bhawan", "Brief MGNREGA workers on midday shade breaks"]),
            "owner": "Mitanin Sunita [SAMPLE]",
            "priority": "High",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_B",
            "village_id": "VIL_B1",
            "location_name": "Sample District · Sample Block B · Sample Village B1 (Kanger Hamlet)",
            "status": "sent",
        },
    ]

    for mt in multi_disease_tasks_spec:
        existing_mt = db.query(Task).filter(Task.title == mt["title"]).first()
        if not existing_mt:
            linked_alert = (
                db.query(Alert)
                .filter(Alert.unit_id == mt["unit_id"], Alert.disease_type == mt["disease_type"])
                .order_by(Alert.id.desc())
                .first()
            )
            owner_u = user_by_name.get(mt["owner"])
            new_t = Task(
                alert_id=linked_alert.id if linked_alert else None,
                disease_type=mt["disease_type"],
                title=mt["title"],
                description=mt["description"],
                instructions=mt["instructions"],
                steps=mt["steps"],
                owner=mt["owner"],
                owner_id=owner_u.id if owner_u else None,
                assigned_by="Supervisor K. Verma [SAMPLE SUPERVISOR BLK A]" if mt["block_id"] == "BLK_A" else "Supervisor P. Patel [SAMPLE SUPERVISOR BLK B]",
                priority=mt["priority"],
                district_id=mt["district_id"],
                block_id=mt["block_id"],
                village_id=mt["village_id"],
                location_name=mt["location_name"],
                status=mt["status"],
                created_at=now - timedelta(hours=6),
                updated_at=now - timedelta(hours=4),
                deadline=now + timedelta(hours=36),
            )
            db.add(new_t)
            db.commit()
            db.refresh(new_t)
            db.add(
                TaskEvent(
                    task_id=new_t.id,
                    event="task_created",
                    actor=new_t.assigned_by or "Supervisor [SAMPLE]",
                    timestamp=now - timedelta(hours=6),
                    notes=f"Multi-disease ({mt['disease_type']}) task dispatched.",
                )
            )
            db.commit()

    # 4. Seed Sample Field Reports if empty
    if db.query(FieldReport).count() == 0:
        asha = user_by_name.get("Mitanin Asha [SAMPLE]")
        anita = user_by_name.get("Mitanin Anita [SAMPLE]")
        sunita = user_by_name.get("Mitanin Sunita [SAMPLE]")
        all_tasks = db.query(Task).all()
        first_task_id = all_tasks[0].id if all_tasks else None

        sample_reports = []
        if asha:
            sample_reports.append(
                FieldReport(
                    task_id=first_task_id,
                    disease_type="malaria",
                    employee_id=asha.id,
                    employee_name=asha.name,
                    district_id="DIST_SAMPLE",
                    block_id="BLK_A",
                    village_id="VIL_A1",
                    location_name="Sample District · Sample Block A · Sample Village A1 (Sector 4 Hamlet)",
                    title="Sector 4 Weekly Fever & Stagnant Water Survey",
                    households_visited=18,
                    rdt_conducted=5,
                    positive_cases=1,
                    suspected_cases=3,
                    emerging_concern=False,
                    stagnant_water_sites=4,
                    nets_distributed=6,
                    observations="1 Pf positive case identified in Ward 2 and started on ACT immediately. 4 roadside water puddles treated with larvicide.",
                    evidence_notes="RDT Slide ID #BLK-A-402, Household tally register page 14",
                    review_status="pending_review",
                    created_at=now - timedelta(hours=6),
                )
            )
        if anita:
            sample_reports.append(
                FieldReport(
                    task_id=first_task_id,
                    disease_type="malaria",
                    employee_id=anita.id,
                    employee_name=anita.name,
                    district_id="DIST_SAMPLE",
                    block_id="BLK_A",
                    village_id="VIL_A3",
                    location_name="Sample District · Sample Block A · Sample Village A3 (Keslur Hamlet)",
                    title="Keslur Hamlet ACT Follow-up & Contact Screening",
                    households_visited=14,
                    rdt_conducted=8,
                    positive_cases=0,
                    suspected_cases=1,
                    emerging_concern=False,
                    stagnant_water_sites=2,
                    nets_distributed=4,
                    observations="All index patients completed 3-day ACT dose. 8 household contacts tested negative via RDT.",
                    evidence_notes="ACT completion card signed by patient family",
                    review_status="approved",
                    reviewer_name="Supervisor K. Verma [SAMPLE SUPERVISOR BLK A]",
                    review_notes="Verified against sub-centre RDT log. Good follow-up completion.",
                    created_at=now - timedelta(hours=28),
                    reviewed_at=now - timedelta(hours=12),
                )
            )
        if sunita:
            sample_reports.append(
                FieldReport(
                    task_id=None,
                    disease_type="dengue",
                    employee_id=sunita.id,
                    employee_name=sunita.name,
                    district_id="DIST_SAMPLE",
                    block_id="BLK_B",
                    village_id="VIL_B1",
                    location_name="Sample District · Sample Block B · Sample Village B1 (Kanger Hamlet)",
                    title="Kanger Hamlet Aedes Container & Drainage Larval Inspection",
                    households_visited=10,
                    rdt_conducted=2,
                    positive_cases=0,
                    suspected_cases=2,
                    emerging_concern=True,
                    stagnant_water_sites=5,
                    nets_distributed=0,
                    observations="Cleared 3 handpump drainage channels and 5 uncovered domestic water drums; 2 febrile cases with joint ache referred to CHC for dengue NS1 test.",
                    evidence_notes="Site photos logged in register #B1-09",
                    review_status="pending_review",
                    created_at=now - timedelta(hours=11),
                )
            )
        if sample_reports:
            db.add_all(sample_reports)
            db.commit()

    # 5. Seed Sample Notifications if empty
    if db.query(Notification).count() == 0:
        asha = user_by_name.get("Mitanin Asha [SAMPLE]")
        anita = user_by_name.get("Mitanin Anita [SAMPLE]")
        verma = user_by_name.get("Supervisor K. Verma [SAMPLE SUPERVISOR BLK A]")
        notifs = []
        if asha:
            notifs.extend([
                Notification(
                    user_id=asha.id,
                    block_id="BLK_A",
                    title="High Malaria Risk Alert — Sample Block A",
                    message="Weather model forecasts elevated transmission risk (+38% anomaly) in Sample Block A over the next 3-4 weeks (target). Prioritize fever RDT screening in Sector 4 Hamlet.",
                    category="alert",
                    is_read=False,
                    created_at=now - timedelta(hours=12),
                ),
                Notification(
                    user_id=asha.id,
                    block_id="BLK_A",
                    title="New Task Assigned: Active fever surveillance",
                    message="Supervisor K. Verma assigned 'Active fever surveillance & stagnant water clearance — Sector 4' with High priority.",
                    category="task",
                    is_read=False,
                    created_at=now - timedelta(hours=10),
                ),
            ])
        if anita:
            notifs.append(
                Notification(
                    user_id=anita.id,
                    block_id="BLK_A",
                    title="Field Report Approved",
                    message="Supervisor K. Verma approved your report 'Keslur Hamlet ACT Follow-up & Contact Screening'.",
                    category="report_review",
                    is_read=False,
                    created_at=now - timedelta(hours=12),
                )
            )
        if verma:
            notifs.append(
                Notification(
                    user_id=verma.id,
                    block_id="BLK_A",
                    title="Field Report Awaiting Review",
                    message="Mitanin Asha submitted 'Sector 4 Weekly Fever & Stagnant Water Survey' (1 positive case reported).",
                    category="report_review",
                    is_read=False,
                    created_at=now - timedelta(hours=6),
                )
            )
        if notifs:
            db.add_all(notifs)
            db.commit()

    # 8. Deduplicate any repeated tasks by (owner, disease_type, title)
    seen_task_keys = set()
    dup_task_ids = []
    for t in db.query(Task).order_by(Task.id.asc()).all():
        key = ((t.owner or "").strip().lower(), (t.disease_type or "malaria").strip().lower(), (t.title or "").strip().lower())
        if key in seen_task_keys:
            dup_task_ids.append(t.id)
        else:
            seen_task_keys.add(key)
    if dup_task_ids:
        db.query(TaskEvent).filter(TaskEvent.task_id.in_(dup_task_ids)).delete(synchronize_session=False)
        db.query(Task).filter(Task.id.in_(dup_task_ids)).delete(synchronize_session=False)
        db.commit()

    # 9. Seed Reviewed Multilingual Task Templates (English, Hindi, Chhattisgarhi)
    task_template_specs = [
        {
            "template_key": "malaria_village_awareness_visit",
            "disease_type": "malaria",
            "title_en": "Scheduled Malaria Awareness & Field Report Visit",
            "title_hi": "निर्धारित मलेरिया जागरूकता एवं फील्ड रिपोर्ट दौरा",
            "title_hne": "तय गाँव मं मलेरिया जागरूकता अउ फील्ड रिपोर्ट बूता",
            "instructions_en": "Visit the assigned village, conduct the scheduled malaria awareness activity, and submit the field report before 4 PM.",
            "instructions_hi": "निर्धारित गाँव का दौरा करें, मलेरिया जागरूकता गतिविधि पूरी करें और शाम 4 बजे से पहले फील्ड रिपोर्ट जमा करें।",
            "instructions_hne": "तय करे गाँव मं जावव, मलेरिया जागरूकता के तय बूता ला पूरा करव अउ संझा 4 बजे ले पहिली फील्ड रिपोर्ट जमा कर दव।",
            "safety_en": "Carry rapid diagnostic test (RDT) kits in a cool dry pouch and wear protective footwear near stagnant water.",
            "safety_hi": "आरडीटी (RDT) किट को ठंडे व सूखे बैग में रखें और रुके हुए पानी के पास सुरक्षित जूते पहनें।",
            "safety_hne": "आरडीटी (RDT) जांच किट ला सुक्खा अउ छांव वाला झोला मं रखव अउ थमगे पानी के तीर-तखार गोड़ मं पनही पहिर के जावव।",
            "review_status": "reviewed",
        },
        {
            "template_key": "malaria_fever_surveillance_sector4",
            "disease_type": "malaria",
            "title_en": "Active fever surveillance & stagnant water clearance — Sector 4",
            "title_hi": "सक्रिय बुखार निगरानी एवं रुके पानी की निकासी — सेक्टर 4",
            "title_hne": "बुखार के घर-घर जांच अउ थमगे पानी के सफाई — सेक्टर 4 पारा",
            "instructions_en": "Visit 12 high-risk homes near stream embankment, test febrile individuals with RDT, and guide container drainage.",
            "instructions_hi": "नाले के पास के 12 उच्च-जोखिम वाले घरों का दौरा करें, बुखार वाले व्यक्तियों की आरडीटी (RDT) जांच करें और रुके पानी के बर्तन खाली कराएं।",
            "instructions_hne": "नरवा तीर के 12 ठन जादा खतरा वाला घर मं जावव, जर-बुखार वाला मनखे मन के आरडीटी (RDT) जांच करव अउ बर्तन मं जमा पानी ला ढरका दव।",
            "safety_en": "Dispose of used RDT lancets in a puncture-proof biohazard box and refer severe fever signs to CHC immediately.",
            "safety_hi": "उपयोग किए गए आरडीटी लैंसेट को सुरक्षित बॉक्स में डालें और गंभीर बुखार के लक्षण दिखने पर तुरंत सीएचसी (CHC) रेफर करें।",
            "safety_hne": "जांच के सुई ला सुरक्षित डिब्बा मं डालव अउ तेज जर या कंपकंपी दिखय त तुरते सीएचसी (CHC) अस्पताल पठोवव।",
            "review_status": "reviewed",
        },
        {
            "template_key": "malaria_bednet_audit_tokapal",
            "disease_type": "malaria",
            "title_en": "Pre-monsoon LLIN bednet audit — Tokapal Tola",
            "title_hi": "मानसून-पूर्व एलएलआईएन (LLIN) मच्छरदानी जांच — तोकापाल टोला",
            "title_hne": "बरसात ले पहिली दवई वाला मच्छरदानी (LLIN) के जांच — तोकापाल पारा",
            "instructions_en": "Check net hanging status in 15 homes and demonstrate evening mosquito net discipline.",
            "instructions_hi": "तोकापाल टोला के 15 घरों में मच्छरदानी लगाने की स्थिति जांचें और शाम को मच्छरदानी के सही उपयोग की जानकारी दें।",
            "instructions_hne": "तोकापाल पारा के 15 घर मं जाके देखव कि मच्छरदानी टंगाथे कि नहीं, अउ संझा बेरा रोज मच्छरदानी लगा के सुते के समझाइश दव।",
            "safety_en": "Advise families not to wash LLIN nets in streams or ponds and to dry them in the shade.",
            "safety_hi": "परिवारों को सलाह दें कि एलएलआईएन मच्छरदानी को तालाब या नाले में न धोएं और छांव में ही सुखाएं।",
            "safety_hne": "घर वाला मन ला बतावव कि दवई वाला मच्छरदानी ला तरिया या नरवा मं झन धोवंय अउ छांव मं सुखावंय।",
            "review_status": "reviewed",
        },
        {
            "template_key": "dengue_container_inspection",
            "disease_type": "dengue",
            "title_en": "Dengue container-breeding inspection & dry-day drive — Sector 4",
            "title_hi": "डेंगू लार्वा बर्तन निरीक्षण एवं ड्राई-डे अभियान — सेक्टर 4",
            "title_hne": "डेंगू मच्छर के लार्वा जांच अउ सुक्खा-दिन (Dry-Day) बूता — सेक्टर 4",
            "instructions_en": "Visit 15 homes, empty uncovered stagnant water containers, coolers, and tyres, and educate families on daytime mosquito protection.",
            "instructions_hi": "15 घरों का दौरा करें, खुले पानी के ड्रम, कूलर और टायर खाली करवाएं तथा दिन में मच्छरों से बचाव की जानकारी दें।",
            "instructions_hne": "15 घर मं जाके कूलर, कोटना, टायर अउ उघरा टंकी के जमा पानी ला खाली करावव अउ दिन बेरा मच्छर ले बचे के उपाय बतावव।",
            "safety_en": "Do not recommend aspirin or ibuprofen for suspected dengue fever; refer patients with warning signs (bleeding, severe stomach pain) to CHC.",
            "safety_hi": "संदिग्ध डेंगू बुखार में एस्पिरिन या दर्द निवारक दवा की सलाह न दें; पेट दर्द या रक्तस्राव जैसे लक्षण दिखने पर तुरंत अस्पताल भेजें।",
            "safety_hne": "डेंगू के संका होय त एस्पिरिन या अपने मन ले दरद के दवई झन दव; पेट मं अब्बड़ पीरा या खून निकले के चिन्हा दिखय त तुरते सरकारी अस्पताल ले जावव।",
            "review_status": "reviewed",
        },
        {
            "template_key": "diarrhoea_safe_water_ors",
            "disease_type": "diarrhoea",
            "title_en": "Safe-water advisory, ORS/Zinc stock check & ADD surveillance — Sector 4",
            "title_hi": "सुरक्षित पेयजल सलाह, ओआरएस (ORS)/जिंक जांच एवं दस्त निगरानी — सेक्टर 4",
            "title_hne": "सफ्फा पानी के समझाइश, ओआरएस (ORS)-जिंक बांटे अउ टट्टी-उल्टी निगरानी — सेक्टर 4",
            "instructions_en": "Verify household ORS & Zinc availability, distribute chlorine tablets, and check handpump platform drainage.",
            "instructions_hi": "घरों में ओआरएस और जिंक की उपलब्धता जांचें, क्लोरीन गोलियां बांटें और हैंडपंप चबूतरे की जल निकासी की जांच करें।",
            "instructions_hne": "घर-घर ओआरएस (ORS) पुड़िया अउ जिंक गोली के जानकारी लेवव, पानी सफ्फा करे बर क्लोरीन गोली बांटव अउ बोरिंग-हैंडपंप तीर गंदा पानी झन जामय तेला देखव।",
            "safety_en": "Advise boiling drinking water or using chlorine tablets properly. Refer severe dehydration (sunken eyes, lethargy) immediately.",
            "safety_hi": "पीने का पानी उबालने या क्लोरीन गोली के सही उपयोग की सलाह दें। गंभीर निर्जलीकरण दिखने पर तुरंत स्वास्थ्य केंद्र भेजें।",
            "safety_hne": "पीये के पानी ला उबाल के पीये के सलाह दव। यदि लइका या सियान सुस्त पर जाय या आंखी धंस जाय त तुरते अस्पताल पठोवव।",
            "review_status": "reviewed",
        },
        {
            "template_key": "heat_elderly_hydration_check",
            "disease_type": "heat",
            "title_en": "Heatwave hydration check & vulnerable elderly outreach — Kanger Hamlet",
            "title_hi": "लू (हीटवेव) जलयोजन जांच एवं बुजुर्गों से संपर्क — कांगेर पारा",
            "title_hne": "लू अउ घाम ले बचाव बर सियान मन के हालचाल अउ ओआरएस (ORS) बूता — कांगेर पारा",
            "instructions_en": "Visit vulnerable elderly households before 11:30 AM, distribute ORS packets, and advise avoiding midday outdoor labor.",
            "instructions_hi": "सुबह 11:30 बजे से पहले बुजुर्ग एवं संवेदनशील परिवारों से मिलें, ओआरएस पैकेट बांटें और दोपहर 12 से 4 बजे तक तेज धूप में काम न करने की सलाह दें।",
            "instructions_hne": "बिहनिया 11:30 बजे ले पहिली सियान, जच्चा अउ छोटे लइका वाला घर मं जावव, ओआरएस (ORS) पैकेट बांटव अउ मंझनिया 12 ले 4 बजे तक कड़क घाम मं बूता झन करे के समझाइश दव।",
            "safety_en": "Conduct field visits in morning hours, carry drinking water and umbrella, and treat heatstroke (hot dry skin, confusion) as a medical emergency.",
            "safety_hi": "फील्ड भ्रमण सुबह के समय करें, साथ में पानी और छाता रखें; लू लगने (तेज बुखार, पसीना रुकना, चक्कर) पर तुरंत ठंडा स्पंज करें और अस्पताल भेजें।",
            "safety_hne": "खुद घलो बिहनिया बेरा भ्रमण करव, संग मं पानी अउ छतरी रखव; काकरो देह अब्बड़ तपत हे अउ चक्कर आवत हे त तुरते छांव मं लिटाके गीला कपड़ा ले पोछव अउ अस्पताल ले जावव।",
            "review_status": "reviewed",
        },
    ]

    for tpl in task_template_specs:
        existing_tpl = (
            db.query(TranslatedTaskTemplate)
            .filter(TranslatedTaskTemplate.template_key == tpl["template_key"])
            .first()
        )
        if not existing_tpl:
            db.add(
                TranslatedTaskTemplate(
                    template_key=tpl["template_key"],
                    disease_type=tpl["disease_type"],
                    title_en=tpl["title_en"],
                    title_hi=tpl["title_hi"],
                    title_hne=tpl["title_hne"],
                    instructions_en=tpl["instructions_en"],
                    instructions_hi=tpl["instructions_hi"],
                    instructions_hne=tpl["instructions_hne"],
                    safety_en=tpl["safety_en"],
                    safety_hi=tpl["safety_hi"],
                    safety_hne=tpl["safety_hne"],
                    review_status=tpl["review_status"],
                    updated_by="System Seed (Reviewed Public Health Dictionary)",
                    updated_at=now,
                )
            )
    db.commit()


