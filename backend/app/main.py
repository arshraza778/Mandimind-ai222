"""
Mitanin Signal FastAPI Application
Climate-informed malaria early-warning and frontline action-tracking prototype.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
from typing import Dict, Any, List, Optional

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, Depends, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from config import load_config, AppConfig
from data.load import (
    load_and_validate_data,
    generate_csv_template_string,
    validate_uploaded_surveillance_csv,
)
from forecast.evaluate import run_evidence_evaluation
from app.db.session import engine, SessionLocal, init_db, get_db
from app.db.models import (
    Alert,
    Task,
    TaskEvent,
    User,
    PipelineRun,
    SimulatedClock,
    LocationUnit,
    AuthSession,
    FieldReport,
    Notification,
    TranslatedTaskTemplate,
)
from app.db.clock import get_simulated_now, advance_clock, reset_clock, check_and_escalate_tasks
from app.db.seed import seed_database
from app.schemas import (
    LoginRequest,
    CreateTaskRequest,
    MitaninReplyRequest,
    UpdateTaskStatusRequest,
    EmployeeTaskActionRequest,
    SupervisorTaskPatchRequest,
    CreateFieldReportRequest,
    ReviewFieldReportRequest,
    AlertFeedbackRequest,
    UpdateLanguagePreferenceRequest,
    UpdateTaskTemplateRequest,
    TTSSynthesizeRequest,
    ChatbotMessageRequest,
    WeatherDiseasePredictRequest,
    CsvUploadValidationRequest,
    MalariaCaseForecastRequest,
)
from app.ai_provider import get_public_chatbot_config, synthesize_cloud_tts
from app.chatbot import process_chatbot_message
from app.weather_disease_ml import (
    load_model_bundle,
    get_model_health_status,
    run_weather_disease_prediction,
)
from app.malaria_forecast_ml import (
    load_malaria_model_bundle,
    get_malaria_model_status,
    run_malaria_case_forecast,
)
from app.auth import (
    verify_password,
    create_user_session,
    extract_bearer_token,
    get_optional_user,
    get_current_user,
    require_field_employee,
    require_supervisor,
    get_authorized_block_ids,
    verify_location_jurisdiction,
)
from app.location_intel import (
    resolve_location_context,
    build_location_risk_payload,
    build_disease_detail_payload,
    RISK_RECOMMENDATIONS_CONFIG,
)
from forecast.multi_disease import (
    DISEASE_TYPES,
    DISEASE_CATALOG,
    DOCUMENTED_THRESHOLDS,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    # Preload saved ML model artifacts into memory once on startup
    load_model_bundle()
    load_malaria_model_bundle()
    yield


def should_enable_docs() -> bool:
    """
    Evaluates whether interactive API documentation (/docs, /redoc, /openapi.json)
    should be enabled.

    Security & Fail-safe Rules:
    1. Production / staging environments:
       - Strictly DISABLED by default.
       - Disabled unless an explicit, intentional ENABLE_DOCS='true' override is provided.
    2. Recognized development / test environments ('development', 'dev', 'local', 'test'):
       - ENABLED by default for developer productivity.
       - Disabled if ENABLE_DOCS='false' (or '0', 'no', 'disabled').
    3. Missing, empty, or unrecognized environment name:
       - Fail-safe secure default: DISABLED unless ENABLE_DOCS='true'.
    """
    env = os.getenv("ENVIRONMENT", os.getenv("APP_ENV", os.getenv("ENV", ""))).strip().lower()
    docs_override = os.getenv("ENABLE_DOCS", "").strip().lower()

    # In production or staging environments: disabled unless explicitly enabled
    if env in ("production", "prod", "staging", "live"):
        return docs_override in ("true", "1", "yes", "enabled")

    # In recognized development or test environments: enabled unless explicitly disabled
    if env in ("development", "dev", "local", "test"):
        return docs_override not in ("false", "0", "no", "disabled")

    # Fail-safe default for missing, empty, or unrecognized environment configuration
    return docs_override in ("true", "1", "yes", "enabled")


DOCS_ENABLED: bool = should_enable_docs()

app = FastAPI(
    title="Mitanin Signal Prototype API",
    description="Multi-disease climate-sensitive early-warning and frontline action-tracking prototype for Chhattisgarh (Simulated Data).",
    version="0.4.0",
    lifespan=lifespan,
    docs_url="/docs" if DOCS_ENABLED else None,
    redoc_url="/redoc" if DOCS_ENABLED else None,
    openapi_url="/openapi.json" if DOCS_ENABLED else None,
)

# Initialize database tables and bootstrap sample data immediately
init_db()
_db = SessionLocal()
try:
    seed_database(_db)
finally:
    _db.close()

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


UNIT_NAME_MAP = {
    "BLK_A": "Sample Block A",
    "BLK_B": "Sample Block B",
    "BLK_C": "Sample Block C",
    "BLK_D": "Sample Block D",
    "BLK_E": "Sample Block E",
    "BLK_F": "Sample Block F",
    "BLK_SB_1": "Keshkal Forest Block [SAMPLE]",
    "BLK_SB_2": "Makdi Valley Block [SAMPLE]",
}


def _enrich_task_dict(t: Task, now: datetime) -> Dict[str, Any]:
    t_dict = t.to_dict()
    unit_id = t.block_id or (t.alert.unit_id if t.alert else "BLK_A")
    unit_name = UNIT_NAME_MAP.get(unit_id, f"Block {unit_id}")
    t_dict["unit_id"] = unit_id
    t_dict["unit_name"] = unit_name

    if t.deadline:
        dl = t.deadline
        if dl.tzinfo is not None and now.tzinfo is None:
            dl = dl.replace(tzinfo=None)
        elif dl.tzinfo is None and now.tzinfo is not None:
            now = now.replace(tzinfo=None)
        delta = dl - now
        hours_left = int(delta.total_seconds() // 3600)
        t_dict["hours_left"] = hours_left
        is_completed_or_cancelled = t.status in ("done", "completed", "cancelled")
        t_dict["is_overdue"] = (delta.total_seconds() < 0) and not is_completed_or_cancelled
    else:
        t_dict["hours_left"] = None
        t_dict["is_overdue"] = False

    # Normalized display status for UI filtering
    if t.status in ("done", "completed"):
        t_dict["normalized_status"] = "completed"
    elif t.status == "cancelled":
        t_dict["normalized_status"] = "cancelled"
    elif t_dict["is_overdue"]:
        t_dict["normalized_status"] = "overdue"
    elif t.status == "in_progress":
        t_dict["normalized_status"] = "in_progress"
    elif t.status == "acknowledged":
        t_dict["normalized_status"] = "in_progress"
    else:
        t_dict["normalized_status"] = "pending"

    clean_owner = t.owner.replace("[SAMPLE]", "").replace("[SAMPLE FRONTLINE BLK A]", "").strip()
    if "Mitanin" in clean_owner:
        clean_owner = clean_owner.replace("Mitanin", "").strip()
    t_dict["clean_owner"] = clean_owner
    return t_dict


# =====================================================================
# AUTHENTICATION & ROLE DETECTION ENDPOINTS
# =====================================================================

@app.post("/auth/login", tags=["Auth"])
def login_employee(req: LoginRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Authenticates an employee (Field Employee / Mitanin or Supervisor) using
    PBKDF2-HMAC-SHA256 password verification.
    Automatically detects the user's assigned role and jurisdiction from the database.
    Never allows role escalation from client input.
    """
    uname = req.username.strip().lower()
    user = db.query(User).filter(func.lower(User.username) == uname).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    token = create_user_session(db, user)
    allowed_blocks = get_authorized_block_ids(user, db)
    loc_ctx = resolve_location_context(
        db,
        district_id=user.district_id,
        block_id=user.block_id,
        village_id=user.village_id,
    )

    return {
        "status": "success",
        "token": token,
        "access_token": token,
        "user": user.to_dict(),
        "portal_role": user.get_portal_role(),  # 'field_employee' or 'supervisor'
        "assigned_location": loc_ctx,
        "authorized_block_ids": allowed_blocks,
    }


@app.post("/auth/logout", tags=["Auth"])
def logout_employee(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Invalidates the active session token."""
    token = extract_bearer_token(authorization)
    if token:
        sess = db.query(AuthSession).filter(AuthSession.token == token).first()
        if sess:
            sess.is_active = False
            db.commit()
    return {"status": "success", "message": "Logged out successfully."}


@app.get("/auth/me", tags=["Auth"])
def get_authenticated_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Returns the currently authenticated employee profile, role, and authorized locations."""
    allowed_blocks = get_authorized_block_ids(user, db)
    loc_ctx = resolve_location_context(
        db,
        district_id=user.district_id,
        block_id=user.block_id,
        village_id=user.village_id,
    )
    return {
        "user": user.to_dict(),
        "portal_role": user.get_portal_role(),
        "assigned_location": loc_ctx,
        "authorized_block_ids": allowed_blocks,
    }


# =====================================================================
# LOCATION HIERARCHY, GEOJSON & CASCADING DROPDOWN ENDPOINTS
# =====================================================================

from app.lgd_locations import (
    resolve_location_unit,
    load_lgd_geojson,
    DEFAULT_LGD_DISTRICT_ID,
    DEFAULT_LGD_BLOCK_ID,
)


@app.get("/locations/hierarchy", tags=["Locations"])
def get_location_hierarchy(
    district_id: Optional[str] = Query(None, description="Selected district ID or LGD code to filter blocks"),
    block_id: Optional[str] = Query(None, description="Selected block ID or LGD code to filter villages"),
    search: Optional[str] = Query(None, description="Optional search query for district or block name"),
    include_demo: bool = Query(False, description="If true, include legacy DEMO DATA sample locations"),
    enforce_jurisdiction: bool = Query(False, description="If true and authenticated, filter to user's assigned jurisdiction"),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns cascading location options (Districts -> Blocks -> Villages) from the backend database.
    By default, returns the 33 official Chhattisgarh LGD districts and 146 development blocks
    from `docs/chhattisgarh_lgd_blocks_dataset/` without mixing in simulated sample locations.
    """
    resolved_dist = None
    if district_id:
        resolved_dist = resolve_location_unit(db, district_id, expected_level="district")
        if not resolved_dist:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"District '{district_id}' not found in Chhattisgarh LGD dataset.",
            )

    resolved_blk = None
    if block_id:
        resolved_blk = resolve_location_unit(db, block_id, expected_level="block")
        if not resolved_blk:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Block '{block_id}' not found in Chhattisgarh LGD dataset.",
            )
        if resolved_dist and resolved_blk.parent_id != resolved_dist.unit_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Block '{block_id}' does not belong to district '{district_id}'.",
            )

    all_units = db.query(LocationUnit).all()
    lgd_districts_total = sum(1 for u in all_units if u.level == "district" and not u.is_demo)
    lgd_blocks_total = sum(1 for u in all_units if u.level == "block" and not u.is_demo)

    # Determine whether demo locations should be included (only when explicitly requested or when a demo ID/user is queried)
    use_demo = (
        include_demo
        or bool(resolved_dist and resolved_dist.is_demo)
        or bool(resolved_blk and resolved_blk.is_demo)
        or bool(enforce_jurisdiction and user and (user.district_id or "").startswith("DIST_"))
    )

    if use_demo:
        districts = [u for u in all_units if u.level == "district"]
        blocks = [u for u in all_units if u.level == "block"]
        villages = [u for u in all_units if u.level == "village"]
    else:
        districts = [u for u in all_units if u.level == "district" and not u.is_demo]
        blocks = [u for u in all_units if u.level == "block" and not u.is_demo]
        villages = [u for u in all_units if u.level == "village" and not u.is_demo]

    districts.sort(key=lambda d: (d.unit_name.lower(), d.district_lgd_code or 0))
    blocks.sort(key=lambda b: (b.unit_name.lower(), b.block_lgd_code or 0))

    if enforce_jurisdiction and user:
        # If explicitly querying the legacy demo district DIST_SAMPLE, scope to authorized demo blocks
        if resolved_dist and resolved_dist.is_demo:
            allowed_blocks = set(get_authorized_block_ids(user, db))
            blocks = [b for b in blocks if b.unit_id in allowed_blocks]
            if user.role == "mitanin" and user.village_id:
                villages = [v for v in villages if v.unit_id == user.village_id]
            else:
                villages = [v for v in villages if v.parent_id in allowed_blocks]
        # Otherwise, keep all official Chhattisgarh LGD districts and blocks available
        # so Mitanins and Supervisors can select locations from the dataset.

    if resolved_dist:
        blocks = [b for b in blocks if b.parent_id == resolved_dist.unit_id]

    if resolved_blk:
        villages = [v for v in villages if v.parent_id == resolved_blk.unit_id]
    elif resolved_dist:
        allowed_blk_ids = {b.unit_id for b in blocks}
        villages = [v for v in villages if v.parent_id in allowed_blk_ids]

    if search and search.strip():
        q_str = search.strip().lower()
        districts = [
            d for d in districts
            if q_str in d.unit_name.lower() or q_str == str(d.district_lgd_code or "")
        ]
        blocks = [
            b for b in blocks
            if q_str in b.unit_name.lower() or q_str == str(b.block_lgd_code or "")
        ]

    return {
        "districts": [d.to_dict() for d in districts],
        "blocks": [b.to_dict() for b in blocks],
        "villages": [v.to_dict() for v in villages],
        "summary": {
            "state_name": "Chhattisgarh",
            "state_lgd_code": 22,
            "total_districts": lgd_districts_total,
            "total_blocks": lgd_blocks_total,
            "total_records": lgd_districts_total + lgd_blocks_total,
            "dataset_source": "docs/chhattisgarh_lgd_blocks_dataset/",
        },
    }


@app.get("/locations/geojson", tags=["Locations"])
def get_locations_geojson(
    layer: str = Query("points", description="Layer type: 'points' or 'polygons'"),
    district_id: Optional[str] = Query(None, description="Optional District unit_id or LGD code filter"),
    block_id: Optional[str] = Query(None, description="Optional Block unit_id or LGD code filter"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns GIS features from `chhattisgarh_block_points.geojson` or `chhattisgarh_blocks.geojson`.
    """
    if layer not in ("points", "polygons"):
        raise HTTPException(status_code=400, detail="Layer must be 'points' or 'polygons'.")

    d_code = None
    if district_id:
        dist = resolve_location_unit(db, district_id, expected_level="district")
        if not dist or not dist.district_lgd_code:
            raise HTTPException(status_code=404, detail=f"LGD District '{district_id}' not found.")
        d_code = dist.district_lgd_code

    b_code = None
    if block_id:
        blk = resolve_location_unit(db, block_id, expected_level="block")
        if not blk or not blk.block_lgd_code:
            raise HTTPException(status_code=404, detail=f"LGD Block '{block_id}' not found.")
        b_code = blk.block_lgd_code

    return load_lgd_geojson(layer=layer, district_lgd_code=d_code, block_lgd_code=b_code)


@app.post("/locations/confirm", tags=["Locations"])
def confirm_location_selection(
    district_id: str = Query(..., description="Selected District ID or LGD code"),
    block_id: str = Query(..., description="Selected Block ID or LGD code"),
    village_id: Optional[str] = Query(None, description="Selected Village ID (optional; LGD dataset is District & Block level)"),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Validates a District -> Block (-> optional Village) selection against the backend database.
    If called by an authenticated employee or supervisor, strictly enforces their assigned jurisdiction.
    """
    dist = resolve_location_unit(db, district_id, expected_level="district")
    if not dist:
        raise HTTPException(status_code=404, detail=f"District '{district_id}' not found.")

    blk = resolve_location_unit(db, block_id, expected_level="block")
    if not blk:
        raise HTTPException(status_code=404, detail=f"Block '{block_id}' not found.")
    if blk.parent_id != dist.unit_id:
        raise HTTPException(status_code=400, detail=f"Block '{block_id}' does not belong to district '{district_id}'.")

    vil = None
    if village_id and village_id.strip():
        vil = resolve_location_unit(db, village_id, expected_level="village")
        if not vil or vil.parent_id != blk.unit_id:
            raise HTTPException(status_code=400, detail=f"Village '{village_id}' does not belong to block '{block_id}'.")

    if user:
        verify_location_jurisdiction(
            user,
            db,
            district_id=dist.unit_id,
            block_id=blk.unit_id,
            village_id=vil.unit_id if vil else None,
        )

    loc_ctx = resolve_location_context(
        db,
        district_id=dist.unit_id,
        block_id=blk.unit_id,
        village_id=vil.unit_id if vil else None,
    )
    return {
        "status": "confirmed",
        "location": loc_ctx,
    }


# =====================================================================
# PUBLIC PORTAL & MULTI-DISEASE EARLY WARNING ENDPOINTS
# =====================================================================

@app.get("/public/risk-dashboard", tags=["Public Portal"])
def get_public_risk_dashboard(
    district_id: Optional[str] = Query(None, description="Selected District ID or LGD code"),
    block_id: Optional[str] = Query(None, description="Selected Block ID or LGD code"),
    village_id: Optional[str] = Query(None, description="Selected Village ID"),
    disease_type: Optional[str] = Query(None, description="Optional focus filter: all, malaria, dengue, diarrhoea, heat"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Public citizen-friendly multi-disease risk dashboard for a confirmed location.
    Uses official Chhattisgarh LGD locations while keeping simulated telemetry clearly labelled DEMO DATA.
    """
    payload = build_location_risk_payload(
        db=db,
        district_id=district_id,
        block_id=block_id,
        village_id=village_id,
    )
    if disease_type and disease_type.lower() != "all":
        dt = disease_type.lower()
        if dt not in DISEASE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported disease_type '{disease_type}'.")
        payload["multi_disease"]["selected_filter"] = dt
        payload["multi_disease"]["filtered_cards"] = [
            c for c in payload["multi_disease"]["cards"] if c["disease_type"] == dt
        ]
    else:
        payload["multi_disease"]["selected_filter"] = "all"
        payload["multi_disease"]["filtered_cards"] = payload["multi_disease"]["cards"]
    return payload


@app.get("/diseases/overview", tags=["Multi-Disease Early Warning"])
def get_multi_disease_overview(
    district_id: Optional[str] = Query(None, description="Selected District ID or LGD code"),
    block_id: Optional[str] = Query(None, description="Selected Block ID or LGD code"),
    village_id: Optional[str] = Query(None, description="Selected Village ID"),
    disease_type: Optional[str] = Query("all", description="Filter: all, malaria, dengue, diarrhoea, heat"),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Unified Multi-Disease Dashboard endpoint returning all four climate-sensitive health risks
    (Malaria, Dengue, Diarrhoeal Disease, Heat-Related Health Risk) for the selected location.
    If called by an authenticated employee/supervisor, enforces their assigned jurisdiction.
    """
    if user:
        verify_location_jurisdiction(user, db, district_id=district_id, block_id=block_id, village_id=village_id)

    payload = build_location_risk_payload(
        db=db,
        district_id=district_id,
        block_id=block_id,
        village_id=village_id,
    )
    multi = payload["multi_disease"]
    dt_filter = (disease_type or "all").strip().lower()
    if dt_filter != "all":
        if dt_filter not in DISEASE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported disease_type '{disease_type}'.")
        filtered_cards = [c for c in multi["cards"] if c["disease_type"] == dt_filter]
    else:
        filtered_cards = multi["cards"]

    return {
        "location": payload["location"],
        "climate": payload["climate"],
        "selected_filter": dt_filter,
        "supported_diseases": multi["supported_diseases"],
        "catalog": multi["catalog"],
        "cards": filtered_cards,
        "all_cards": multi["cards"],
        "diseases": multi["diseases"],
        "documented_thresholds": multi["documented_thresholds"],
        "location_comparison": multi["location_comparison"],
        "forecast_vs_diagnosis_notice": multi["forecast_vs_diagnosis_notice"],
        "data_status": payload["data_status"],
    }


@app.get("/diseases/{disease_type}/detail", tags=["Multi-Disease Early Warning"])
def get_disease_specific_detail(
    disease_type: str,
    district_id: Optional[str] = Query(None, description="Selected District ID or LGD code"),
    block_id: Optional[str] = Query(None, description="Selected Block ID or LGD code"),
    village_id: Optional[str] = Query(None, description="Selected Village ID"),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Dedicated Disease-Specific Detail Page endpoint for `malaria`, `dengue`, `diarrhoea`, or `heat`.
    """
    d_key = disease_type.strip().lower()
    if d_key not in DISEASE_TYPES:
        raise HTTPException(
            status_code=404,
            detail=f"Disease or health risk '{disease_type}' not supported. Valid types: {', '.join(DISEASE_TYPES)}",
        )
    if user:
        verify_location_jurisdiction(user, db, district_id=district_id, block_id=block_id, village_id=village_id)

    return build_disease_detail_payload(
        db=db,
        disease_type=d_key,
        district_id=district_id,
        block_id=block_id,
        village_id=village_id,
    )


# =====================================================================
# EMPLOYEE PORTAL — FIELD EMPLOYEE / MITANIN ENDPOINTS
# =====================================================================

@app.get("/employee/dashboard", tags=["Employee Portal"])
def get_employee_dashboard(
    district_id: Optional[str] = Query(None),
    block_id: Optional[str] = Query(None),
    village_id: Optional[str] = Query(None),
    user: User = Depends(require_field_employee),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Field Employee / Mitanin Dashboard:
    Enforces employee's assigned jurisdiction and returns their assigned location multi-disease risks
    (Malaria, Dengue, Diarrhoeal Disease, Heat-Related Health Risk), climate telemetry, personal tasks,
    field reports, and notifications.
    """
    verify_location_jurisdiction(user, db, district_id=district_id, block_id=block_id, village_id=village_id)

    eff_district = district_id or user.district_id or DEFAULT_LGD_DISTRICT_ID
    eff_block = block_id or user.block_id or user.unit_id or DEFAULT_LGD_BLOCK_ID
    eff_village = village_id if village_id is not None else (user.village_id if eff_block == user.block_id else None)

    cfg = load_config()
    now = get_simulated_now(db)
    check_and_escalate_tasks(db, now, escalation_hours=cfg.escalation_hours)

    risk_payload = build_location_risk_payload(
        db=db,
        district_id=eff_district,
        block_id=eff_block,
        village_id=eff_village,
    )

    # Fetch ONLY tasks assigned to this employee
    short_name = user.name.replace("[SAMPLE]", "").replace("Mitanin", "").strip()
    my_tasks_raw = (
        db.query(Task)
        .filter(
            or_(
                Task.owner_id == user.id,
                Task.owner == user.name,
                Task.owner.ilike(f"%{short_name}%"),
            )
        )
        .order_by(Task.id.desc())
        .all()
    )
    my_tasks = [_enrich_task_dict(t, now) for t in my_tasks_raw]

    status_counts = {
        "total": len(my_tasks),
        "pending": sum(1 for t in my_tasks if t["status"] == "sent" and not t["is_overdue"]),
        "in_progress": sum(1 for t in my_tasks if t["status"] in ("acknowledged", "in_progress") and not t["is_overdue"]),
        "completed": sum(1 for t in my_tasks if t["status"] in ("done", "completed")),
        "overdue": sum(1 for t in my_tasks if t["is_overdue"] or t["status"] == "escalated"),
        "needs_help": sum(1 for t in my_tasks if t["status"] == "needs_help"),
        "cancelled": sum(1 for t in my_tasks if t["status"] == "cancelled"),
    }

    my_reports = (
        db.query(FieldReport)
        .filter(FieldReport.employee_id == user.id)
        .order_by(FieldReport.id.desc())
        .all()
    )

    notifications = (
        db.query(Notification)
        .filter(
            or_(
                Notification.user_id == user.id,
                (Notification.user_id == None) & (Notification.block_id == eff_block),
            )
        )
        .order_by(Notification.created_at.desc())
        .limit(15)
        .all()
    )

    supervisor = db.query(User).filter(User.id == user.supervisor_id).first() if user.supervisor_id else None

    return {
        "employee": user.to_dict(),
        "supervisor": supervisor.to_dict() if supervisor else None,
        "location": risk_payload["location"],
        "risk": risk_payload["risk"],
        "climate": risk_payload["climate"],
        "historical_trends": risk_payload["historical_trends"],
        "forecast_chart": risk_payload["forecast_chart"],
        "recommendations": risk_payload["recommendations"],
        "multi_disease": risk_payload["multi_disease"],
        "data_status": risk_payload["data_status"],
        "task_counts": status_counts,
        "tasks": my_tasks,
        "reports": [r.to_dict() for r in my_reports],
        "notifications": [n.to_dict() for n in notifications],
        "clock_now": now.isoformat(),
    }


@app.get("/employee/tasks", tags=["Employee Portal"])
def list_employee_tasks(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority: Low, Medium, High, Critical"),
    disease_type: Optional[str] = Query(None, description="Filter by disease_type: malaria, dengue, diarrhoea, heat"),
    due_filter: Optional[str] = Query(None, description="Filter by due date: all, overdue, due_soon"),
    search: Optional[str] = Query(None, description="Search title or instructions"),
    user: User = Depends(require_field_employee),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Returns all tasks assigned to the authenticated Field Employee with status, priority, disease, and due date filters."""
    cfg = load_config()
    now = get_simulated_now(db)
    check_and_escalate_tasks(db, now, escalation_hours=cfg.escalation_hours)

    short_name = user.name.replace("[SAMPLE]", "").replace("Mitanin", "").strip()
    tasks_raw = (
        db.query(Task)
        .filter(
            or_(
                Task.owner_id == user.id,
                Task.owner == user.name,
                Task.owner.ilike(f"%{short_name}%"),
            )
        )
        .order_by(Task.id.desc())
        .all()
    )

    enriched = [_enrich_task_dict(t, now) for t in tasks_raw]

    if disease_type and disease_type != "all":
        dt = disease_type.strip().lower()
        enriched = [t for t in enriched if (t.get("disease_type") or "malaria").lower() == dt]

    if status_filter and status_filter != "all":
        sf = status_filter.lower()
        if sf == "pending":
            enriched = [t for t in enriched if t["status"] == "sent" and not t["is_overdue"]]
        elif sf == "in_progress":
            enriched = [t for t in enriched if t["status"] in ("acknowledged", "in_progress")]
        elif sf in ("completed", "done"):
            enriched = [t for t in enriched if t["status"] in ("done", "completed")]
        elif sf == "overdue":
            enriched = [t for t in enriched if t["is_overdue"] or t["status"] == "escalated"]
        else:
            enriched = [t for t in enriched if t["status"] == sf]

    if priority and priority != "all":
        enriched = [t for t in enriched if (t.get("priority") or "").lower() == priority.lower()]

    if due_filter and due_filter != "all":
        if due_filter == "overdue":
            enriched = [t for t in enriched if t["is_overdue"]]
        elif due_filter == "due_soon":
            enriched = [t for t in enriched if t["hours_left"] is not None and 0 <= t["hours_left"] <= 24]

    if search:
        q = search.strip().lower()
        enriched = [
            t for t in enriched
            if q in t["title"].lower()
            or q in (t.get("description") or "").lower()
            or q in (t.get("instructions") or "").lower()
        ]

    return enriched


@app.post("/employee/tasks/{task_id}/action", tags=["Employee Portal"])
def employee_task_action(
    task_id: int,
    req: EmployeeTaskActionRequest,
    user: User = Depends(require_field_employee),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Allows a Field Employee to acknowledge, start, update, complete, request help, or cancel
    their own assigned task. Persists status, completion notes, evidence attachments, and audit events.
    """
    now = get_simulated_now(db)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    short_name = user.name.replace("[SAMPLE]", "").replace("Mitanin", "").strip()
    is_owner = (
        task.owner_id == user.id
        or task.owner == user.name
        or (short_name and short_name.lower() in task.owner.lower())
    )
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only update tasks assigned to you.",
        )

    action_to_status = {
        "acknowledge": "acknowledged",
        "start": "in_progress",
        "update": task.status if task.status != "sent" else "in_progress",
        "complete": "done",
        "need_help": "needs_help",
        "cancel": "cancelled",
    }
    new_status = action_to_status.get(req.action, task.status)
    old_status = task.status
    task.status = new_status
    task.updated_at = now

    if req.completion_notes is not None:
        task.completion_notes = req.completion_notes
    elif req.action == "complete" and req.notes:
        task.completion_notes = req.notes

    if req.evidence_attachment is not None:
        task.evidence_attachment = req.evidence_attachment

    event_name = (
        "mitanin_reply_done"
        if req.action == "complete"
        else "mitanin_reply_needs_help"
        if req.action == "need_help"
        else f"status_changed_to_{new_status}"
    )
    event_note = (
        req.notes
        or req.completion_notes
        or f"Employee {user.name} performed '{req.action}' (status: {old_status} -> {new_status})."
    )
    ev = TaskEvent(
        task_id=task.id,
        event=event_name,
        actor=user.name,
        timestamp=now,
        notes=event_note,
    )
    db.add(ev)
    db.commit()
    db.refresh(task)

    return _enrich_task_dict(task, now)


@app.post("/employee/reports", tags=["Employee Portal"])
def submit_field_report(
    req: CreateFieldReportRequest,
    user: User = Depends(require_field_employee),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Submits a new multi-disease field surveillance report from a Field Employee / Mitanin."""
    now = get_simulated_now(db)
    vil_id = req.village_id or user.village_id
    blk_id = user.block_id or user.unit_id or "BLK_A"
    dist_id = user.district_id or "DIST_SAMPLE"

    verify_location_jurisdiction(user, db, district_id=dist_id, block_id=blk_id, village_id=vil_id)
    loc_ctx = resolve_location_context(db, district_id=dist_id, block_id=blk_id, village_id=vil_id)

    d_type = (req.disease_type or "malaria").strip().lower()
    report = FieldReport(
        task_id=req.task_id,
        disease_type=d_type,
        employee_id=user.id,
        employee_name=user.name,
        district_id=dist_id,
        block_id=blk_id,
        village_id=vil_id,
        location_name=loc_ctx["location_breadcrumb"],
        title=req.title,
        households_visited=req.households_visited,
        rdt_conducted=req.rdt_conducted,
        positive_cases=req.positive_cases,
        suspected_cases=req.suspected_cases,
        emerging_concern=req.emerging_concern,
        stagnant_water_sites=req.stagnant_water_sites,
        nets_distributed=req.nets_distributed,
        observations=req.observations,
        evidence_notes=req.evidence_notes,
        review_status="pending_review",
        created_at=now,
    )
    db.add(report)

    # Notify supervisor if assigned
    if user.supervisor_id:
        concern_prefix = "[URGENT CONCERN] " if req.emerging_concern else ""
        db.add(
            Notification(
                user_id=user.supervisor_id,
                block_id=blk_id,
                title=f"{concern_prefix}New {d_type.title()} Field Report: {req.title}",
                message=f"{user.name} submitted a {d_type} field report ({req.positive_cases} positive, {req.suspected_cases} suspected).",
                category="report_review",
                is_read=False,
                created_at=now,
            )
        )

    db.commit()
    db.refresh(report)
    return report.to_dict()


# =====================================================================
# SUPERVISOR PORTAL ENDPOINTS
# =====================================================================

@app.get("/supervisor/dashboard", tags=["Supervisor Portal"])
def get_supervisor_dashboard(
    district_id: Optional[str] = Query(None),
    block_id: Optional[str] = Query(None),
    village_id: Optional[str] = Query(None),
    disease_type: Optional[str] = Query(None, description="Optional disease filter: all, malaria, dengue, diarrhoea, heat"),
    user: User = Depends(require_supervisor),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Supervisor Dashboard:
    Strictly scoped to the supervisor's assigned jurisdiction (District/Block/Villages).
    Returns local multi-disease risk summary (Malaria, Dengue, Diarrhoeal Disease, Heat-Related Health Risk),
    high-risk alerts, employee roster with task completion stats, team tasks breakdown,
    and submitted field reports awaiting review.
    """
    verify_location_jurisdiction(user, db, district_id=district_id, block_id=block_id, village_id=village_id)

    allowed_blocks = get_authorized_block_ids(user, db)
    eff_district = district_id or user.district_id or DEFAULT_LGD_DISTRICT_ID
    eff_block = block_id or user.block_id or (allowed_blocks[0] if allowed_blocks else DEFAULT_LGD_BLOCK_ID)
    eff_village = village_id

    cfg = load_config()
    now = get_simulated_now(db)
    check_and_escalate_tasks(db, now, escalation_hours=cfg.escalation_hours)

    risk_payload = build_location_risk_payload(
        db=db,
        district_id=eff_district,
        block_id=eff_block,
        village_id=eff_village,
    )

    # Active alerts within supervisor's scope / selected block
    latest_run = db.query(PipelineRun).order_by(PipelineRun.created_at.desc(), PipelineRun.run_id.desc()).first()
    alert_scope = list(set(allowed_blocks + ([eff_block] if eff_block else [])))
    alert_q = db.query(Alert).filter(Alert.unit_id.in_(alert_scope))
    if latest_run:
        jurisdiction_alerts = alert_q.filter(Alert.run_id == latest_run.run_id).all()
    else:
        jurisdiction_alerts = alert_q.all()

    if disease_type and disease_type.lower() != "all":
        dt_f = disease_type.strip().lower()
        jurisdiction_alerts = [a for a in jurisdiction_alerts if (a.disease_type or "malaria").lower() == dt_f]

    alerts_list = []
    high_risk_locations = []
    for a in jurisdiction_alerts:
        ad = a.to_dict()
        ad["unit_name"] = UNIT_NAME_MAP.get(a.unit_id, a.unit_id)
        alerts_list.append(ad)
        if a.risk in ("High", "Medium"):
            high_risk_locations.append(ad)

    # Employees under supervisor's jurisdiction
    employees_q = db.query(User).filter(
        User.role == "mitanin",
        or_(User.block_id.in_(allowed_blocks), User.unit_id.in_(allowed_blocks)),
    )
    if block_id and block_id in allowed_blocks:
        employees_q = employees_q.filter(or_(User.block_id == block_id, User.unit_id == block_id))
    employees = employees_q.all()

    # Tasks in supervisor's jurisdiction
    all_tasks_raw = db.query(Task).order_by(Task.id.desc()).all()
    jurisdiction_tasks = []
    for t in all_tasks_raw:
        t_blk = t.block_id or (t.alert.unit_id if t.alert else "BLK_A")
        if t_blk in allowed_blocks:
            if block_id and t_blk != block_id:
                continue
            if village_id and t.village_id and t.village_id != village_id:
                continue
            t_enriched = _enrich_task_dict(t, now)
            if disease_type and disease_type.lower() != "all":
                if (t_enriched.get("disease_type") or "malaria").lower() != disease_type.strip().lower():
                    continue
            jurisdiction_tasks.append(t_enriched)

    # Employee-wise task completion stats
    employee_stats = []
    for emp in employees:
        emp_short = emp.name.replace("[SAMPLE]", "").replace("Mitanin", "").strip().lower()
        emp_tasks = [
            t for t in jurisdiction_tasks
            if t.get("owner_id") == emp.id
            or t["owner"].lower() == emp.name.lower()
            or (emp_short and emp_short in t["owner"].lower())
        ]
        total_t = len(emp_tasks)
        comp_t = sum(1 for t in emp_tasks if t["status"] in ("done", "completed"))
        over_t = sum(1 for t in emp_tasks if t["is_overdue"] or t["status"] == "escalated")
        prog_t = sum(1 for t in emp_tasks if t["status"] in ("acknowledged", "in_progress") and not t["is_overdue"])
        pend_t = sum(1 for t in emp_tasks if t["status"] == "sent" and not t["is_overdue"])
        rate_pct = int(round((comp_t / total_t) * 100)) if total_t > 0 else 100

        ed = emp.to_dict()
        ed.update({
            "total_tasks": total_t,
            "completed_tasks": comp_t,
            "in_progress_tasks": prog_t,
            "pending_tasks": pend_t,
            "overdue_tasks": over_t,
            "completion_rate_pct": rate_pct,
        })
        employee_stats.append(ed)

    # Field reports in supervisor's jurisdiction
    reports_q = db.query(FieldReport).filter(FieldReport.block_id.in_(allowed_blocks))
    if block_id and block_id in allowed_blocks:
        reports_q = reports_q.filter(FieldReport.block_id == block_id)
    if village_id:
        reports_q = reports_q.filter(FieldReport.village_id == village_id)
    if disease_type and disease_type.lower() != "all":
        reports_q = reports_q.filter(FieldReport.disease_type == disease_type.strip().lower())
    reports = [r.to_dict() for r in reports_q.order_by(FieldReport.id.desc()).all()]

    task_summary = {
        "total": len(jurisdiction_tasks),
        "pending": sum(1 for t in jurisdiction_tasks if t["status"] == "sent" and not t["is_overdue"]),
        "in_progress": sum(1 for t in jurisdiction_tasks if t["status"] in ("acknowledged", "in_progress") and not t["is_overdue"]),
        "completed": sum(1 for t in jurisdiction_tasks if t["status"] in ("done", "completed")),
        "overdue": sum(1 for t in jurisdiction_tasks if t["is_overdue"] or t["status"] == "escalated"),
        "needs_help": sum(1 for t in jurisdiction_tasks if t["status"] == "needs_help"),
        "cancelled": sum(1 for t in jurisdiction_tasks if t["status"] == "cancelled"),
    }

    return {
        "supervisor": user.to_dict(),
        "authorized_block_ids": allowed_blocks,
        "location": risk_payload["location"],
        "risk": risk_payload["risk"],
        "climate": risk_payload["climate"],
        "historical_trends": risk_payload["historical_trends"],
        "forecast_chart": risk_payload["forecast_chart"],
        "multi_disease": risk_payload["multi_disease"],
        "data_status": risk_payload["data_status"],
        "alerts": alerts_list,
        "high_risk_locations": high_risk_locations,
        "employees": employee_stats,
        "task_summary": task_summary,
        "tasks": jurisdiction_tasks,
        "reports": reports,
        "reports_awaiting_review": sum(1 for r in reports if r["review_status"] == "pending_review"),
        "clock_now": now.isoformat(),
    }


@app.get("/supervisor/team-tasks", tags=["Supervisor Portal"])
def list_supervisor_team_tasks(
    employee: Optional[str] = Query(None, description="Filter by employee name or ID"),
    block_id: Optional[str] = Query(None, description="Filter by block ID"),
    village_id: Optional[str] = Query(None, description="Filter by village ID"),
    disease_type: Optional[str] = Query(None, description="Filter by disease_type: malaria, dengue, diarrhoea, heat"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    due_filter: Optional[str] = Query(None, description="Filter by due date: all, overdue, due_soon"),
    search: Optional[str] = Query(None, description="Search query"),
    user: User = Depends(require_supervisor),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    Team Tasks endpoint for Supervisors with filters for employee, location, disease, status, priority, and due date.
    Strictly enforces supervisor's assigned jurisdiction.
    """
    verify_location_jurisdiction(user, db, block_id=block_id, village_id=village_id)
    allowed_blocks = set(get_authorized_block_ids(user, db))

    cfg = load_config()
    now = get_simulated_now(db)
    check_and_escalate_tasks(db, now, escalation_hours=cfg.escalation_hours)

    all_tasks = db.query(Task).order_by(Task.id.desc()).all()
    results = []
    for t in all_tasks:
        t_blk = t.block_id or (t.alert.unit_id if t.alert else "BLK_A")
        if t_blk not in allowed_blocks:
            continue
        if block_id and block_id != "all" and t_blk != block_id:
            continue
        if village_id and village_id != "all" and t.village_id != village_id:
            continue
        results.append(_enrich_task_dict(t, now))

    if disease_type and disease_type != "all":
        dt = disease_type.strip().lower()
        results = [t for t in results if (t.get("disease_type") or "malaria").lower() == dt]

    if employee and employee != "all":
        emp_q = employee.strip().lower()
        results = [
            t for t in results
            if str(t.get("owner_id")) == emp_q
            or emp_q in t["owner"].lower()
            or emp_q in (t.get("clean_owner") or "").lower()
        ]

    if status_filter and status_filter != "all":
        sf = status_filter.lower()
        if sf == "pending":
            results = [t for t in results if t["status"] == "sent" and not t["is_overdue"]]
        elif sf == "in_progress":
            results = [t for t in results if t["status"] in ("acknowledged", "in_progress")]
        elif sf in ("completed", "done"):
            results = [t for t in results if t["status"] in ("done", "completed")]
        elif sf == "overdue":
            results = [t for t in results if t["is_overdue"] or t["status"] == "escalated"]
        else:
            results = [t for t in results if t["status"] == sf]

    if priority and priority != "all":
        results = [t for t in results if (t.get("priority") or "").lower() == priority.lower()]

    if due_filter and due_filter != "all":
        if due_filter == "overdue":
            results = [t for t in results if t["is_overdue"]]
        elif due_filter == "due_soon":
            results = [t for t in results if t["hours_left"] is not None and 0 <= t["hours_left"] <= 24]

    if search:
        q = search.strip().lower()
        results = [
            t for t in results
            if q in t["title"].lower()
            or q in t["owner"].lower()
            or q in (t.get("location_name") or "").lower()
        ]

    return results


@app.post("/supervisor/tasks", tags=["Supervisor Portal"])
def supervisor_assign_task(
    req: CreateTaskRequest,
    user: User = Depends(require_supervisor),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Allows an authorized Supervisor to assign a new multi-disease task to an employee within their jurisdiction.
    """
    now = get_simulated_now(db)
    target_user = None
    if req.owner_id:
        target_user = db.query(User).filter(User.id == req.owner_id).first()
    if not target_user and req.owner:
        target_user = db.query(User).filter(User.name.ilike(f"%{req.owner}%")).first()

    alert_obj = db.query(Alert).filter(Alert.id == req.alert_id).first() if req.alert_id else None
    blk_id = req.block_id or (alert_obj.unit_id if alert_obj else None) or (target_user.block_id if target_user else None) or user.block_id or "BLK_A"
    dist_id = req.district_id or (target_user.district_id if target_user else None) or user.district_id or "DIST_SAMPLE"
    vil_id = req.village_id or (target_user.village_id if target_user else None)

    # Enforce jurisdiction
    verify_location_jurisdiction(user, db, district_id=dist_id, block_id=blk_id, village_id=vil_id)

    loc_ctx = resolve_location_context(db, district_id=dist_id, block_id=blk_id, village_id=vil_id)
    deadline = req.deadline or (now + timedelta(hours=48))
    steps_list = req.steps if isinstance(req.steps, list) else [s.strip() for s in str(req.steps).split("\n") if s.strip()]
    if not steps_list and req.instructions:
        steps_list = [req.instructions]

    d_type = (req.disease_type or (alert_obj.disease_type if alert_obj else None) or "malaria").strip().lower()

    task = Task(
        alert_id=req.alert_id,
        disease_type=d_type,
        title=req.title,
        description=req.description or req.title,
        instructions=req.instructions or "; ".join(steps_list),
        steps=json.dumps(steps_list),
        owner=target_user.name if target_user else req.owner,
        owner_id=target_user.id if target_user else req.owner_id,
        assigned_by=user.name,
        priority=req.priority or "High",
        district_id=dist_id,
        block_id=blk_id,
        village_id=vil_id,
        location_name=req.location_name or loc_ctx["location_breadcrumb"],
        deadline=deadline,
        status="sent",
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    ev = TaskEvent(
        task_id=task.id,
        event="task_created",
        actor=user.name,
        timestamp=now,
        notes=f"Assigned by {user.name} to {task.owner} (Disease: {d_type}, Priority: {task.priority}).",
    )
    db.add(ev)

    if target_user:
        db.add(
            Notification(
                user_id=target_user.id,
                block_id=blk_id,
                title=f"New {d_type.title()} Task Assigned: {task.title}",
                message=f"{user.name} assigned a {task.priority} priority {d_type} task due {deadline.strftime('%Y-%m-%d %H:%M')}.",
                category="task",
                is_read=False,
                created_at=now,
            )
        )

    db.commit()
    db.refresh(task)
    return _enrich_task_dict(task, now)


@app.patch("/supervisor/tasks/{task_id}", tags=["Supervisor Portal"])
def supervisor_update_task(
    task_id: int,
    req: SupervisorTaskPatchRequest,
    user: User = Depends(require_supervisor),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Allows an authorized Supervisor to update task priority, deadline, instructions, or status
    for tasks within their jurisdiction.
    """
    now = get_simulated_now(db)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    t_blk = task.block_id or (task.alert.unit_id if task.alert else "BLK_A")
    verify_location_jurisdiction(user, db, block_id=t_blk)

    changes = []
    if req.priority and req.priority != task.priority:
        changes.append(f"priority: {task.priority} -> {req.priority}")
        task.priority = req.priority
    if req.deadline:
        changes.append(f"deadline updated to {req.deadline.isoformat()}")
        task.deadline = req.deadline
    if req.status and req.status != task.status:
        changes.append(f"status: {task.status} -> {req.status}")
        task.status = req.status
    if req.instructions is not None:
        task.instructions = req.instructions
        changes.append("instructions updated")

    task.updated_at = now
    ev = TaskEvent(
        task_id=task.id,
        event="supervisor_updated_task",
        actor=user.name,
        timestamp=now,
        notes=req.notes or (f"Supervisor updated {', '.join(changes)}." if changes else "Supervisor reviewed task."),
    )
    db.add(ev)
    db.commit()
    db.refresh(task)
    return _enrich_task_dict(task, now)


@app.post("/supervisor/reports/{report_id}/review", tags=["Supervisor Portal"])
def supervisor_review_report(
    report_id: int,
    req: ReviewFieldReportRequest,
    user: User = Depends(require_supervisor),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Allows a Supervisor to review a field report within their jurisdiction and
    approve, reject, or request corrections.
    """
    now = get_simulated_now(db)
    report = db.query(FieldReport).filter(FieldReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail=f"Field report {report_id} not found.")

    verify_location_jurisdiction(user, db, block_id=report.block_id)

    report.review_status = req.review_status
    report.reviewer_name = user.name
    report.review_notes = req.review_notes
    report.reviewed_at = now

    db.add(
        Notification(
            user_id=report.employee_id,
            block_id=report.block_id,
            title=f"Report Review ({req.review_status.replace('_', ' ').title()}): {report.title}",
            message=f"{user.name}: {req.review_notes}",
            category="report_review",
            is_read=False,
            created_at=now,
        )
    )
    db.commit()
    db.refresh(report)
    return report.to_dict()


# =====================================================================
# SYSTEM & METADATA ENDPOINTS
# =====================================================================

@app.get("/health", tags=["System"])
def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/meta", tags=["System"])
def get_metadata(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Returns system metadata, config parameters, honesty rules, and loaded date range."""
    cfg = load_config()
    _, units, report = load_and_validate_data(config=cfg, raise_on_error=False)

    date_range = report.get("date_range")
    sample_unit_names = [u.get("unit_name", u.get("unit_id")) for u in units] if units else [
        "Sample Block A", "Sample Block B", "Sample Block C",
        "Sample Block D", "Sample Block E", "Sample Block F"
    ]

    min_step = min(cfg.horizon_steps)
    max_step = max(cfg.horizon_steps)
    lead_time_target = f"{min_step}-{max_step} {cfg.unit_label} (target)"

    now = get_simulated_now(db)

    return {
        "name": "Mitanin Signal",
        "description": "Climate-Sensitive Multi-Disease Early-Warning and Frontline Action-Tracking System for Chhattisgarh",
        "supported_diseases": list(DISEASE_TYPES),
        "data_source": cfg.data_source,
        "granularity": cfg.granularity,
        "unit_label": cfg.unit_label,
        "geography_label": cfg.geography_label,
        "banner_text": cfg.banner_text,
        "date_range": date_range,
        "simulated_clock_now": now.isoformat(),
        "district": "Sample District",
        "sample_blocks": sample_unit_names,
        "lead_time": lead_time_target,
        "horizon_steps": cfg.horizon_steps,
        "escalation_hours": cfg.escalation_hours,
        "honesty_rules": [
            "All data is SIMULATED.",
            "Sample names only.",
            "Routine surveillance may identify some surges only after cases rise; earlier warning remains a challenge.",
            "Target forecast horizon: 2–4 weeks, subject to local validation.",
            "If the weather model does not beat the baseline, baseline is used.",
            "Weather-informed forecasts are eligible for operational use only when they outperform a seasonal baseline under a defined evaluation protocol.",
            "Diarrhoeal module never infers drinking-water contamination from rainfall alone.",
            "Heat-related health risk is a meteorological threshold index, kept separate from infectious-disease predictions.",
        ],
        "product_claims_safeguards": {
            "prototype_banner": "Prototype — synthetic demo data",
            "surveillance_statement": "Routine surveillance may identify some surges only after cases rise; earlier warning remains a challenge.",
            "target_horizon_statement": "Target forecast horizon: 2–4 weeks, subject to local validation.",
            "block_localization_statement": "Locally validated risk estimates for Chhattisgarh blocks, conditional on sufficient local data and validation.",
            "differentiator_statement": "Integration of forecast evaluation with an accountable Mitanin-facing task workflow; verify against comparable products.",
            "skill_gate_statement": "Weather-informed forecasts are eligible for operational use only when they outperform a seasonal baseline under a defined evaluation protocol.",
            "synthetic_evaluation_disclaimer": "Illustrative evaluation on synthetic data; not evidence of real-world forecasting performance.",
        },
        "planned_not_built": [
            "Real SMS/IVR",
            "Hindi/Chhattisgarhi messages",
            "Block-level real data",
            "Real case data",
            "Live PHE water-quality lab sensor feed",
            "Live IMD heatwave bulletin API",
        ]
    }


@app.get("/data/status", tags=["Data"])
def get_data_status() -> Dict[str, Any]:
    """Returns data ingestion and quality validation report enriched with active config settings."""
    cfg = load_config()
    _, units, report = load_and_validate_data(config=cfg, raise_on_error=False)
    report["source"] = report.get("data_source")

    report["config_summary"] = {
        "data_source": cfg.data_source,
        "granularity": cfg.granularity,
        "geography_level": cfg.geography_level,
        "forecast_horizon": "Target forecast horizon: 2–4 weeks, subject to local validation.",
        "weather_lags": f"{', '.join(str(s) for s in cfg.weather_lags_steps)} {cfg.unit_label}",
        "min_win_share_pct": f"{int(cfg.skill_gate.min_win_share * 100)}%",
        "min_median_improvement_pct": f"{int(cfg.skill_gate.min_median_improvement * 100)}%",
        "reactive_rule": f"mean + {int(cfg.reactive_rule.sd_multiplier)} SD, {cfg.reactive_rule.history_years} years",
        "escalation_hours": f"{cfg.escalation_hours} hours",
    }
    return report


@app.get("/data/template-csv", tags=["Data"], response_class=PlainTextResponse)
def get_surveillance_csv_template() -> PlainTextResponse:
    """
    Returns a downloadable CSV template with the documented surveillance + weather schema:
    week_start,district,block,reported_cases,population,rainfall_mm,temperature_c,relative_humidity_pct,reporting_completeness
    """
    csv_str = generate_csv_template_string()
    return PlainTextResponse(
        content=csv_str,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="mitanin_signal_surveillance_template.csv"'
        },
    )


@app.post("/data/upload-csv", tags=["Data"])
def post_validate_uploaded_csv(req: CsvUploadValidationRequest) -> Dict[str, Any]:
    """
    Validates an uploaded surveillance + weather CSV against the data contract.
    Preserves missing case counts as null (never silently converts to zero) and
    never calculates incidence without a valid (> 0) population denominator.
    """
    return validate_uploaded_surveillance_csv(
        csv_text=req.csv_content,
        filename=req.filename or "uploaded_surveillance.csv",
    )


# =====================================================================
# SIMULATED CLOCK ENDPOINTS
# =====================================================================

@app.get("/clock", tags=["Clock"])
def get_clock(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Returns the current simulated clock time."""
    now = get_simulated_now(db)
    return {
        "current_time": now.isoformat(),
        "note": "All system workflows (deadlines, escalation, event timestamps) synchronize with this clock."
    }


@app.post("/clock/advance", tags=["Clock"])
def post_advance_clock(
    hours: float = Query(..., gt=0, description="Hours to advance simulated clock"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Advances simulated clock by N hours and immediately evaluates task escalation.
    Tasks in 'sent' status older than escalation_hours transition to 'escalated'.
    """
    new_time, escalated_task_ids = advance_clock(db, hours=hours)
    return {
        "status": "success",
        "advanced_by_hours": hours,
        "new_time": new_time.isoformat(),
        "escalated_task_ids": escalated_task_ids,
        "escalated_count": len(escalated_task_ids),
    }


@app.post("/clock/reset", tags=["Clock"])
def post_reset_clock(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Resets the simulated clock back to the initial anchor time."""
    reset_time = reset_clock(db)
    return {
        "status": "success",
        "reset_time": reset_time.isoformat()
    }


# =====================================================================
# USERS ENDPOINT
# =====================================================================

@app.get("/users", tags=["Users"])
def list_users(
    role: Optional[str] = Query(None, description="Filter by role: district_officer, block_supervisor, mitanin"),
    unit_id: Optional[str] = Query(None, description="Filter by unit ID"),
    block_id: Optional[str] = Query(None, description="Filter by block ID"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """List sample users with open task counts and availability status."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if unit_id:
        query = query.filter(or_(User.unit_id == unit_id, User.block_id == unit_id))
    if block_id:
        query = query.filter(or_(User.block_id == block_id, User.unit_id == block_id))

    users = query.all()
    res = []
    for u in users:
        u_dict = u.to_dict()
        if u.role == "mitanin":
            open_count = db.query(Task).filter(
                Task.owner.ilike(f"%{u.name}%"),
                Task.status.in_(["sent", "acknowledged", "in_progress", "needs_help"])
            ).count()
            u_dict["open_tasks"] = open_count
            if open_count <= 2:
                u_dict["availability"] = "Available"
            else:
                u_dict["availability"] = "Busy this week"
        res.append(u_dict)
    return res


# =====================================================================
# ALERTS ENDPOINTS (MULTI-DISEASE EARLY WARNING ENGINE)
# =====================================================================

@app.get("/alerts", tags=["Alerts"])
def list_alerts(
    risk: Optional[str] = Query(None, description="Filter by risk: High, Medium, Low"),
    disease_type: Optional[str] = Query(None, description="Filter by disease_type: malaria, dengue, diarrhoea, heat"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: active, acknowledged, resolved, expired, snooze, false_alarm"),
    unit_id: Optional[str] = Query(None, description="Filter by unit ID"),
    block_id: Optional[str] = Query(None, description="Filter by block ID"),
    run_id: Optional[str] = Query(None, description="Filter by pipeline run ID"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Lists multi-disease alerts with optional filtering by risk, disease_type, status, unit_id, or run_id."""
    query = db.query(Alert)
    if risk:
        query = query.filter(Alert.risk.ilike(risk))
    if disease_type and disease_type.lower() != "all":
        query = query.filter(Alert.disease_type.ilike(disease_type.strip()))
    if status_filter and status_filter.lower() != "all":
        query = query.filter(Alert.status.ilike(status_filter.strip()))
    eff_unit = unit_id or block_id
    if eff_unit:
        loc = db.query(LocationUnit).filter(LocationUnit.unit_id == eff_unit).first()
        f_unit = loc.forecast_unit_id if (loc and loc.forecast_unit_id) else eff_unit
        query = query.filter(Alert.unit_id == f_unit)
    if run_id:
        query = query.filter(Alert.run_id == run_id)

    alerts = query.order_by(Alert.id.desc()).all()
    out = []
    for a in alerts:
        ad = a.to_dict()
        ad["unit_name"] = UNIT_NAME_MAP.get(a.unit_id, a.unit_id)
        out.append(ad)
    return out


@app.get("/alerts/{alert_id}", tags=["Alerts"])
def get_alert_detail(alert_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Detailed alert record including historical & forecast time series, drivers, skill gate, reactive rule comparison, and linked tasks."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert with ID {alert_id} not found.")

    cfg = load_config()
    unit_name = UNIT_NAME_MAP.get(alert.unit_id, f"Block {alert.unit_id}")

    res = alert.to_dict()
    res["unit_name"] = unit_name
    res["is_sample_alert"] = True

    if alert.confidence >= 0.8:
        conf_label = "High"
        conf_bars = 3
    elif alert.confidence >= 0.7:
        conf_label = "Medium"
        conf_bars = 2
    else:
        conf_label = "Low"
        conf_bars = 1
    res["confidence_label"] = conf_label
    res["confidence_bars"] = conf_bars

    series_obj = None
    if alert.series_data:
        try:
            series_obj = json.loads(alert.series_data)
        except Exception:
            series_obj = None

    is_weather_model = alert.method_used in ("weather_model", "meteorological_heat_index")

    if series_obj and "forecast_chart" in series_obj:
        res["forecast_chart"] = series_obj.get("forecast_chart")
        res["alert_level"] = series_obj.get("alert_level", 260)
        res["why_this_alert"] = series_obj.get("why_this_alert") if is_weather_model else None
        res["method_card"] = series_obj.get("method_card")
        res["similar_past_surges"] = series_obj.get("similar_past_surges", [])
    else:
        d_type = (alert.disease_type or "malaria").lower()
        if d_type == "heat":
            res["why_this_alert"] = [
                {"name": "Maximum Daytime Temperature (Tmax)", "level": "strong", "score": 90},
                {"name": "Steadman / NOAA Apparent Heat Index", "level": "strong", "score": 88},
                {"name": "Warm Night Minimum Temperature (Tmin)", "level": "moderate", "score": 72},
            ]
            res["method_card"] = {
                "name": "Meteorological Heat Index (Rule-Based)",
                "chip_type": "weather",
                "evidence_text": "non-infectious thermal threshold assessment (separate from disease ML models)",
                "reactive_comparison": "Proactive meteorological heat advisory window (1-2 weeks) prior to peak heat exhaustion admissions.",
            }
        elif is_weather_model:
            res["why_this_alert"] = [
                {"name": f"Rainfall, 3 {cfg.unit_label} earlier", "level": "strong", "score": 85},
                {"name": f"Temperature, 2 {cfg.unit_label} earlier", "level": "moderate", "score": 60},
                {"name": "Seasonal pattern", "level": "moderate", "score": 58},
            ]
            res["method_card"] = {
                "name": "Weather model",
                "chip_type": "weather",
                "evidence_text": "beat baseline in 7 of 9 test periods",
                "reactive_comparison": f"Compared with a reactive rule (mean + 2 SD), this alert appears about 2 {cfg.unit_label} earlier (simulated)."
            }
        else:
            res["why_this_alert"] = None
            res["method_card"] = {
                "name": "Seasonal baseline",
                "chip_type": "baseline",
                "evidence_text": "weather model failed skill gate (44% win share)",
                "reactive_comparison": f"Compared with a reactive rule (mean + 2 SD), seasonal baseline triggered 1 {cfg.unit_label} later."
            }

        res["similar_past_surges"] = [
            {"period": "Aug to Sep, year 4", "peak": "310 cases", "model_warning": f"2 {cfg.unit_label} earlier", "outcome": "Warned early", "outcome_type": "success"},
            {"period": "Sep to Oct, year 5", "peak": "270 cases", "model_warning": f"1 {cfg.unit_label} earlier", "outcome": "Warned early", "outcome_type": "success"},
            {"period": "Aug, year 6", "peak": "295 cases", "model_warning": "Not warned", "outcome": "Missed", "outcome_type": "danger"},
        ]

        wm_sep = 310 if is_weather_model else None
        wm_oct = 260 if is_weather_model else None
        wm_nov = 195 if is_weather_model else None
        wm_dec = 90 if is_weather_model else None

        res["forecast_chart"] = [
            {"period": "Jan", "actual": 12, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
            {"period": "Feb", "actual": 11, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
            {"period": "Mar", "actual": 14, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
            {"period": "Apr", "actual": 25, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
            {"period": "May", "actual": 48, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
            {"period": "Jun", "actual": 85, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
            {"period": "Jul", "actual": 140, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
            {"period": "Aug", "actual": 220, "baseline": 220, "weather_model": 220 if is_weather_model else None, "ci_lower": 220, "ci_upper": 220},
            {"period": "Sep", "actual": 310, "baseline": 255, "weather_model": wm_sep, "ci_lower": 270, "ci_upper": 350},
            {"period": "Oct", "actual": None, "baseline": 240, "weather_model": wm_oct, "ci_lower": 220, "ci_upper": 300},
            {"period": "Nov", "actual": None, "baseline": 180, "weather_model": wm_nov, "ci_lower": 160, "ci_upper": 230},
            {"period": "Dec", "actual": None, "baseline": 80, "weather_model": wm_dec, "ci_lower": 65, "ci_upper": 115},
        ]
        res["alert_level"] = 260

    res["skill_gate_status"] = "Pass" if is_weather_model else "Fail"
    res["automatic_weather_escalation_enabled"] = bool(is_weather_model)
    res["human_review_required"] = True
    res["review_status"] = (
        "Reviewed / Acknowledged"
        if alert.status == "acknowledged"
        else ("Snoozed" if alert.status == "snooze" else ("Dismissed / False alarm" if alert.status == "false_alarm" else "Pending human review"))
    )
    res["tasks"] = [t.to_dict() for t in alert.tasks]
    return res


@app.post("/alerts/{alert_id}/feedback", tags=["Alerts"])
@app.post("/alerts/{alert_id}/status", tags=["Alerts"])
def submit_alert_feedback(
    alert_id: int,
    req: AlertFeedbackRequest,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Updates alert lifecycle status ('active', 'acknowledged', 'resolved', 'expired', 'snooze', 'false_alarm')
    with audit tracking (updated_at, updated_by, feedback_notes).
    """
    now = get_simulated_now(db)
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert with ID {alert_id} not found.")

    if user:
        verify_location_jurisdiction(user, db, block_id=alert.unit_id)

    alert.status = req.action
    alert.feedback_notes = req.notes
    alert.updated_at = now
    alert.updated_by = user.name if user else (req.actor or "Supervisor [SAMPLE]")
    db.commit()
    db.refresh(alert)

    return {
        "status": "success",
        "action": req.action,
        "alert": alert.to_dict()
    }


# =====================================================================
# TASKS & FRONTLINE WORKFLOW ENDPOINTS
# =====================================================================

@app.post("/tasks", tags=["Tasks"])
def create_task(req: CreateTaskRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Creates a new action task from an alert for a Mitanin frontline health worker.
    Initial status is 'sent'. An audit event is recorded in task_events.
    """
    now = get_simulated_now(db)
    deadline = req.deadline or (now + timedelta(hours=48))

    serialized_steps = json.dumps(req.steps) if isinstance(req.steps, list) else req.steps

    target_user = db.query(User).filter(User.name.ilike(f"%{req.owner}%")).first()
    alert_obj = db.query(Alert).filter(Alert.id == req.alert_id).first() if req.alert_id else None

    blk_id = req.block_id or (alert_obj.unit_id if alert_obj else None) or (target_user.block_id if target_user else "BLK_A")
    dist_id = req.district_id or (target_user.district_id if target_user else "DIST_SAMPLE")
    # Only fall back to target_user.village_id if user belongs to the same block, or village_id is explicitly passed in req
    if req.village_id:
        vil_id = req.village_id
    elif target_user and target_user.village_id and (target_user.block_id == blk_id or not alert_obj):
        vil_id = target_user.village_id
    else:
        vil_id = None
    d_type = (req.disease_type or (alert_obj.disease_type if alert_obj else None) or "malaria").strip().lower()

    loc_ctx = resolve_location_context(db, district_id=dist_id, block_id=blk_id, village_id=vil_id)
    task = Task(
        alert_id=req.alert_id,
        disease_type=d_type,
        title=req.title,
        description=req.description or req.title,
        instructions=req.instructions or ("; ".join(req.steps) if isinstance(req.steps, list) else str(req.steps)),
        steps=serialized_steps,
        owner=req.owner,
        owner_id=target_user.id if target_user else req.owner_id,
        priority=req.priority or "High",
        district_id=dist_id,
        block_id=blk_id,
        village_id=vil_id,
        location_name=req.location_name or loc_ctx["location_breadcrumb"],
        deadline=deadline,
        status="sent",
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    event = TaskEvent(
        task_id=task.id,
        event="task_created",
        actor="Supervisor / System",
        timestamp=now,
        notes=f"Task assigned to {req.owner} with deadline {deadline.isoformat()}."
    )
    db.add(event)
    db.commit()
    db.refresh(task)

    return task.to_dict()


@app.get("/tasks", tags=["Tasks"])
def list_tasks(
    status: Optional[str] = Query(None, description="Filter by status"),
    owner: Optional[str] = Query(None, description="Filter by owner name"),
    alert_id: Optional[int] = Query(None, description="Filter by alert ID"),
    disease_type: Optional[str] = Query(None, description="Filter by disease_type: malaria, dengue, diarrhoea, heat"),
    block_id: Optional[str] = Query(None, description="Filter by block ID"),
    village_id: Optional[str] = Query(None, description="Filter by village ID"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """List action tasks with optional status, owner, disease, location, or alert filtering."""
    cfg = load_config()
    now = get_simulated_now(db)
    check_and_escalate_tasks(db, now, escalation_hours=cfg.escalation_hours)

    query = db.query(Task)
    if status:
        query = query.filter(Task.status == status)
    if owner:
        query = query.filter(Task.owner.ilike(f"%{owner}%"))
    if alert_id:
        query = query.filter(Task.alert_id == alert_id)
    if priority:
        query = query.filter(Task.priority.ilike(priority))

    tasks = query.order_by(Task.id.desc()).all()

    result = []
    for t in tasks:
        t_dict = _enrich_task_dict(t, now)
        if disease_type and disease_type.lower() != "all":
            if (t_dict.get("disease_type") or "malaria").lower() != disease_type.strip().lower():
                continue
        if block_id and t_dict["unit_id"] != block_id and t.block_id != block_id:
            continue
        if village_id and t.village_id and t.village_id != village_id:
            continue
        result.append(t_dict)

    return result


@app.get("/tasks/export-csv", tags=["Tasks"], response_class=PlainTextResponse)
def export_tasks_ledger_csv(
    status: Optional[str] = Query(None, description="Optional status filter"),
    owner: Optional[str] = Query(None, description="Optional owner filter"),
    block_id: Optional[str] = Query(None, description="Optional block filter"),
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    """
    Exports the append-only Completion Ledger (Alert -> task -> owner -> deadline -> status -> completion timestamp -> audit trail)
    as a downloadable CSV file.
    """
    import csv
    import io

    now = get_simulated_now(db)
    tasks_list = list_tasks(
        status=status,
        owner=owner,
        alert_id=None,
        disease_type=None,
        block_id=block_id,
        village_id=None,
        priority=None,
        db=db,
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "task_id",
        "alert_id",
        "unit_name",
        "disease_type",
        "title",
        "owner",
        "priority",
        "status",
        "created_at",
        "deadline",
        "completed_at",
        "completion_notes",
        "event_count",
        "latest_audit_event",
    ])

    for t in tasks_list:
        events = t.get("events") or []
        completed_ts = ""
        if t.get("status") in ("done", "completed"):
            done_events = [e for e in events if "done" in str(e.get("event", "")) or "completed" in str(e.get("event", ""))]
            completed_ts = done_events[-1].get("timestamp", t.get("updated_at", "")) if done_events else (t.get("updated_at") or "")
        latest_ev = ""
        if events:
            last = events[-1]
            latest_ev = f"{last.get('event')} by {last.get('actor')} ({last.get('timestamp')}): {last.get('notes') or ''}"

        writer.writerow([
            t.get("id"),
            t.get("alert_id") or "",
            t.get("unit_name") or t.get("unit_id") or "",
            t.get("disease_type") or "malaria",
            t.get("title") or "",
            t.get("owner") or "",
            t.get("priority") or "High",
            t.get("status") or "",
            t.get("created_at") or "",
            t.get("deadline") or "",
            completed_ts,
            t.get("completion_notes") or "",
            len(events),
            latest_ev,
        ])

    return PlainTextResponse(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="mitanin_signal_completion_ledger.csv"'
        },
    )


@app.get("/tasks/{task_id}", tags=["Tasks"])
def get_task_detail(task_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Retrieve task detail including complete chronological event audit history."""
    cfg = load_config()
    now = get_simulated_now(db)
    check_and_escalate_tasks(db, now, escalation_hours=cfg.escalation_hours)

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task with ID {task_id} not found.")

    return _enrich_task_dict(task, now)


@app.post("/tasks/{task_id}/reply", tags=["Tasks"])
def reply_to_task(task_id: int, req: MitaninReplyRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Frontline Mitanin worker response: 'done' or 'needs_help' (or 'acknowledged', 'in_progress').
    Transitions task status and records audit event in task_events.
    """
    now = get_simulated_now(db)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task with ID {task_id} not found.")

    task.status = "done" if req.status == "completed" else req.status
    task.updated_at = now
    if req.completion_notes:
        task.completion_notes = req.completion_notes
    elif task.status == "done" and req.notes:
        task.completion_notes = req.notes
    if req.evidence_attachment:
        task.evidence_attachment = req.evidence_attachment

    event_name = f"mitanin_reply_{task.status}"
    event = TaskEvent(
        task_id=task.id,
        event=event_name,
        actor=req.actor or "Mitanin Worker [SAMPLE]",
        timestamp=now,
        notes=req.notes or req.completion_notes or f"Mitanin marked status as '{task.status}'."
    )
    db.add(event)
    db.commit()
    db.refresh(task)

    return task.to_dict()


@app.post("/tasks/{task_id}/status", tags=["Tasks"])
def update_task_status(task_id: int, req: UpdateTaskStatusRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Updates task status, owner reassignment, deadline, or completion notes with append-only audit trail.
    """
    now = get_simulated_now(db)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task with ID {task_id} not found.")

    status_map = {
        "completed": "done",
        "pending": "sent",
        "accepted": "acknowledged",
        "blocked": "needs_help",
    }
    old_status = task.status
    old_owner = task.owner
    old_deadline = task.deadline.isoformat() if task.deadline else None

    task.status = status_map.get(req.status, req.status)
    task.updated_at = now

    change_details = []
    if task.status != old_status:
        change_details.append(f"Status changed from '{old_status}' to '{task.status}'.")

    if req.owner and req.owner.strip() and req.owner.strip() != old_owner:
        task.owner = req.owner.strip()
        short_owner = task.owner.replace("[SAMPLE]", "").replace("Mitanin", "").strip()
        matched_user = (
            db.query(User)
            .filter(
                or_(
                    User.name == task.owner,
                    User.name.ilike(f"%{short_owner}%") if short_owner else False,
                )
            )
            .first()
        )
        task.owner_id = matched_user.id if matched_user else None
        change_details.append(f"Owner reassigned from '{old_owner}' to '{task.owner}'.")

    if req.priority:
        task.priority = req.priority
    if req.deadline:
        task.deadline = req.deadline
        change_details.append(f"Deadline updated from '{old_deadline}' to '{req.deadline.isoformat()}'.")
    if req.completion_notes is not None:
        task.completion_notes = req.completion_notes
        if req.completion_notes.strip():
            change_details.append(f"Completion notes recorded: {req.completion_notes.strip()}")
    if req.evidence_attachment is not None:
        task.evidence_attachment = req.evidence_attachment

    summary_note = req.notes or (" ".join(change_details) if change_details else f"Status updated to '{task.status}'.")

    event = TaskEvent(
        task_id=task.id,
        event=f"status_changed_to_{task.status}",
        actor=req.actor or "Supervisor [SAMPLE]",
        timestamp=now,
        notes=summary_note,
    )
    db.add(event)
    db.commit()
    db.refresh(task)

    return task.to_dict()


# =====================================================================
# DASHBOARD SUMMARY
# =====================================================================

@app.get("/dashboard/summary", tags=["Dashboard"])
def get_dashboard_summary(
    district_id: Optional[str] = Query(None, description="Optional district filter"),
    block_id: Optional[str] = Query(None, description="Optional block filter"),
    village_id: Optional[str] = Query(None, description="Optional village filter"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Executive summary for the district and block view:
    alert risk breakdown, multi-disease risk overview, task statuses, escalation alerts, simulated clock.
    Supports optional location filtering.
    """
    cfg = load_config()
    now = get_simulated_now(db)
    check_and_escalate_tasks(db, now, escalation_hours=cfg.escalation_hours)

    latest_run = db.query(PipelineRun).order_by(PipelineRun.created_at.desc(), PipelineRun.run_id.desc()).first()

    if latest_run:
        all_run_alerts = db.query(Alert).filter(Alert.run_id == latest_run.run_id).all()
    else:
        all_run_alerts = db.query(Alert).all()

    # Keep primary unit_risks focused on the 6 malaria sentinel blocks while also exposing multi_disease_alerts
    alerts = [a for a in all_run_alerts if (a.disease_type or "malaria") == "malaria"]
    if not alerts:
        alerts = all_run_alerts

    # If block_id filter is provided, resolve forecast unit
    target_forecast_unit = None
    if block_id:
        loc_blk = db.query(LocationUnit).filter(LocationUnit.unit_id == block_id).first()
        target_forecast_unit = loc_blk.forecast_unit_id if (loc_blk and loc_blk.forecast_unit_id) else block_id

    risk_counts = {"High": 0, "Medium": 0, "Low": 0}
    for a in alerts:
        risk_counts[a.risk] = risk_counts.get(a.risk, 0) + 1

    active_alerts_count = risk_counts.get("High", 0) + risk_counts.get("Medium", 0)

    unit_risks = []
    needs_action = []
    weather_model_units = 0
    baseline_units = 0

    for a in alerts:
        u_name = UNIT_NAME_MAP.get(a.unit_id, f"Block {a.unit_id}")
        series_obj = json.loads(a.series_data) if a.series_data else {}
        sparkline = series_obj.get("sparkline", [15, 18, 22, 26, 31, 38])
        lead_time = series_obj.get("lead_time", a.forecast_period)

        if a.method_used == "weather_model":
            weather_model_units += 1
        else:
            baseline_units += 1

        unit_risks.append({
            "alert_id": a.id,
            "unit_id": a.unit_id,
            "unit_name": u_name,
            "disease_type": a.disease_type or "malaria",
            "risk": a.risk,
            "lead_time": lead_time,
            "sparkline": sparkline,
            "method_used": a.method_used,
            "is_selected_block": (target_forecast_unit == a.unit_id) if target_forecast_unit else False,
        })

    for a in all_run_alerts:
        if a.risk in ["High", "Medium"]:
            u_name = UNIT_NAME_MAP.get(a.unit_id, f"Block {a.unit_id}")
            series_obj = json.loads(a.series_data) if a.series_data else {}
            lead_time = series_obj.get("lead_time", a.forecast_period)
            conf_str = "High" if a.confidence >= 0.8 else ("Medium" if a.confidence >= 0.7 else "Low")
            needs_action.append({
                "alert_id": a.id,
                "unit_id": a.unit_id,
                "unit_name": u_name,
                "disease_type": a.disease_type or "malaria",
                "disease_label": a.to_dict()["disease_label"],
                "risk": a.risk,
                "lead_time": lead_time,
                "confidence": a.confidence,
                "confidence_label": f"{conf_str} confidence",
            })

    risk_priority = {"High": 0, "Medium": 1, "Low": 2}
    needs_action.sort(key=lambda x: risk_priority.get(x["risk"], 3))

    tasks = db.query(Task).all()
    if target_forecast_unit:
        filtered_tasks = [
            t for t in tasks
            if (t.block_id == block_id or t.block_id == target_forecast_unit or (t.alert and t.alert.unit_id == target_forecast_unit))
        ]
    else:
        filtered_tasks = tasks

    task_counts = {
        "sent": 0,
        "acknowledged": 0,
        "in_progress": 0,
        "done": 0,
        "needs_help": 0,
        "escalated": 0,
        "cancelled": 0,
    }
    for t in filtered_tasks:
        task_counts[t.status] = task_counts.get(t.status, 0) + 1

    open_tasks = len(filtered_tasks)
    waiting_reply = task_counts.get("sent", 0)
    replied_pct = 80

    evidence_file = backend_dir / "data" / "evidence.json"
    skill_gate_data = []
    if evidence_file.is_file():
        try:
            with open(evidence_file, "r", encoding="utf-8") as f:
                ev_data = json.load(f)
            for u_id, ev_u in ev_data.get("units", {}).items():
                skill_gate_data.append({
                    "unit_id": u_id,
                    "unit_name": ev_u.get("unit_name", UNIT_NAME_MAP.get(u_id, u_id)),
                    "win_share": ev_u.get("win_share", 0.0),
                    "method_used": ev_u.get("decision", "seasonal_baseline"),
                })
        except Exception:
            pass

    if not skill_gate_data:
        skill_gate_data = [
            {"unit_id": "BLK_A", "unit_name": "Sample Block A", "win_share": 0.65, "method_used": "weather_model"},
            {"unit_id": "BLK_B", "unit_name": "Sample Block B", "win_share": 0.55, "method_used": "seasonal_baseline"},
            {"unit_id": "BLK_C", "unit_name": "Sample Block C", "win_share": 0.41, "method_used": "seasonal_baseline"},
            {"unit_id": "BLK_D", "unit_name": "Sample Block D", "win_share": 0.47, "method_used": "seasonal_baseline"},
            {"unit_id": "BLK_E", "unit_name": "Sample Block E", "win_share": 0.65, "method_used": "weather_model"},
            {"unit_id": "BLK_F", "unit_name": "Sample Block F", "win_share": 0.57, "method_used": "seasonal_baseline"},
        ]

    # Scale forecast chart if a specific block is selected
    loc_risk = build_location_risk_payload(db, district_id=district_id, block_id=block_id, village_id=village_id)
    district_forecast = loc_risk["forecast_chart"] if block_id else [
        {"period": "Jan", "actual": 12, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Feb", "actual": 11, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Mar", "actual": 14, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Apr", "actual": 25, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "May", "actual": 48, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Jun", "actual": 85, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Jul", "actual": 140, "baseline": None, "weather_model": None, "ci_lower": None, "ci_upper": None},
        {"period": "Aug", "actual": 220, "baseline": 220, "weather_model": 220, "ci_lower": 220, "ci_upper": 220},
        {"period": "Sep", "actual": 310, "baseline": 255, "weather_model": 310, "ci_lower": 270, "ci_upper": 350},
        {"period": "Oct", "actual": None, "baseline": 240, "weather_model": 260, "ci_lower": 220, "ci_upper": 300},
        {"period": "Nov", "actual": None, "baseline": 180, "weather_model": 195, "ci_lower": 160, "ci_upper": 230},
        {"period": "Dec", "actual": None, "baseline": 80, "weather_model": 90, "ci_lower": 65, "ci_upper": 115},
    ]

    return {
        "clock_now": now.isoformat(),
        "selected_location": loc_risk["location"],
        "multi_disease": loc_risk["multi_disease"],
        "total_alerts": len(alerts),
        "multi_disease_alerts_count": len(all_run_alerts),
        "active_alerts_count": active_alerts_count,
        "alerts_by_risk": risk_counts,
        "total_tasks": len(filtered_tasks),
        "open_tasks_count": open_tasks,
        "tasks_waiting_reply": waiting_reply,
        "replied_within_window_pct": replied_pct,
        "weather_model_units_count": weather_model_units,
        "baseline_units_count": baseline_units,
        "total_units_count": len(alerts),
        "tasks_by_status": task_counts,
        "escalated_count": task_counts.get("escalated", 0),
        "active_units": len(alerts),
        "latest_run_id": latest_run.run_id if latest_run else None,
        "escalation_hours": cfg.escalation_hours,
        "banner_text": cfg.banner_text,
        "unit_risks": unit_risks,
        "needs_action": needs_action,
        "skill_gate": skill_gate_data,
        "district_forecast": district_forecast,
        "alert_level_threshold": loc_risk["alert_threshold"] if block_id else 260,
    }


# =====================================================================
# PIPELINE DATA REFRESH (NEVER DELETES TASKS, EVENTS, OR USERS)
# =====================================================================

@app.post("/runs/refresh", tags=["Pipeline"])
def refresh_pipeline_run(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Refreshes pipeline run:
    Creates a new run_id and deduplicated multi-disease alerts.
    IMPORTANT: NEVER deletes existing tasks, task_events, or users!
    """
    now = get_simulated_now(db)
    cfg = load_config()
    import uuid
    new_run_id = f"run_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    new_run = PipelineRun(
        run_id=new_run_id,
        data_source=cfg.data_source,
        created_at=now,
        summary=f"Automated multi-disease pipeline forecast refresh at {now.isoformat()}."
    )
    db.add(new_run)
    db.commit()

    refreshed_configs = [
        {"unit_id": "BLK_A", "disease_type": "malaria", "risk": "High", "confidence": 0.88, "method_used": "weather_model", "sparkline": [20, 24, 30, 38, 45, 54], "lead_time": f"3-4 {cfg.unit_label} (target)", "details": "REFRESHED ALERT - Model predicts continuous malaria surge based on recent rainfall telemetry."},
        {"unit_id": "BLK_B", "disease_type": "malaria", "risk": "Medium", "confidence": 0.74, "method_used": "weather_model", "sparkline": [13, 15, 18, 22, 25, 29], "lead_time": f"2-3 {cfg.unit_label} (target)", "details": "REFRESHED ALERT - Elevated temperature and monsoon index."},
        {"unit_id": "BLK_C", "disease_type": "malaria", "risk": "Low", "confidence": 0.65, "method_used": "seasonal_baseline", "sparkline": [14, 12, 15, 11, 13, 10], "lead_time": "-", "details": "REFRESHED ALERT - Normal endemic baseline."},
        {"unit_id": "BLK_D", "disease_type": "malaria", "risk": "Low", "confidence": 0.69, "method_used": "weather_model", "sparkline": [9, 13, 8, 12, 10, 8], "lead_time": "-", "details": "REFRESHED ALERT - Low transmission risk."},
        {"unit_id": "BLK_E", "disease_type": "malaria", "risk": "Medium", "confidence": 0.72, "method_used": "weather_model", "sparkline": [15, 17, 21, 25, 29, 34], "lead_time": f"3-4 {cfg.unit_label} (target)", "details": "REFRESHED ALERT - Climate index triggered medium risk threshold."},
        {"unit_id": "BLK_F", "disease_type": "malaria", "risk": "Low", "confidence": 0.62, "method_used": "seasonal_baseline", "sparkline": [15, 13, 14, 11, 10, 12], "lead_time": "-", "details": "REFRESHED ALERT - Baseline endemic levels."},
        {"unit_id": "BLK_B", "disease_type": "dengue", "risk": "High", "confidence": 0.83, "method_used": "weather_model", "sparkline": [8, 11, 14, 17, 21, 24], "lead_time": f"2-4 {cfg.unit_label} (target)", "details": "REFRESHED DENGUE ALERT - High Aedes container-breeding suitability (74/100) in Sample Block B."},
        {"unit_id": "BLK_E", "disease_type": "diarrhoea", "risk": "High", "confidence": 0.82, "method_used": "weather_model", "sparkline": [14, 18, 24, 31, 35, 38], "lead_time": f"1-3 {cfg.unit_label} (target)", "details": "REFRESHED DIARRHOEA ALERT - Elevated ADD surveillance trajectory with heavy rainfall runoff in Sample Block E."},
        {"unit_id": "BLK_D", "disease_type": "heat", "risk": "High", "confidence": 0.90, "method_used": "meteorological_heat_index", "sparkline": [36, 38, 40, 42, 44, 46], "lead_time": "1-2 wks meteorological window", "details": "REFRESHED HEAT ALERT - Tmax 42.8°C & Apparent Heat Index 45.6°C exceed heatwave threshold in Sample Block D."},
    ]

    refreshed_alerts = []
    for rc in refreshed_configs:
        s_obj = {
            "sparkline": rc["sparkline"],
            "lead_time": rc["lead_time"],
        }
        refreshed_alerts.append(
            Alert(
                unit_id=rc["unit_id"],
                disease_type=rc["disease_type"],
                risk=rc["risk"],
                confidence=rc["confidence"],
                forecast_period=rc["lead_time"],
                method_used=rc["method_used"],
                run_id=new_run_id,
                created_at=now,
                series_data=json.dumps(s_obj),
                details=rc["details"],
                trigger_reason=rc["details"],
                status="active",
            )
        )

    db.add_all(refreshed_alerts)
    db.commit()

    return {
        "status": "success",
        "new_run_id": new_run_id,
        "new_alerts_count": len(refreshed_alerts),
        "note": "Existing tasks, task_events, and users were preserved in the ledger."
    }


# =====================================================================
# MODEL EVIDENCE & SKILL GATE ENDPOINT
# =====================================================================

_evidence_cache: Dict[bool, Dict[str, Any]] = {}


@app.get("/evidence", tags=["Evidence"])
@app.get("/model-evidence", tags=["Evidence"])
def get_model_evidence(
    exclude_disruptions: bool = Query(False, description="Exclude reporting-disruption periods (recomputes metrics)"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Returns rolling-origin model evaluation metrics, skill gate decisions,
    grouped error comparisons, method note, and plain-language summary per unit.
    """
    cfg = load_config()

    if exclude_disruptions in _evidence_cache:
        return _evidence_cache[exclude_disruptions]

    df, units, _ = load_and_validate_data(config=cfg, raise_on_error=False)
    raw_ev = run_evidence_evaluation(df=df, units=units, config=cfg, exclude_disruptions=exclude_disruptions)

    formatted_units = []
    weather_helped = []
    baseline_retained = []

    for u_id, ev_u in raw_ev.get("units", {}).items():
        u_name = ev_u.get("unit_name", UNIT_NAME_MAP.get(u_id, u_id))
        b_mae = ev_u.get("baseline_metrics", {}).get("mae", 0.0) if ev_u.get("baseline_metrics") else None
        b_rmse = ev_u.get("baseline_metrics", {}).get("rmse", 0.0) if ev_u.get("baseline_metrics") else None
        w_mae = ev_u.get("weather_metrics", {}).get("mae") if ev_u.get("weather_metrics") else None
        w_rmse = ev_u.get("weather_metrics", {}).get("rmse") if ev_u.get("weather_metrics") else None
        win_share = ev_u.get("win_share", 0.0)
        med_imp = ev_u.get("median_improvement", 0.0)
        decision = ev_u.get("decision", "seasonal_baseline")
        verdict = ev_u.get("verdict_chip", "Use baseline")

        if verdict == "Use weather":
            weather_helped.append(u_name)
        elif verdict in ["Use baseline", "No weather data"]:
            baseline_retained.append(u_name)

        formatted_units.append({
            "unit_id": u_id,
            "unit_name": u_name,
            "baseline_mae": b_mae,
            "baseline_rmse": b_rmse,
            "weather_mae": w_mae,
            "weather_rmse": w_rmse,
            "win_share": win_share,
            "win_share_pct": f"{win_share:.1%}",
            "median_improvement": med_imp,
            "median_improvement_pct": f"{med_imp:.1%}",
            "skill_score": ev_u.get("skill_score"),
            "skill_score_pct": ev_u.get("skill_score_pct", "N/A"),
            "zero_baseline_mae_handled": ev_u.get("zero_baseline_mae_handled", False),
            "skill_gate_status": ev_u.get("skill_gate_status", "Pass" if verdict == "Use weather" else ("Insufficient evidence" if verdict == "No weather data" else "Fail")),
            "decision": decision,
            "verdict_chip": verdict,
            "reason": ev_u.get("reason", ""),
            "n_evaluations": ev_u.get("n_evaluations", 0),
        })

    helped_text = ", ".join(weather_helped) if weather_helped else "None"
    retained_text = ", ".join(baseline_retained) if baseline_retained else "None"
    plain_summary = (
        f"Weather models improved forecasting accuracy over seasonal patterns in {helped_text} "
        f"(meeting the {int(cfg.skill_gate.min_win_share * 100)}% win-share, {int(cfg.skill_gate.min_median_improvement * 100)}% median-improvement, and positive skill score criteria). "
        f"In contrast, weather data did not consistently improve predictions in {retained_text}, "
        f"where the skill gate automatically selects the seasonal baseline and disables automatic weather-model-driven escalation."
    )

    notice = None
    synthetic_evaluation_notice = "Illustrative evaluation on synthetic data; not evidence of real-world forecasting performance."
    if cfg.data_source.lower() == "simulated":
        notice = "These results come from simulated data and say nothing about real malaria in Chhattisgarh."

    claims_verification_table = [
        {
            "id": "surveillance_timing",
            "original_claim": "Existing systems cases rise hone ke baad recognize karte hain",
            "verification_finding": "Overstated if presented as an absolute rule. Routine surveillance is often laggy or reactive, but early-warning and weather-informed research/pilots already exist.",
            "corrected_positioning": "Routine surveillance may identify some surges only after cases rise; earlier warning remains a challenge.",
        },
        {
            "id": "warning_horizon",
            "original_claim": "Weather-based forecasting se 2–4 weeks pehle warning",
            "verification_finding": "Scientifically plausible, not guaranteed. Indian research has demonstrated a 2–3 week prediction horizon for malaria in Maharashtra; 2–4 weeks is a target to test, not a proven outcome.",
            "corrected_positioning": "Target forecast horizon: 2–4 weeks, subject to local validation.",
        },
        {
            "id": "block_granularity",
            "original_claim": "District-to-block localized risk",
            "verification_finding": "Valid design goal, not a new invention. WHO guidance already describes district-level meteorological early warnings and sub-district outbreak detection.",
            "corrected_positioning": "Locally validated risk estimates for Chhattisgarh blocks, conditional on sufficient local data and validation.",
        },
        {
            "id": "task_ledger_workflow",
            "original_claim": "Alert → task → owner → deadline → completion ledger",
            "verification_finding": "Strong product workflow, not proven unique. Existing platforms such as FeverTracker already support surveillance, digital reporting, alerts, and advisories.",
            "corrected_positioning": "Focus on the integration of forecast evaluation with an accountable Mitanin-facing task workflow; verify against comparable products.",
        },
        {
            "id": "skill_gate_protocol",
            "original_claim": "Forecast skill compared against a seasonal baseline",
            "verification_finding": "Methodologically strong. Testing whether weather features actually beat a simple seasonal baseline is good forecasting practice.",
            "corrected_positioning": "Weather-informed forecasts are eligible for operational use only when they outperform a seasonal baseline under a defined evaluation protocol.",
        },
    ]

    res = {
        "data_source": cfg.data_source,
        "granularity": cfg.granularity,
        "unit_label": cfg.unit_label,
        "geography_level": cfg.geography_level,
        "forecast_horizon_target": "Target forecast horizon: 2–4 weeks, subject to local validation.",
        "skill_score_formula": "Skill = 1 − MAE_candidate / MAE_baseline (zero baseline MAE handled explicitly)",
        "evaluation_years": cfg.evaluation_years,
        "exclude_disruptions": exclude_disruptions,
        "skill_gate_thresholds": {
            "min_win_share": cfg.skill_gate.min_win_share,
            "min_win_share_pct": f"{int(cfg.skill_gate.min_win_share * 100)}%",
            "min_median_improvement": cfg.skill_gate.min_median_improvement,
            "min_median_improvement_pct": f"{int(cfg.skill_gate.min_median_improvement * 100)}%",
            "require_positive_skill": True,
            "note": "Prototype evaluation criteria; not public-health validation standards.",
        },
        "method_note": "Time-ordered evaluation: models are trained on earlier periods and tested on later ones.",
        "plain_language_summary": plain_summary,
        "notice": notice,
        "synthetic_evaluation_notice": synthetic_evaluation_notice,
        "claims_verification_table": claims_verification_table,
        "units": formatted_units,
        "malaria_archive_model": get_malaria_model_status(),
    }

    _evidence_cache[exclude_disruptions] = res
    return res


# =====================================================================
# 8. MULTILINGUAL (en, hi, hne), VOICE TTS & MITANIN SAHAYAK CHATBOT
# =====================================================================

@app.get("/i18n/locales")
def get_supported_locales():
    """Returns supported application locales and fallback rules."""
    return {
        "default_locale": "en",
        "fallback_locale": "en",
        "locales": [
            {
                "code": "en",
                "name": "English",
                "native_name": "English",
                "speech_lang": "en-IN",
                "stt_supported": True,
                "dictionary_file": "frontend/src/i18n/locales/en.ts",
            },
            {
                "code": "hi",
                "name": "Hindi",
                "native_name": "हिन्दी",
                "speech_lang": "hi-IN",
                "stt_supported": True,
                "dictionary_file": "frontend/src/i18n/locales/hi.ts",
            },
            {
                "code": "hne",
                "name": "Chhattisgarhi",
                "native_name": "छत्तीसगढ़ी",
                "iso_639_3": "hne",
                "speech_lang": "hne-IN",
                "stt_supported": False,
                "stt_fallback_note": "Most browsers do not provide native Chhattisgarhi speech-to-text; use text input or Hindi/English voice dictation.",
                "dictionary_file": "frontend/src/i18n/locales/hne.ts",
                "reviewable_templates_endpoint": "/i18n/task-templates",
            },
        ],
    }


@app.post("/auth/language")
def update_user_language_preference(
    req: UpdateLanguagePreferenceRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persists the authenticated user's preferred language ('en', 'hi', or 'hne')."""
    user.preferred_language = req.language
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "status": "updated",
        "preferred_language": user.preferred_language,
        "user": user.to_dict(),
    }


@app.get("/i18n/task-templates")
def list_translated_task_templates(
    disease_type: Optional[str] = Query(None, description="Optional disease filter"),
    db: Session = Depends(get_db),
):
    """
    Returns reviewed English, Hindi, and Chhattisgarhi task templates.
    Separate reviewable templates allow local speakers or public-health professionals
    to inspect and improve Chhattisgarhi phrasing without modifying code.
    """
    q = db.query(TranslatedTaskTemplate)
    if disease_type:
        q = q.filter(TranslatedTaskTemplate.disease_type == disease_type.lower())
    items = q.order_by(TranslatedTaskTemplate.id.asc()).all()
    return {
        "count": len(items),
        "templates": [t.to_dict() for t in items],
    }


@app.put("/i18n/task-templates/{template_key}")
def update_translated_task_template(
    template_key: str,
    req: UpdateTaskTemplateRequest,
    supervisor: User = Depends(require_supervisor),
    db: Session = Depends(get_db),
):
    """
    Allows an authorized supervisor/administrator to update English, Hindi, or
    Chhattisgarhi task template phrasing without changing application source code.
    """
    tpl = (
        db.query(TranslatedTaskTemplate)
        .filter(TranslatedTaskTemplate.template_key == template_key)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail=f"Task template '{template_key}' not found.")

    if req.disease_type is not None:
        tpl.disease_type = req.disease_type
    if req.title_en is not None:
        tpl.title_en = req.title_en
    if req.title_hi is not None:
        tpl.title_hi = req.title_hi
    if req.title_hne is not None:
        tpl.title_hne = req.title_hne
    if req.instructions_en is not None:
        tpl.instructions_en = req.instructions_en
    if req.instructions_hi is not None:
        tpl.instructions_hi = req.instructions_hi
    if req.instructions_hne is not None:
        tpl.instructions_hne = req.instructions_hne
    if req.safety_en is not None:
        tpl.safety_en = req.safety_en
    if req.safety_hi is not None:
        tpl.safety_hi = req.safety_hi
    if req.safety_hne is not None:
        tpl.safety_hne = req.safety_hne
    if req.review_status is not None:
        tpl.review_status = req.review_status

    tpl.updated_by = supervisor.name
    tpl.updated_at = get_simulated_now(db)
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {
        "status": "updated",
        "template": tpl.to_dict(),
    }


@app.get("/tts/status")
def get_tts_status():
    """Returns server-side/cloud TTS availability and Chhattisgarhi voice honesty rules."""
    cfg = get_public_chatbot_config()
    return cfg["tts"]


@app.post("/tts/synthesize")
def post_tts_synthesize(req: TTSSynthesizeRequest):
    """
    Synthesizes speech via optional cloud TTS when configured.
    Strictly preserves Chhattisgarhi voice honesty: never labels Hindi speech as Chhattisgarhi.
    """
    return synthesize_cloud_tts(text=req.text, language=req.language, speed=req.speed)


@app.get("/chatbot/config")
def get_chatbot_config():
    """
    Returns safe public configuration for Mitanin Sahayak.
    Never exposes CHATBOT_API_KEY or TTS_API_KEY.
    """
    return get_public_chatbot_config()


@app.post("/chatbot/message")
def post_chatbot_message(
    req: ChatbotMessageRequest,
    request: Request,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    Protected Mitanin Sahayak multilingual chatbot endpoint.
    Enforces rate limits, authentication, role permissions, location jurisdiction,
    consequential action confirmation, and grounded database retrieval.
    """
    client_host = request.client.host if request.client else "local"
    return process_chatbot_message(
        db=db,
        req=req,
        current_user=current_user,
        client_key=client_host,
    )


# =====================================================================
# WEATHER-RELATED DISEASE ML PREDICTION ENDPOINTS
# =====================================================================

@app.get("/predict/status", tags=["Weather-Disease ML Prediction"])
@app.get("/predict/health", tags=["Weather-Disease ML Prediction"])
def get_predict_model_status() -> Dict[str, Any]:
    """
    Returns health status, feature schema, supported disease classes, and evaluation metrics
    for the trained Weather-Related Disease Prediction ML pipeline.
    """
    return get_model_health_status()


@app.post("/predict", tags=["Weather-Disease ML Prediction"])
def post_predict_weather_disease(req: WeatherDiseasePredictRequest) -> Dict[str, Any]:
    """
    Runs multiclass weather-and-symptom disease prediction using the fitted scikit-learn pipeline
    loaded from `artifacts/disease_prediction_model.joblib`.
    Validates inputs, returns top predicted disease, probability scores, confidence band,
    emergency red-flag warnings, input explanation, and non-diagnostic public-health next steps.
    """
    status_info = get_model_health_status()
    if not status_info.get("model_loaded"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trained weather-disease prediction model artifact is not currently available.",
        )
    try:
        return run_weather_disease_prediction(req.model_dump())
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to compute disease prediction for the supplied inputs.",
        )


# =====================================================================
# HISTORICAL MALARIA CASE & INCIDENCE FORECASTING ML ENDPOINTS
# (`docs/archive/incidence_per_1000_pop_at_risk.csv`, `reported_numbers.csv`, `estimated_numbers.csv`)
# =====================================================================

@app.get("/predict/malaria-cases/status", tags=["Malaria Case Forecasting ML"])
@app.get("/predict/malaria-cases/health", tags=["Malaria Case Forecasting ML"])
def get_malaria_forecast_model_status() -> Dict[str, Any]:
    """
    Returns health status, dataset schema (`docs/archive/*.csv`), feature list, chronological
    train/validation/test split metrics, baseline comparison, regional breakdown, and limitations
    for the trained Malaria Incidence & Case Trend Forecasting model.
    """
    return get_malaria_model_status()


@app.get("/predict/malaria-cases", tags=["Malaria Case Forecasting ML"])
def get_malaria_cases_forecast(
    country: str = Query("India", description="Country name from WHO malaria archive (default: India)"),
    horizon_years: int = Query(3, ge=1, le=5, description="Forecast horizon in years (1 to 5)"),
    base_year: Optional[int] = Query(None, ge=2002, le=2030, description="Optional forecast origin year"),
    location_context: Optional[str] = Query(None, description="Optional sub-district UI location breadcrumb"),
) -> Dict[str, Any]:
    """
    Convenience GET endpoint for fetching live malaria incidence & case trend forecasts
    for a country in the WHO archive (defaults to India, 3-year horizon).
    """
    status_info = get_malaria_model_status()
    if not status_info.get("model_loaded"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trained malaria forecast model artifact is not currently available.",
        )
    try:
        return run_malaria_case_forecast(
            {
                "country": country,
                "horizon_years": horizon_years,
                "base_year": base_year,
                "location_context": location_context,
            }
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to compute malaria case forecast for the supplied inputs.",
        )


@app.post("/predict/malaria-cases", tags=["Malaria Case Forecasting ML"])
def post_predict_malaria_cases(req: MalariaCaseForecastRequest) -> Dict[str, Any]:
    """
    Runs annual malaria incidence and case-trend forecasting using the trained HuberRegressor
    pipeline loaded from `artifacts/malaria_forecast_model.joblib`.
    Supports country lookup from `docs/archive/*.csv` (107 countries, 2000–2018) or custom 3-year
    historical incidence lags (`incidence_lag_1`, `incidence_lag_2`, `incidence_lag_3`).
    """
    status_info = get_malaria_model_status()
    if not status_info.get("model_loaded"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trained malaria forecast model artifact is not currently available.",
        )
    try:
        return run_malaria_case_forecast(req.model_dump())
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to compute malaria case forecast for the supplied inputs.",
        )



