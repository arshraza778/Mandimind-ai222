"""
Location-based malaria risk intelligence, climate telemetry extraction,
and configurable public health recommendations for Mitanin Signal.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from config import load_config
from data.load import load_and_validate_data
from forecast.multi_disease import (
    DISEASE_TYPES,
    DISEASE_CATALOG,
    DOCUMENTED_THRESHOLDS,
    evaluate_all_diseases_for_unit,
)
from app.db.models import LocationUnit, Alert, PipelineRun
from app.db.clock import get_simulated_now

# Cache loaded dataframe to avoid disk re-reads on every request
_DATA_CACHE: Dict[str, Any] = {"df": None, "units": None, "report": None, "data_source": None}


def get_cached_telemetry():
    cfg = load_config()
    if _DATA_CACHE["df"] is None or _DATA_CACHE["data_source"] != cfg.data_source:
        df, units, report = load_and_validate_data(config=cfg, raise_on_error=False)
        _DATA_CACHE["df"] = df
        _DATA_CACHE["units"] = units
        _DATA_CACHE["report"] = report
        _DATA_CACHE["data_source"] = cfg.data_source
    return _DATA_CACHE["df"], _DATA_CACHE["units"], _DATA_CACHE["report"], cfg


# Configurable recommendations keyed by canonical risk category: Low, Moderate, High, Very High
RISK_RECOMMENDATIONS_CONFIG: Dict[str, Dict[str, Any]] = {
    "Low": {
        "risk_category": "Low",
        "severity_level": 1,
        "badge_color": "forest",
        "headline": "Low Malaria Transmission Risk",
        "summary": "Climate and surveillance indicators are within normal seasonal baseline levels. Maintain routine household mosquito prevention.",
        "show_prominent_alert": False,
        "citizen_actions": [
            "Remove stagnant water around homes, flower pots, tyres, and open containers once a week.",
            "Use Long-Lasting Insecticidal Nets (LLINs) while sleeping and apply mosquito repellents in the evening.",
            "Maintain basic household mosquito-prevention practices and keep drainage channels clear.",
        ],
        "health_worker_actions": [
            "Conduct routine fortnightly household fever surveillance.",
            "Ensure village RDT kit and ACT drug buffer stock is maintained.",
        ],
        "public_health_guidance": "If you or a family member develop fever with chills, contact your village Mitanin for a free Rapid Diagnostic Test (RDT).",
    },
    "Moderate": {
        "risk_category": "Moderate",
        "severity_level": 2,
        "badge_color": "amber",
        "headline": "Moderate Malaria Risk — Elevated Vector Activity",
        "summary": "Recent rainfall and temperature patterns indicate increased mosquito breeding potential over the next 2–4 weeks (target).",
        "show_prominent_alert": False,
        "citizen_actions": [
            "Increase mosquito-control measures: sleep under insecticide-treated bednets every night and wear long-sleeved clothing at dusk.",
            "Actively check for and drain stagnant water and mosquito breeding sites around handpumps, ditches, and rooftops.",
            "Seek medical advice or get tested immediately from your local Mitanin or sub-centre if fever, chills, or headache develop.",
        ],
        "health_worker_actions": [
            "Intensify active fever screening in households near water bodies.",
            "Inspect village water logging sites and coordinate biological larvicide application.",
        ],
        "public_health_guidance": "Early malaria testing within 24 hours of fever onset prevents complications. Free RDT testing is available through your village Mitanin and Primary Health Centre.",
    },
    "High": {
        "risk_category": "High",
        "severity_level": 3,
        "badge_color": "coral",
        "headline": "LOCAL RISK ALERT: High Malaria Transmission Risk",
        "summary": "Lagged weather telemetry and case surveillance indicate a high probability of malaria surge in this block over the forecast window.",
        "show_prominent_alert": True,
        "citizen_actions": [
            "URGENT: Ensure every household member (especially children and pregnant women) sleeps under an LLIN mosquito net every night.",
            "Use additional mosquito-prevention measures: evening repellents, window/door screening, and complete removal of standing water.",
            "Seek prompt malaria testing at your nearest Community/Primary Health Centre or village Mitanin at the first sign of fever.",
            "If diagnosed positive, complete the full 3-day prescribed ACT treatment course without skipping doses.",
        ],
        "health_worker_actions": [
            "Execute targeted door-to-door fever RDT sweeps across all high-risk hamlets.",
            "Coordinate Indoor Residual Spraying (IRS) and immediate larval source management.",
            "Follow up all positive cases to verify ACT compliance and screen household contacts.",
        ],
        "public_health_guidance": "Do not ignore fever in high-risk periods. Free 15-minute Rapid Diagnostic Tests (RDT) and Artemisinin Combination Therapy (ACT) are available at the local health facilities listed below.",
    },
    "Very High": {
        "risk_category": "Very High",
        "severity_level": 4,
        "badge_color": "coral",
        "headline": "CRITICAL LOCAL RISK ALERT: Very High Malaria Transmission Risk",
        "summary": "Climate anomaly and case trajectory strongly exceed the seasonal alert threshold. Immediate community prevention and active testing are advised.",
        "show_prominent_alert": True,
        "citizen_actions": [
            "CRITICAL ALERT: Strictly use insecticide-treated mosquito nets (LLINs) and evening repellents for all family members.",
            "Cooperate with Mitanin health workers and Indoor Residual Spraying (IRS) teams visiting your village.",
            "Go for immediate blood testing at the nearest Health Facility or Mitanin worker as soon as fever or chills appear.",
            "Watch for warning signs (persistent high fever, confusion, severe weakness) and use 108/104 emergency referral to the Community Health Centre.",
        ],
        "health_worker_actions": [
            "Daily active fever screening camp and rapid RDT testing across all village tolas.",
            "Immediate referral of severe or pediatric fever cases to the Community Health Centre.",
            "Emergency larval control and bednet gap distribution.",
        ],
        "public_health_guidance": "Immediate testing and treatment saves lives. Verified local public health facilities and Mitanin emergency contacts for your block are displayed below.",
    },
}


from app.lgd_locations import (
    resolve_location_unit,
    DEFAULT_LGD_DISTRICT_ID,
    DEFAULT_LGD_BLOCK_ID,
)


def resolve_location_context(
    db: Session,
    district_id: Optional[str] = None,
    block_id: Optional[str] = None,
    village_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolves a (district_id, block_id, village_id) selection into full LocationUnit objects
    using official Chhattisgarh LGD records (or legacy demo records if requested).
    Never silently falls back to simulated locations when an invalid identifier is provided.
    """
    from fastapi import HTTPException, status

    vil_obj = None
    if village_id:
        vil_obj = resolve_location_unit(db, village_id, expected_level="village")
        if not vil_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Location village '{village_id}' not found.",
            )
        if not block_id:
            block_id = vil_obj.parent_id

    blk_obj = None
    if block_id:
        blk_obj = resolve_location_unit(db, block_id, expected_level="block")
        if not blk_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Location block '{block_id}' not found.",
            )
        if not district_id:
            district_id = blk_obj.parent_id

    dist_obj = None
    if district_id:
        dist_obj = resolve_location_unit(db, district_id, expected_level="district")
        if not dist_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Location district '{district_id}' not found.",
            )

    # Validate parent-child relationship if both are present
    if blk_obj and dist_obj and blk_obj.parent_id != dist_obj.unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Block '{blk_obj.unit_name}' ({blk_obj.unit_id}) does not belong to district '{dist_obj.unit_name}' ({dist_obj.unit_id}).",
        )
    if vil_obj and blk_obj and vil_obj.parent_id != blk_obj.unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Village '{vil_obj.unit_name}' ({vil_obj.unit_id}) does not belong to block '{blk_obj.unit_name}' ({blk_obj.unit_id}).",
        )

    # If no district specified, pick authoritative LGD default (Bastar) or first district
    if not dist_obj:
        dist_obj = resolve_location_unit(db, DEFAULT_LGD_DISTRICT_ID, expected_level="district")
        if not dist_obj:
            dist_obj = db.query(LocationUnit).filter(LocationUnit.level == "district", LocationUnit.is_demo == False).first()
        if not dist_obj:
            dist_obj = db.query(LocationUnit).filter(LocationUnit.level == "district").first()

    # If no block specified, pick authoritative LGD default (Jagdalpur) under selected district, or first block
    if not blk_obj:
        if dist_obj and dist_obj.unit_id == DEFAULT_LGD_DISTRICT_ID:
            blk_obj = resolve_location_unit(db, DEFAULT_LGD_BLOCK_ID, expected_level="block")
        if not blk_obj and dist_obj:
            blk_obj = (
                db.query(LocationUnit)
                .filter(LocationUnit.level == "block", LocationUnit.parent_id == dist_obj.unit_id)
                .first()
            )
        if not blk_obj:
            blk_obj = db.query(LocationUnit).filter(LocationUnit.level == "block").first()

    forecast_unit_id = (
        (vil_obj.forecast_unit_id if vil_obj and vil_obj.forecast_unit_id else None)
        or (blk_obj.forecast_unit_id if blk_obj and blk_obj.forecast_unit_id else None)
        or (blk_obj.unit_id if blk_obj else "LGD_BLK_3595")
    )

    selected_level = "village" if vil_obj else ("block" if blk_obj else "district")
    data_available_level = "block"

    granularity_disclosure = None
    if selected_level == "village":
        granularity_disclosure = (
            f"Note on geographic granularity: Surveillance cases and weather forecasts are modeled at the "
            f"Block level ({blk_obj.unit_name if blk_obj else forecast_unit_id}). Village-level values are not "
            f"synthetically invented; showing verified block-level forecast and climate telemetry for "
            f"{vil_obj.unit_name}, combined with village-specific field tasks and reports."
        )
    elif selected_level == "district":
        granularity_disclosure = (
            f"Showing aggregated district overview and representative block ({blk_obj.unit_name if blk_obj else forecast_unit_id}) telemetry."
        )

    facility = None
    if blk_obj and blk_obj.health_facility:
        try:
            facility = json.loads(blk_obj.health_facility)
        except Exception:
            facility = None
    if not facility and dist_obj and dist_obj.health_facility:
        try:
            facility = json.loads(dist_obj.health_facility)
        except Exception:
            facility = None

    breadcrumb_parts = []
    if dist_obj:
        breadcrumb_parts.append(dist_obj.unit_name)
    if blk_obj:
        b_label = blk_obj.unit_name
        if blk_obj.block_lgd_code:
            b_label += f" (LGD {blk_obj.block_lgd_code})"
        breadcrumb_parts.append(b_label)
    if vil_obj:
        breadcrumb_parts.append(vil_obj.unit_name)

    return {
        "district": dist_obj.to_dict() if dist_obj else {"unit_id": DEFAULT_LGD_DISTRICT_ID, "unit_name": "Bastar"},
        "block": blk_obj.to_dict() if blk_obj else {"unit_id": DEFAULT_LGD_BLOCK_ID, "unit_name": "Jagdalpur"},
        "village": vil_obj.to_dict() if vil_obj else None,
        "forecast_unit_id": forecast_unit_id,
        "selected_level": selected_level,
        "data_available_level": data_available_level,
        "granularity_disclosure": granularity_disclosure,
        "location_breadcrumb": " · ".join(breadcrumb_parts),
        "health_facility": facility,
        "is_lgd_official": not bool(dist_obj and dist_obj.is_demo),
    }


def map_alert_to_public_risk_category(alert_risk: str, confidence: float, unit_id: str) -> str:
    """
    Maps backend model alert risk ('Low', 'Medium', 'High') and confidence/surge metrics
    into the 4 public risk categories: 'Low', 'Moderate', 'High', 'Very High'.
    """
    r = (alert_risk or "Low").strip().lower()
    if r == "very high":
        return "Very High"
    if r == "high":
        if confidence >= 0.87:
            return "Very High"
        return "High"
    if r in ("medium", "moderate"):
        return "Moderate"
    return "Low"


def build_location_risk_payload(
    db: Session,
    district_id: Optional[str] = None,
    block_id: Optional[str] = None,
    village_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Builds a comprehensive, location-specific malaria risk, climate indicator,
    historical trend, forecast, and recommendation payload using official LGD locations
    while strictly protecting simulated telemetry as DEMO DATA.
    """
    loc_ctx = resolve_location_context(db, district_id=district_id, block_id=block_id, village_id=village_id)
    f_unit_id = loc_ctx["forecast_unit_id"]
    blk_info = loc_ctx["block"]
    dist_info = loc_ctx["district"]

    df, _, report, cfg = get_cached_telemetry()
    now = get_simulated_now(db)

    # Determine simulated telemetry mapping:
    # If f_unit_id is in simulated dataset (BLK_A..BLK_F), use it directly.
    # Otherwise, if viewing a real LGD block, use deterministic demo template but label as DEMO DATA.
    known_units = set(df["unit_id"].unique()) if df is not None and not df.empty else set()
    telemetry_unit_id = f_unit_id
    is_lgd_block = bool(blk_info.get("block_lgd_code"))

    if f_unit_id not in known_units:
        demo_pool = ["BLK_A", "BLK_B", "BLK_C", "BLK_D", "BLK_E"]
        seed_num = int(blk_info.get("block_lgd_code") or 1)
        telemetry_unit_id = demo_pool[seed_num % len(demo_pool)]

    # 1. Find latest malaria alert for this telemetry unit
    latest_run = db.query(PipelineRun).order_by(PipelineRun.created_at.desc(), PipelineRun.run_id.desc()).first()
    alert_query = db.query(Alert).filter(
        Alert.unit_id == (f_unit_id if f_unit_id in known_units else telemetry_unit_id),
        (Alert.disease_type == "malaria") | (Alert.disease_type == None),
    )
    if latest_run:
        alert = alert_query.filter(Alert.run_id == latest_run.run_id).first()
    else:
        alert = None
    if not alert:
        alert = alert_query.order_by(Alert.id.desc()).first()

    raw_risk = alert.risk if alert else "Low"
    confidence = alert.confidence if alert else 0.65
    method_used = alert.method_used if alert else "seasonal_baseline"
    forecast_period = alert.forecast_period if alert else f"2-4 {cfg.unit_label} (target)"

    public_risk_category = map_alert_to_public_risk_category(raw_risk, confidence, telemetry_unit_id)
    rec_bundle = RISK_RECOMMENDATIONS_CONFIG.get(public_risk_category, RISK_RECOMMENDATIONS_CONFIG["Low"])

    # 2. Extract telemetry from cases.csv & weather.csv
    climate_latest = {
        "latest_date": "2023-12-18",
        "temperature_c": 24.5,
        "rainfall_mm": 12.0,
        "rainfall_4wk_mm": 48.0,
        "temp_4wk_avg_c": 25.1,
        "latest_cases": 14,
        "cases_4wk_total": 58,
        "humidity_note": "Derived from seasonal rainfall & temperature index",
    }
    historical_trends: List[Dict[str, Any]] = []

    if df is not None and not df.empty:
        u_df = df[df["unit_id"] == telemetry_unit_id].sort_values("date").tail(16)
        if not u_df.empty:
            last_row = u_df.iloc[-1]
            last_4 = u_df.tail(4)
            climate_latest = {
                "latest_date": str(last_row["date"]),
                "temperature_c": round(float(last_row.get("temp_c", 25.0)), 1),
                "rainfall_mm": round(float(last_row.get("rainfall_mm", 0.0)), 1),
                "rainfall_4wk_mm": round(float(last_4["rainfall_mm"].sum()), 1),
                "temp_4wk_avg_c": round(float(last_4["temp_c"].mean()), 1) if "temp_c" in last_4 else 25.0,
                "latest_cases": int(last_row["cases"]) if not last_row.isna()["cases"] else 0,
                "cases_4wk_total": int(last_4["cases"].dropna().sum()),
                "humidity_note": "High vector suitability" if float(last_4["rainfall_mm"].sum()) > 40 else "Normal seasonal moisture",
            }
            for _, row in u_df.iterrows():
                dt_str = str(row["date"])
                try:
                    dt_fmt = datetime.strptime(dt_str, "%Y-%m-%d").strftime("%b %d")
                except Exception:
                    dt_fmt = dt_str
                historical_trends.append({
                    "date": dt_str,
                    "period": dt_fmt,
                    "cases": int(row["cases"]) if not row.isna()["cases"] else 0,
                    "rainfall_mm": round(float(row.get("rainfall_mm", 0.0)), 1),
                    "temp_c": round(float(row.get("temp_c", 25.0)), 1),
                })

    # 3. Forecast chart scaling
    unit_scale_map = {
        "BLK_A": 1.0,
        "BLK_B": 0.62,
        "BLK_C": 0.35,
        "BLK_D": 0.28,
        "BLK_E": 0.72,
        "BLK_F": 0.32,
    }
    scale = unit_scale_map.get(telemetry_unit_id, 0.5)
    is_weather = method_used == "weather_model"

    base_chart = [
        {"period": "Jan", "actual": int(round(12 * scale)), "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Feb", "actual": int(round(11 * scale)), "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Mar", "actual": int(round(14 * scale)), "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Apr", "actual": int(round(25 * scale)), "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "May", "actual": int(round(48 * scale)), "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Jun", "actual": int(round(85 * scale)), "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Jul", "actual": int(round(140 * scale)), "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Aug", "actual": int(round(220 * scale)), "baseline": int(round(220 * scale)), "weather_model": int(round(220 * scale)) if is_weather else None, "ci_lower": int(round(200 * scale)), "ci_upper": int(round(240 * scale))},
        {"period": "Sep", "actual": int(round(310 * scale)), "baseline": int(round(255 * scale)), "weather_model": int(round(310 * scale)) if is_weather else None, "ci_lower": int(round(270 * scale)), "ci_upper": int(round(350 * scale))},
        {"period": "Oct (target)", "actual": None, "baseline": int(round(240 * scale)), "weather_model": int(round(265 * scale)) if is_weather else None, "ci_lower": int(round(220 * scale)), "ci_upper": int(round(305 * scale))},
        {"period": "Nov (target)", "actual": None, "baseline": int(round(180 * scale)), "weather_model": int(round(195 * scale)) if is_weather else None, "ci_lower": int(round(160 * scale)), "ci_upper": int(round(230 * scale))},
        {"period": "Dec (target)", "actual": None, "baseline": int(round(80 * scale)), "weather_model": int(round(90 * scale)) if is_weather else None, "ci_lower": int(round(65 * scale)), "ci_upper": int(round(115 * scale))},
    ]

    alert_threshold = int(round(260 * scale))

    # 4. Data honesty / simulated disclosures
    is_simulated = True  # Surveillance cases and weather telemetry remain simulated DEMO DATA
    last_updated_iso = (alert.created_at.isoformat() if alert and alert.created_at else now.isoformat())

    # 5. Evaluate all 4 modular health risks (Malaria, Dengue, Diarrhoeal Disease, Heat-Related Health Risk)
    diseases_map: Dict[str, Dict[str, Any]] = {}
    if df is not None and not df.empty:
        diseases_map = evaluate_all_diseases_for_unit(
            unit_id=telemetry_unit_id,
            raw_df=df,
            now_iso=last_updated_iso,
            data_source=cfg.data_source,
            malaria_alert_context={
                "category": public_risk_category,
                "confidence": confidence,
                "method_used": method_used,
            },
        )

    # Attach active DB alert IDs per disease
    unit_alerts = db.query(Alert).filter(Alert.unit_id == telemetry_unit_id).order_by(Alert.id.desc()).all()
    latest_alert_by_disease: Dict[str, Alert] = {}
    for ua in unit_alerts:
        dt_key = (ua.disease_type or "malaria").lower()
        if dt_key not in latest_alert_by_disease:
            latest_alert_by_disease[dt_key] = ua

    for d_key, d_payload in diseases_map.items():
        linked_a = latest_alert_by_disease.get(d_key)
        d_payload["alert_id"] = linked_a.id if linked_a else None
        d_payload["alert_status"] = linked_a.status if linked_a else None

    # Enrich climate_latest with derived heat fields
    if "heat" in diseases_map:
        heat_clim = diseases_map["heat"].get("climate_indicators", {})
        climate_latest["temp_max_c"] = heat_clim.get("temp_max_c", round(climate_latest["temperature_c"] + 5.2, 1))
        climate_latest["temp_min_c"] = heat_clim.get("temp_min_c", round(climate_latest["temperature_c"] - 4.5, 1))
        climate_latest["humidity_pct"] = heat_clim.get("humidity_pct", 62.0)
        climate_latest["heat_index_c"] = heat_clim.get("heat_index_c", climate_latest["temperature_c"])

    # Build cross-location multi-disease risk comparison
    # If viewing an LGD district, build comparison from actual LGD blocks of this district.
    # If viewing legacy demo DIST_SAMPLE, preserve the 6 demo blocks (BLK_A..BLK_F).
    block_comparison: List[Dict[str, Any]] = []
    if dist_info.get("district_lgd_code"):
        dist_code = int(dist_info["district_lgd_code"])
        lgd_blks = (
            db.query(LocationUnit)
            .filter(LocationUnit.level == "block", LocationUnit.district_lgd_code == dist_code)
            .order_by(LocationUnit.unit_name.asc())
            .all()
        )
        for b_item in lgd_blks:
            risk_labels = ["Low", "Moderate", "High", "Very High"]
            seed_idx = int(b_item.block_lgd_code or 0)
            block_comparison.append({
                "unit_id": b_item.unit_id,
                "unit_name": b_item.unit_name,
                "block_lgd_code": b_item.block_lgd_code,
                "latitude": b_item.latitude,
                "longitude": b_item.longitude,
                "malaria": risk_labels[seed_idx % 4] + " (DEMO)",
                "dengue": risk_labels[(seed_idx + 1) % 4] + " (DEMO)",
                "diarrhoea": risk_labels[(seed_idx + 2) % 4] + " (DEMO)",
                "heat": risk_labels[(seed_idx + 3) % 4] + " (DEMO)",
                "is_selected": b_item.unit_id == blk_info["unit_id"],
                "is_demo_telemetry": True,
            })
    else:
        # Legacy demo comparison for DIST_SAMPLE
        block_comparison = [
            {"unit_id": "BLK_A", "unit_name": "Sample Block A", "malaria": "Very High", "dengue": "Moderate", "diarrhoea": "Moderate", "heat": "Moderate"},
            {"unit_id": "BLK_B", "unit_name": "Sample Block B", "malaria": "Moderate", "dengue": "High", "diarrhoea": "Low", "heat": "High"},
            {"unit_id": "BLK_C", "unit_name": "Sample Block C", "malaria": "Low", "dengue": "Low", "diarrhoea": "Low", "heat": "High"},
            {"unit_id": "BLK_D", "unit_name": "Sample Block D", "malaria": "Low", "dengue": "Low", "diarrhoea": "Low", "heat": "Very High"},
            {"unit_id": "BLK_E", "unit_name": "Sample Block E", "malaria": "High", "dengue": "Moderate", "diarrhoea": "High", "heat": "Low"},
            {"unit_id": "BLK_F", "unit_name": "Sample Block F", "malaria": "Low", "dengue": "Moderate (Climate Watch)", "diarrhoea": "Low (Insufficient Data)", "heat": "Moderate"},
        ]
        for row in block_comparison:
            row["is_selected"] = row["unit_id"] == f_unit_id

    cards_list = [diseases_map[k] for k in DISEASE_TYPES if k in diseases_map]

    status_badge = (
        "DEMO DATA — SIMULATED TELEMETRY"
        if is_lgd_block
        else "SIMULATED / HISTORICAL PROTOTYPE DATA"
    )

    honesty_disclosure = (
        "DEMO DATA NOTICE: Official Chhattisgarh LGD administrative boundaries and representative coordinates "
        "are loaded from docs/chhattisgarh_lgd_blocks_dataset/ (33 districts, 146 development blocks). "
        "Weather observations, malaria cases, and multi-disease risk estimates remain SIMULATED DEMO DATA "
        f"(through {climate_latest['latest_date']}). Never treat simulated records as clinical diagnoses or live telemetry."
    )

    return {
        "location": loc_ctx,
        "risk": {
            "category": public_risk_category,
            "all_categories": ["Low", "Moderate", "High", "Very High"],
            "alert_risk_raw": raw_risk,
            "confidence": confidence,
            "confidence_pct": f"{int(round(confidence * 100))}%",
            "method_used": method_used,
            "method_label": "Weather-informed GLM (passed skill gate)" if is_weather else "Seasonal baseline (skill gate fallback)",
            "forecast_period": forecast_period if forecast_period != "-" else f"2-4 {cfg.unit_label} (target)",
            "alert_id": alert.id if alert else None,
            "alert_details": alert.details if alert else "Standard seasonal surveillance monitoring.",
            "is_demo_telemetry": is_lgd_block,
        },
        "climate": climate_latest,
        "historical_trends": historical_trends,
        "forecast_chart": base_chart,
        "alert_threshold": alert_threshold,
        "recommendations": rec_bundle,
        "multi_disease": {
            "supported_diseases": list(DISEASE_TYPES),
            "catalog": DISEASE_CATALOG,
            "diseases": diseases_map,
            "cards": cards_list,
            "documented_thresholds": DOCUMENTED_THRESHOLDS,
            "location_comparison": block_comparison,
            "forecast_vs_diagnosis_notice": (
                "IMPORTANT DISTINCTION: A risk forecast or environmental heat index estimates community-level hazard "
                "from climate and historical surveillance trends; it is NOT a confirmed clinical disease diagnosis "
                "or water-potability test. Individuals with symptoms must seek diagnostic testing at a health facility."
            ),
        },
        "data_status": {
            "data_source": cfg.data_source,
            "is_simulated": is_simulated,
            "is_demo_telemetry": is_lgd_block,
            "is_live": False,
            "last_model_update": last_updated_iso,
            "latest_telemetry_date": climate_latest["latest_date"],
            "simulated_clock_now": now.isoformat(),
            "banner_text": cfg.banner_text,
            "status_badge": status_badge,
            "honesty_disclosure": honesty_disclosure,
        },
    }


def build_disease_detail_payload(
    db: Session,
    disease_type: str,
    district_id: Optional[str] = None,
    block_id: Optional[str] = None,
    village_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Builds a dedicated Disease-Specific Detail Page payload for `malaria`, `dengue`,
    `diarrhoea`, or `heat` at the selected location.
    """
    d_key = (disease_type or "malaria").strip().lower()
    if d_key not in DISEASE_TYPES:
        raise ValueError(f"Unsupported disease_type '{disease_type}'. Supported: {', '.join(DISEASE_TYPES)}")

    base_payload = build_location_risk_payload(
        db=db,
        district_id=district_id,
        block_id=block_id,
        village_id=village_id,
    )
    multi = base_payload["multi_disease"]
    d_detail = multi["diseases"].get(d_key)

    f_unit_id = base_payload["location"]["forecast_unit_id"]
    related_alerts = (
        db.query(Alert)
        .filter(Alert.unit_id == f_unit_id, Alert.disease_type == d_key)
        .order_by(Alert.id.desc())
        .limit(5)
        .all()
    )

    return {
        "disease_type": d_key,
        "location": base_payload["location"],
        "assessment": d_detail,
        "documented_thresholds": DOCUMENTED_THRESHOLDS.get(d_key),
        "related_alerts": [a.to_dict() for a in related_alerts],
        "location_comparison": multi["location_comparison"],
        "forecast_vs_diagnosis_notice": multi["forecast_vs_diagnosis_notice"],
        "data_status": base_payload["data_status"],
    }
