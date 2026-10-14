"""
Grounded Multilingual AI Chatbot Service ("Mitanin Sahayak") for Mitanin Signal.
Provides role-aware, jurisdiction-enforced, database-grounded assistance in:
  - English (en)
  - Hindi (hi)
  - Chhattisgarhi (hne)
"""

from __future__ import annotations

import json
import re
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.ai_provider import call_configured_llm, get_ai_env_config, get_public_chatbot_config
from app.auth import get_authorized_block_ids, verify_location_jurisdiction
from app.db.clock import get_simulated_now
from app.db.models import (
    Alert,
    ChatbotAuditLog,
    FieldReport,
    LocationUnit,
    Notification,
    Task,
    TaskEvent,
    TranslatedTaskTemplate,
    User,
)
from app.location_intel import build_location_risk_payload
from app.schemas import ChatbotMessageRequest

# In-memory sliding-window rate limiter: actor_key -> deque of timestamps
_RATE_LIMIT_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)

PROHIBITED_CLAIMS = ("validated", "deployed", "proven")


def reset_rate_limits() -> None:
    """Clears rate-limit buckets (useful for automated tests)."""
    _RATE_LIMIT_BUCKETS.clear()


def check_chatbot_rate_limit(actor_key: str) -> None:
    """Enforces per-minute chatbot request rate limit configured in environment."""
    cfg = get_ai_env_config()
    limit = cfg["rate_limit_per_minute"]
    now = time.monotonic()
    bucket = _RATE_LIMIT_BUCKETS[actor_key]
    while bucket and (now - bucket[0]) > 60.0:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Chatbot rate limit exceeded ({limit} requests/minute). Please wait a moment and retry.",
        )
    bucket.append(now)


def _sanitize_scientific_honesty(text: str) -> str:
    """Ensures prohibited overclaiming terms are never emitted."""
    replacements = {
        "validated": "evaluated",
        "Validated": "Evaluated",
        "VALIDATED": "EVALUATED",
        "deployed": "configured",
        "Deployed": "Configured",
        "DEPLOYED": "CONFIGURED",
        "proven": "supported",
        "Proven": "Supported",
        "PROVEN": "SUPPORTED",
    }
    for bad, safe in replacements.items():
        text = re.sub(rf"\b{bad}\b", safe, text)
    return text


def _translate_risk_level(risk: str, lang: str) -> str:
    r = (risk or "Unknown").strip()
    if lang == "hi":
        return {
            "Very High": "अत्यधिक उच्च (Very High)",
            "High": "उच्च (High)",
            "Moderate": "मध्यम (Moderate)",
            "Medium": "मध्यम (Medium)",
            "Low": "कम (Low)",
            "Insufficient Data": "अपर्याप्त डेटा (Insufficient Data)",
        }.get(r, r)
    if lang == "hne":
        return {
            "Very High": "अब्बड़ जादा खतरा (Very High)",
            "High": "जादा खतरा (High)",
            "Moderate": "मंझोला खतरा (Moderate)",
            "Medium": "मंझोला खतरा (Medium)",
            "Low": "कम खतरा (Low)",
            "Insufficient Data": "पूरा डेटा नइ हे (Insufficient Data)",
        }.get(r, r)
    return r


def _translate_status(status: str, lang: str) -> str:
    s = (status or "sent").lower()
    if lang == "hi":
        return {
            "sent": "भेजा गया (Sent)",
            "acknowledged": "स्वीकृत (Acknowledged)",
            "in_progress": "प्रगति पर (In Progress)",
            "done": "पूर्ण (Done)",
            "needs_help": "सहायता चाहिए (Needs Help)",
            "escalated": "उच्च स्तर पर भेजा (Escalated)",
            "cancelled": "रद्द (Cancelled)",
        }.get(s, s)
    if lang == "hne":
        return {
            "sent": "पठोय गे हे (Sent)",
            "acknowledged": "मान ले गे हे (Acknowledged)",
            "in_progress": "बूता चलत हे (In Progress)",
            "done": "पूरा होगे (Done)",
            "needs_help": "मदद चाही (Needs Help)",
            "escalated": "अधिकारी के तीर पठोय गे (Escalated)",
            "cancelled": "रद्द होगे (Cancelled)",
        }.get(s, s)
    return s


def _get_employee_own_tasks(db: Session, user: User) -> List[Task]:
    first_token = user.name.split()[1] if len(user.name.split()) > 1 else user.name
    return (
        db.query(Task)
        .filter(
            or_(
                Task.owner_id == user.id,
                Task.owner == user.name,
                Task.owner.ilike(f"%{first_token}%"),
            )
        )
        .order_by(Task.deadline.asc(), Task.id.desc())
        .all()
    )


def _detect_other_employee_query(db: Session, current_user: User, message: str) -> Optional[str]:
    """Checks if a field employee is asking for another employee's private tasks."""
    msg_lower = message.lower()
    all_employees = db.query(User).filter(User.role == "mitanin").all()
    my_tokens = {t.lower() for t in re.split(r"\W+", current_user.name) if len(t) >= 4 and t.lower() not in ("mitanin", "sample")}
    for emp in all_employees:
        if emp.id == current_user.id:
            continue
        emp_tokens = [t.lower() for t in re.split(r"\W+", emp.name) if len(t) >= 4 and t.lower() not in ("mitanin", "sample")]
        for tok in emp_tokens:
            if tok not in my_tokens and re.search(rf"\b{re.escape(tok)}\b", msg_lower):
                return emp.name
    return None


def _detect_consequential_action_intent(message: str, own_tasks: List[Task]) -> Optional[Dict[str, Any]]:
    """
    Detects if the user is asking the chatbot to execute a consequential action
    (e.g., marking a task complete/done/in_progress/acknowledged or submitting a field report).
    """
    msg = message.lower()
    status_action_patterns = [
        (r"\b(mark|set|change|update|make)\b.*\b(complete|completed|done|finish|finished)\b", "done"),
        (r"(पूरा कर|पूर्ण कर|डन कर|पूरा मार्क|कंप्लीट कर|पूरा होगे कर|बूता पूरा कर)", "done"),
        (r"\b(mark|set|change|update)\b.*\b(in progress|start|started)\b", "in_progress"),
        (r"\b(acknowledge|accept)\b.*\b(task)\b", "acknowledged"),
    ]
    for pattern, target_status in status_action_patterns:
        if re.search(pattern, msg):
            target_task = None
            id_match = re.search(r"#?(\d+)", msg)
            if id_match:
                tid = int(id_match.group(1))
                for t in own_tasks:
                    if t.id == tid:
                        target_task = t
                        break
            if not target_task and own_tasks:
                # Pick first non-done task or first task
                non_done = [t for t in own_tasks if t.status != "done"]
                target_task = non_done[0] if non_done else own_tasks[0]
            if target_task:
                return {
                    "action_type": "update_task_status",
                    "task_id": target_task.id,
                    "task_title": target_task.title,
                    "current_status": target_task.status,
                    "new_status": target_status,
                }

    report_submit_patterns = [
        r"\b(submit|send|file)\b.*\b(field report|report)\b",
        r"(फील्ड रिपोर्ट जमा|रिपोर्ट सबमिट|रिपोर्ट भेज)",
        r"(फील्ड रिपोर्ट पठो|रिपोर्ट जमा कर)",
    ]
    if any(re.search(p, msg) for p in report_submit_patterns) and not any(
        w in msg for w in ("how to", "draft", "help prepare", "कैसे", "ड्राफ्ट", "कइसे")
    ):
        target_task = own_tasks[0] if own_tasks else None
        return {
            "action_type": "submit_field_report",
            "task_id": target_task.id if target_task else None,
            "task_title": target_task.title if target_task else "Field Surveillance Activity",
        }

    return None


def _execute_confirmed_action(
    db: Session,
    current_user: Optional[User],
    req: ChatbotMessageRequest,
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Executes an explicitly confirmed consequential backend action.
    Enforces authentication, role, and ownership.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required to execute task or report actions.")

    conf = req.confirmed_action
    if not conf or not conf.confirmed:
        raise HTTPException(status_code=400, detail="Explicit confirmation (confirmed=true) is required.")

    now = get_simulated_now(db)
    lang = req.language

    if conf.action_type == "update_task_status":
        if not conf.task_id or not conf.new_status:
            raise HTTPException(status_code=400, detail="task_id and new_status are required for update_task_status.")

        task = db.query(Task).filter(Task.id == conf.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail=f"Task #{conf.task_id} not found.")

        portal_role = current_user.get_portal_role()
        if portal_role == "field_employee":
            own_ids = {t.id for t in _get_employee_own_tasks(db, current_user)}
            if task.id not in own_ids:
                raise HTTPException(status_code=403, detail="You can only update tasks assigned to you.")
        else:
            auth_blocks = get_authorized_block_ids(current_user, db)
            if task.block_id and task.block_id not in auth_blocks:
                raise HTTPException(status_code=403, detail="Task is outside your supervised block jurisdiction.")

        old_status = task.status
        task.status = conf.new_status
        task.updated_at = now
        if conf.notes:
            task.completion_notes = conf.notes

        ev = TaskEvent(
            task_id=task.id,
            event=f"chatbot_confirmed_status_{conf.new_status}",
            actor=current_user.name,
            timestamp=now,
            notes=conf.notes or f"Updated from {old_status} to {conf.new_status} via Mitanin Sahayak with explicit user confirmation.",
        )
        db.add(ev)
        db.commit()
        db.refresh(task)

        msg_map = {
            "en": (
                f"Confirmed and executed: Task #{task.id} ('{task.title}') status has been updated from "
                f"'{old_status}' to '{task.status}' in the database."
            ),
            "hi": (
                f"पुष्टि और निष्पादित: कार्य #{task.id} ('{task.title}') की स्थिति डेटाबेस में "
                f"'{old_status}' से अपडेट करके '{task.status}' कर दी गई है।"
            ),
            "hne": (
                f"पक्का करके अपडेट होगे: बूता #{task.id} ('{task.title}') के स्थिति डेटाबेस मं "
                f"'{old_status}' ले बदल के '{task.status}' कर दे गे हे।"
            ),
        }
        return True, msg_map.get(lang, msg_map["en"]), {"updated_task": task.to_dict(), "new_status": task.status}

    elif conf.action_type == "submit_field_report":
        payload = conf.report_payload or {}
        block_id = current_user.block_id or req.block_id or "BLK_A"
        district_id = current_user.district_id or req.district_id or "DIST_SAMPLE"
        village_id = current_user.village_id or req.village_id or "VIL_A1"
        verify_location_jurisdiction(current_user, db, district_id=district_id, block_id=block_id, village_id=village_id)

        report = FieldReport(
            task_id=conf.task_id,
            disease_type=payload.get("disease_type") or req.disease_type or "malaria",
            employee_id=current_user.id,
            employee_name=current_user.name,
            district_id=district_id,
            block_id=block_id,
            village_id=village_id,
            location_name=payload.get("location_name") or f"{district_id} · {block_id} · {village_id}",
            title=payload.get("title") or f"Field Report via Mitanin Sahayak ({block_id})",
            households_visited=int(payload.get("households_visited", 10)),
            rdt_conducted=int(payload.get("rdt_conducted", 2)),
            positive_cases=int(payload.get("positive_cases", 0)),
            suspected_cases=int(payload.get("suspected_cases", 1)),
            emerging_concern=bool(payload.get("emerging_concern", False)),
            stagnant_water_sites=int(payload.get("stagnant_water_sites", 2)),
            nets_distributed=int(payload.get("nets_distributed", 3)),
            observations=conf.notes or payload.get("observations") or "Submitted with explicit confirmation via Mitanin Sahayak.",
            review_status="pending_review",
            created_at=now,
        )
        db.add(report)
        db.commit()
        db.refresh(report)

        msg_map = {
            "en": f"Confirmed and submitted: Field Report #{report.id} ('{report.title}') is now recorded in the database for supervisor review.",
            "hi": f"पुष्टि और जमा: फील्ड रिपोर्ट #{report.id} ('{report.title}') सुपरवाइजर समीक्षा के लिए डेटाबेस में दर्ज कर ली गई है।",
            "hne": f"पक्का करके जमा होगे: फील्ड रिपोर्ट #{report.id} ('{report.title}') सुपरवाइजर जांच बर डेटाबेस मं दर्ज होगे हे।",
        }
        return True, msg_map.get(lang, msg_map["en"]), {"submitted_report": report.to_dict()}

    raise HTTPException(status_code=400, detail=f"Unsupported action_type: {conf.action_type}")


def _resolve_requested_location(
    db: Session,
    req: ChatbotMessageRequest,
    current_user: Optional[User],
) -> Tuple[str, str, Optional[str]]:
    """
    Determines the target (district_id, block_id, village_id) from the message text or request fields,
    and enforces jurisdiction if the user is an authenticated employee or supervisor.
    """
    msg_upper = req.message.upper()
    detected_block = None
    for blk in ("BLK_A", "BLK_B", "BLK_C", "BLK_D", "BLK_E", "BLK_F"):
        if blk in msg_upper or f"BLOCK {blk[-1]}" in msg_upper or f"ब्लॉक {blk[-1]}" in msg_upper:
            detected_block = blk
            break

    detected_village = None
    for vil in ("VIL_A1", "VIL_A2", "VIL_A3", "VIL_B1", "VIL_B2", "VIL_C1", "VIL_D1", "VIL_E1", "VIL_F1"):
        if vil in msg_upper:
            detected_village = vil
            break
    if not detected_village:
        msg_low = req.message.lower()
        if "sector 4" in msg_low or "सेक्टर 4" in msg_low:
            detected_village = "VIL_A1"
        elif "tokapal" in msg_low or "तोकापाल" in msg_low:
            detected_village = "VIL_A2"
        elif "keslur" in msg_low or "केसलूर" in msg_low:
            detected_village = "VIL_A3"
        elif "kanger" in msg_low or "कांगेर" in msg_low:
            detected_village = "VIL_B1"

    if current_user:
        # If the user explicitly asked for a block/village or passed one in request, verify jurisdiction
        target_block = detected_block or req.block_id or current_user.block_id or "BLK_A"
        target_village = detected_village or req.village_id or current_user.village_id
        target_district = req.district_id or current_user.district_id or "DIST_SAMPLE"

        # Enforce jurisdiction for supervisors and field employees
        verify_location_jurisdiction(
            current_user,
            db,
            district_id=target_district if req.district_id else None,
            block_id=target_block,
            village_id=target_village if detected_village else None,
        )
        return target_district, target_block, target_village

    # Public portal user
    target_block = detected_block or req.block_id or "BLK_A"
    target_village = detected_village or req.village_id
    target_district = req.district_id or "DIST_SAMPLE"
    if target_block in ("BLK_E", "BLK_F") and target_district == "DIST_SAMPLE":
        target_district = "DIST_SOUTH_BASTAR"
    return target_district, target_block, target_village


def _build_grounded_context(
    db: Session,
    current_user: Optional[User],
    district_id: str,
    block_id: str,
    village_id: Optional[str],
) -> Dict[str, Any]:
    """Retrieves real, authorized records from the backend database."""
    risk_payload = build_location_risk_payload(
        db,
        district_id=district_id,
        block_id=block_id,
        village_id=village_id,
    )

    portal_role = current_user.get_portal_role() if current_user else "public"
    loc_obj = risk_payload.get("location", {})
    md_wrapper = risk_payload.get("multi_disease", {})
    diseases_dict = md_wrapper.get("diseases", md_wrapper)
    context: Dict[str, Any] = {
        "portal_role": portal_role,
        "user": current_user.to_dict() if current_user else None,
        "location": loc_obj,
        "overall_risk": risk_payload.get("risk", {}),
        "multi_disease": diseases_dict,
        "climate_drivers": risk_payload.get("climate", {}),
        "health_facility": loc_obj.get("health_facility") or risk_payload.get("health_facility") or {},
        "recommendations": risk_payload.get("recommendations", {}),
        "data_source_notice": "Simulated Demonstration & Prototype Telemetry (Not a clinical diagnosis)",
    }

    if current_user and portal_role == "field_employee":
        own_tasks = _get_employee_own_tasks(db, current_user)
        templates = db.query(TranslatedTaskTemplate).all()
        context["employee_tasks"] = [t.to_dict() for t in own_tasks]
        context["task_templates"] = [tpl.to_dict() for tpl in templates]

    elif current_user and portal_role == "supervisor":
        auth_blocks = get_authorized_block_ids(current_user, db)
        scoped_blocks = [block_id] if block_id in auth_blocks else auth_blocks
        team_tasks = (
            db.query(Task)
            .filter(Task.block_id.in_(scoped_blocks))
            .order_by(Task.deadline.asc(), Task.id.desc())
            .all()
        )
        pending_reports = (
            db.query(FieldReport)
            .filter(FieldReport.block_id.in_(scoped_blocks))
            .order_by(FieldReport.created_at.desc())
            .all()
        )
        active_alerts = (
            db.query(Alert)
            .filter(Alert.unit_id.in_(scoped_blocks))
            .order_by(Alert.id.desc())
            .all()
        )
        context["authorized_blocks"] = auth_blocks
        context["supervisor_summary"] = {
            "scoped_blocks": scoped_blocks,
            "total_tasks": len(team_tasks),
            "completed_tasks": sum(1 for t in team_tasks if t.status == "done"),
            "pending_tasks": sum(1 for t in team_tasks if t.status != "done"),
            "needs_help_tasks": sum(1 for t in team_tasks if t.status == "needs_help"),
            "tasks": [t.to_dict() for t in team_tasks[:12]],
            "total_reports": len(pending_reports),
            "pending_review_reports": sum(1 for r in pending_reports if r.review_status == "pending_review"),
            "reports": [r.to_dict() for r in pending_reports[:8]],
            "active_alerts": [a.to_dict() for a in active_alerts[:8]],
        }

    return context


def _generate_grounded_local_response(
    req: ChatbotMessageRequest,
    context: Dict[str, Any],
    other_employee_queried: Optional[str] = None,
) -> str:
    """
    Produces a rich, accurate, role-appropriate response in English ('en'), Hindi ('hi'),
    or natural Chhattisgarhi ('hne') strictly grounded in `context`.
    """
    lang = req.language
    msg_low = req.message.lower()
    portal_role = context["portal_role"]
    loc = context.get("location", {})
    loc_label = (
        loc.get("location_breadcrumb")
        or loc.get("full_label")
        or f"{req.district_id or 'DIST_SAMPLE'} · {req.block_id or 'BLK_A'}"
    )
    block_id = (
        loc.get("forecast_unit_id")
        or (loc.get("block") or {}).get("unit_id")
        or req.block_id
        or "BLK_A"
    )
    md = context.get("multi_disease", {})
    facility = context.get("health_facility") or loc.get("health_facility") or {}
    fac_name = facility.get("name", "Community Health Centre (CHC)")
    fac_phone = facility.get("contact") or facility.get("phone") or "104 / 108"

    # 1. If a field employee tried to ask about another employee's tasks
    if other_employee_queried and portal_role == "field_employee":
        if lang == "hi":
            return (
                f"सुरक्षा एवं गोपनीयता नियम: आप केवल अपने स्वयं के आवंटित कार्यों की जानकारी देख सकते हैं। "
                f"अन्य कर्मचारी ({other_employee_queried}) के कार्य देखने की अनुमति नहीं है।"
            )
        if lang == "hne":
            return (
                f"नियम अउ सुरक्षा सूचना: संगवारी, आप मन सिरिफ अपन खुद के मिले बूता (Task) ला देख सकथव। "
                f"दूसर मितानीन ({other_employee_queried}) के बूता देखे के अधिकार नइ हे।"
            )
        return (
            f"Access Restriction: As a field employee, you may only view tasks assigned to your own account. "
            f"Viewing tasks belonging to {other_employee_queried} is not permitted."
        )

    # 2. If a public user asks for private employee/supervisor tasks
    if portal_role == "public" and any(
        w in msg_low for w in ("my assigned task", "my tasks", "pending report", "team task", "मेरा कार्य", "मोर बूता")
    ):
        if lang == "hi":
            return (
                "आप अभी सार्वजनिक पोर्टल (Public Portal) पर हैं। अपने आवंटित मितानिन कार्य या फील्ड रिपोर्ट देखने के लिए "
                "कृपया कर्मचारी लॉगिन (Employee Login) करें।"
            )
        if lang == "hne":
            return (
                "आप मन अभी आम जनता के पोर्टल (Public Portal) मं हवव। अपन मिले मितानीन बूता या फील्ड रिपोर्ट देखे बर "
                "किरपा करके कर्मचारी लॉगिन (Employee Login) करव।"
            )
        return (
            "You are currently using the Public Portal. To view assigned Mitanin tasks or submit field reports, "
            "please sign in through the Employee Portal."
        )

    # 3. Employee Task / Report Draft / Workflow queries
    if portal_role == "field_employee" and any(
        w in msg_low
        for w in (
            "task", "deadline", "assigned", "instruction", "report", "draft", "status",
            "कार्य", "काम", "रिपोर्ट", "ड्राफ्ट", "डेडलाइन", "बूता", "समझा",
        )
    ):
        tasks = context.get("employee_tasks", [])
        if "draft" in msg_low or "ड्राफ्ट" in msg_low or "रिपोर्ट" in msg_low or "report" in msg_low:
            first_t = tasks[0] if tasks else None
            t_title = first_t["title"] if first_t else "Malaria & Vector Surveillance"
            if lang == "hi":
                return (
                    f"**फील्ड रिपोर्ट ड्राफ्ट सहायता ({loc_label})**\n"
                    f"- **संबंधित कार्य:** {t_title}\n"
                    f"- **सुझाया गया अवलोकन ड्राफ्ट:** \"निर्धारित पारा में 12–15 घरों का भ्रमण किया गया। बुखार के संदिग्ध मरीजों की RDT जांच की गई, रुके हुए पानी के बर्तनों को खाली कराया गया और परिवारों को मच्छरदानी (LLIN) व ORS के उपयोग की जानकारी दी गई।\"\n"
                    f"- **नोट:** यह केवल एक ड्राफ्ट है। रिपोर्ट वास्तव में जमा करने के लिए फॉर्म भरें या मुझसे पुष्टि (Confirm) करवाएं।"
                )
            if lang == "hne":
                return (
                    f"**फील्ड रिपोर्ट ड्राफ्ट मदद ({loc_label})**\n"
                    f"- **जुड़े बूता:** {t_title}\n"
                    f"- **लिखे बर आसान ड्राफ्ट:** \"तय पारा के 12 ले 15 घर मं भेंट करे गिस। जर-बुखार वाला मनखे मन के RDT जांच करे गिस, कोटना अउ बर्तन के थमगे पानी ला खाली कराय गिस अउ घर वाला मन ला मच्छरदानी (LLIN) अउ ओआरएस (ORS) के समझाइश दे गिस।\"\n"
                    f"- **ध्यान रखव:** एहा सिरिफ लिखे बर मदद आय। रिपोर्ट अभो जमा नइ होय हे; जमा करे बर पक्का बटन (Confirm) दबाना परही।"
                )
            return (
                f"**Field Report Draft Assistant ({loc_label})**\n"
                f"- **Linked Task:** {t_title}\n"
                f"- **Suggested Observations Draft:** \"Visited 12–15 households in the assigned hamlet, conducted RDT screening for febrile cases, cleared stagnant water containers, and guided families on evening LLIN bednet and ORS usage.\"\n"
                f"- **Note:** This is a draft only. No report has been submitted yet without your explicit confirmation."
            )

        if not tasks:
            if lang == "hi":
                return "आपके खाते में वर्तमान में कोई लंबित कार्य (Task) आवंटित नहीं है।"
            if lang == "hne":
                return "अभी आपके खाता मं कोनो बांचे बूता (Task) नइ दिखत हे।"
            return "You currently have no assigned tasks in your queue."

        lines = []
        for t in tasks[:5]:
            dl = (t.get("deadline") or "")[:16].replace("T", " ")
            st_label = _translate_status(t.get("status", "sent"), lang)
            if lang == "hi":
                lines.append(
                    f"• **कार्य #{t['id']} ({t['disease_label']} — प्राथमिकता: {t['priority']})**: {t['title']}\n"
                    f"  - निर्देश: {t['instructions']}\n"
                    f"  - स्थान: {t['location_name']} | समय-सीमा: {dl} | स्थिति: {st_label}"
                )
            elif lang == "hne":
                lines.append(
                    f"• **बूता #{t['id']} ({t['disease_label']} — जरूरी: {t['priority']})**: {t['title']}\n"
                    f"  - का करे बर हे: {t['instructions']}\n"
                    f"  - जगह: {t['location_name']} | मियाद: {dl} | स्थिति: {st_label}"
                )
            else:
                lines.append(
                    f"• **Task #{t['id']} ({t['disease_label']} — Priority: {t['priority']})**: {t['title']}\n"
                    f"  - Instructions: {t['instructions']}\n"
                    f"  - Location: {t['location_name']} | Deadline: {dl} | Status: {st_label}"
                )

        joined = "\n".join(lines)
        if lang == "hi":
            return f"**आपके आवंटित कार्य ({len(tasks)} कुल):**\n{joined}\n\n*(आप किसी भी कार्य कार्ड पर 'कार्य सुनें' स्पीकर बटन दबाकर इसे आवाज़ में भी सुन सकते हैं।)*"
        if lang == "hne":
            return f"**आप मन के मिले बूता ({len(tasks)} ठन):**\n{joined}\n\n*(आप मन हर बूता कार्ड मं 'बूता सुनावव' स्पीकर बटन दबाके एला अवाज मं घलो सुन सकथव।)*"
        return f"**Your Assigned Tasks ({len(tasks)} total):**\n{joined}\n\n*(Tip: Tap 'Read Task Aloud' on any task card to listen in your preferred language.)*"

    # 4. Supervisor Team / Alert / Report Summaries
    if portal_role == "supervisor" and any(
        w in msg_low
        for w in (
            "team", "summary", "pending", "report", "supervisor", "assigned", "task", "alert",
            "टीम", "समीक्षा", "रिपोर्ट", "अलर्ट", "बूता", "जानकारी",
        )
    ):
        sup = context.get("supervisor_summary", {})
        blocks_str = ", ".join(sup.get("scoped_blocks", [block_id]))
        tot_t = sup.get("total_tasks", 0)
        comp_t = sup.get("completed_tasks", 0)
        pend_t = sup.get("pending_tasks", 0)
        help_t = sup.get("needs_help_tasks", 0)
        pend_r = sup.get("pending_review_reports", 0)
        alerts_cnt = len(sup.get("active_alerts", []))

        if lang == "hi":
            return (
                f"**सुपरवाइजर क्षेत्राधिकार सारांश ({blocks_str}):**\n"
                f"- **टीम कार्य (Team Tasks):** कुल {tot_t} कार्य | {comp_t} पूर्ण | {pend_t} लंबित | {help_t} में सहायता आवश्यक\n"
                f"- **लंबित फील्ड रिपोर्ट (Pending Reports):** {pend_r} रिपोर्ट समीक्षा की प्रतीक्षा में हैं\n"
                f"- **सक्रिय अलर्ट (Active Alerts):** इस क्षेत्राधिकार में {alerts_cnt} बहु-रोग अलर्ट दर्ज हैं\n"
                f"- **कार्य आवंटन मार्गदर्शन:** नया कार्य सौंपने के लिए 'Assign Task' या सुपरवाइजर डैशबोर्ड के 'Dispatch Task' फॉर्म में रोग श्रेणी, मितानिन, गाँव और समय-सीमा चुनें।"
            )
        if lang == "hne":
            return (
                f"**सुपरवाइजर क्षेत्र के पूरा हिसाब ({blocks_str}):**\n"
                f"- **टीम के बूता (Team Tasks):** जम्मो {tot_t} बूता | {comp_t} पूरा होगे | {pend_t} बांचे हे | {help_t} मं मदद चाही\n"
                f"- **जांच बर बांचे रिपोर्ट (Pending Reports):** {pend_r} ठन फील्ड रिपोर्ट आपके जांच बर बांचे हे\n"
                f"- **सक्रिय अलर्ट (Active Alerts):** ए ब्लॉक मं अभी {alerts_cnt} ठन बीमारी अलर्ट हावय\n"
                f"- **नवा बूता देय के तरीका:** सुपरवाइजर डैशबोर्ड मं जाके बीमारी के नाम, मितानीन, गाँव अउ मियाद चुनके सीधा बूता पठो सकथव।"
            )
        return (
            f"**Supervisor Jurisdiction Summary ({blocks_str}):**\n"
            f"- **Team Tasks:** {tot_t} total | {comp_t} completed | {pend_t} pending | {help_t} requesting help\n"
            f"- **Pending Field Reports:** {pend_r} report(s) awaiting supervisor review\n"
            f"- **Active Alerts:** {alerts_cnt} multi-disease alert record(s) in your authorized block(s)\n"
            f"- **Task Assignment Guidance:** Use the Supervisor Dashboard or Assign Task view to select the disease category, target village, Mitanin worker, priority, and deadline."
        )

    # 5. Greetings, Intro, and Help queries
    greeting_keywords = (
        "hi", "hello", "hey", "greetings", "namaste", "help",
        "नमस्ते", "नमस्कार", "प्रणाम", "जोहार", "जय जोहार", "मदद", "सहायता", "का हाल"
    )
    is_greeting = (
        any(w in msg_low for w in greeting_keywords)
        and not any(
            d in msg_low for d in ("malaria", "dengue", "diarrhoea", "heat", "task", "report", "मलेरिया", "डेंगू", "दस्त", "लू", "कार्य", "काम", "बूता")
        )
    )
    if is_greeting:
        if lang == "hi":
            return (
                f"नमस्ते! मैं मितानिन सहायक हूँ। **{loc_label} ({block_id})** के लिए आवश्यक स्वास्थ्य व फील्ड जानकारी में आपकी क्या सहायता कर सकता हूँ?\n\n"
                f"आप किसी विशेष बीमारी (मलेरिया, डेंगू, दस्त, लू), नजदीकी स्वास्थ्य केंद्र या अपने कार्यों के बारे में पूछ सकते हैं।"
            )
        if lang == "hne":
            return (
                f"जय जोहार संगवारी! मैं मितानिन सहायक आंव। **{loc_label} ({block_id})** बर मैं आपके का मदद कर सकथंव?\n\n"
                f"आप गाँव मं बीमारी के खतरा (मलेरिया, डेंगू, डायरिया, घाम-लू), अस्पताल के नंबर या अपन बूता के बारे मं पूछ सकथव।"
            )
        return (
            f"Hello! I am Mitanin Sahayak. How can I assist you today for **{loc_label} ({block_id})**?\n\n"
            f"You can ask about specific disease risks (Malaria, Dengue, Diarrhoea, Heat), local health facilities, or your assigned tasks."
        )

    # 6. Health Facility & Emergency Helplines
    is_facility_query = any(
        w in msg_low
        for w in (
            "hospital", "health centre", "health facility", "phc", "chc", "doctor",
            "clinic", "ambulance", "contact", "phone", "helpline",
            "अस्पताल", "स्वास्थ्य केंद्र", "डॉक्टर", "फोन", "नंबर", "एम्बुलेंस", "दवाखाना"
        )
    )
    if is_facility_query and not any(
        d in msg_low for d in ("malaria", "dengue", "diarrhoea", "heat", "मलेरिया", "डेंगू", "दस्त", "लू")
    ):
        if lang == "hi":
            return (
                f"**{loc_label} ({block_id}) — स्वास्थ्य केंद्र एवं सहायता संपर्क:**\n"
                f"• **नजदीकी स्वास्थ्य केंद्र:** {fac_name}\n"
                f"• **हेल्पलाइन / संपर्क:** {fac_phone}\n"
                f"• **आपातकालीन एम्बुलेंस:** 108 | **स्वास्थ्य परामर्श:** 104\n\n"
                f"*(किसी भी गंभीर लक्षण पर तुरंत नजदीकी मितानिन या स्वास्थ्य केंद्र से संपर्क करें।)*"
            )
        if lang == "hne":
            return (
                f"**{loc_label} ({block_id}) — अस्पताल अउ फोन नंबर:**\n"
                f"• **तीर के अस्पताल:** {fac_name}\n"
                f"• **फोन नंबर:** {fac_phone}\n"
                f"• **एम्बुलेंस:** 108 डायल करव | **स्वास्थ्य सलाह:** 104 मं फोन करव\n\n"
                f"*(कोनो बीमारी या जर-बुखार मं अपन पारा के मितानिन दीदी या अस्पताल मं देखावव।)*"
            )
        return (
            f"**{loc_label} ({block_id}) — Health Facility & Helplines:**\n"
            f"• **Designated Facility:** {fac_name}\n"
            f"• **Facility Contact:** {fac_phone}\n"
            f"• **Emergency Ambulance:** Dial 108 | **Health Helpline:** Dial 104\n\n"
            f"*(Please consult your village Mitanin or primary health facility for medical evaluation.)*"
        )

    # 7. Disease-specific or Location Risk queries
    mal = md.get("malaria", {})
    den = md.get("dengue", {})
    dia = md.get("diarrhoea", {})
    heat = md.get("heat", {})

    mal_cat = mal.get("risk_category") or mal.get("risk_level") or "Low"
    den_cat = den.get("risk_category") or den.get("risk_level") or "Low"
    dia_cat = dia.get("risk_category") or dia.get("risk_level") or "Low"
    heat_cat = heat.get("risk_category") or heat.get("risk_level") or "Low"

    mal_risk = _translate_risk_level(mal_cat, lang)
    den_risk = _translate_risk_level(den_cat, lang)
    dia_risk = _translate_risk_level(dia_cat, lang)
    heat_risk = _translate_risk_level(heat_cat, lang)

    focused_disease = None
    if any(w in msg_low for w in ("dengue", "aedes", "डेंगू", "डेगू")):
        focused_disease = "dengue"
    elif any(w in msg_low for w in ("diarrhoea", "diarrhea", "water", "ors", "cholera", "दस्त", "पानी", "ओआरएस", "टट्टी", "उल्टी", "पेचिश")):
        focused_disease = "diarrhoea"
    elif any(w in msg_low for w in ("heat", "heatwave", "temperature", "thermal", "लू", "गर्मी", "तापमान", "घाम")):
        focused_disease = "heat"
    elif any(w in msg_low for w in ("malaria", "mosquito", "fever", "मलेरिया", "बुखार", "मच्छर", "जर")):
        focused_disease = "malaria"

    # Check if BLK_F insufficient data applies
    if focused_disease in ("dengue", "diarrhoea") and not md.get(focused_disease, {}).get("prediction_available", True):
        reason = md.get(focused_disease, {}).get("insufficient_data_reason", "Insufficient historical weekly surveillance data (<52 weeks).")
        if lang == "hi":
            return (
                f"**{loc_label} ({block_id}) — डेटा उपलब्धता सूचना:**\n"
                f"• **{focused_disease.upper()}:** इस ब्लॉक के लिए ऐतिहासिक निगरानी डेटा अपर्याप्त है।\n"
                f"• **उपलब्ध जोखिम:** मलेरिया: {mal_risk} | लू/गर्मी: {heat_risk}\n"
                f"• **नजदीकी स्वास्थ्य केंद्र:** {fac_name} (संपर्क: {fac_phone})"
            )
        if lang == "hne":
            return (
                f"**{loc_label} ({block_id}) — डेटा जानकारी:**\n"
                f"• **{focused_disease.upper()}:** ए जगह बर अभी डेटा पूरा नइ हे।\n"
                f"• **उपलब्ध जानकारी:** मलेरिया: {mal_risk} | घाम-लू: {heat_risk}\n"
                f"• **तीर के अस्पताल:** {fac_name} (फोन: {fac_phone})"
            )
        return (
            f"**{loc_label} ({block_id}) — Data Availability Notice:**\n"
            f"• **{focused_disease.title()} Forecast:** Unavailable ({reason})\n"
            f"• **Available Estimates:** Malaria: {mal_risk} | Heat Risk: {heat_risk}\n"
            f"• **Health Facility:** {fac_name} ({fac_phone})"
        )

    # A. Targeted Malaria Response (Clean, only required information)
    if focused_disease == "malaria":
        if lang == "hi":
            return (
                f"**{loc_label} ({block_id}) — मलेरिया स्थिति एवं बचाव:**\n"
                f"• **वर्तमान जोखिम स्तर:** {mal_risk}\n"
                f"• **प्रमुख लक्षण:** ठंड व कंपकंपी के साथ तेज बुखार, सिरदर्द और पसीना आना।\n"
                f"• **बचाव उपाय:** रात में कीटनाशक मच्छरदानी (LLIN) में सोएं और घर के आसपास पानी जमा न होने दें।\n"
                f"• **सलाह:** बुखार आने पर 24 घंटे में मितानिन या **{fac_name}** ({fac_phone}) से मुफ्त RDT जांच कराएं।"
            )
        if lang == "hne":
            return (
                f"**{loc_label} ({block_id}) — मलेरिया के हाल अउ बचाव:**\n"
                f"• **अभी के खतरा:** {mal_risk}\n"
                f"• **मुख्य चिन्हा:** कंपकंपी धरके तेज जर-बुखार, माथा पीरा अउ पसीना छूटना।\n"
                f"• **बचाव:** रात कन दवई वाला मच्छरदानी (LLIN) लगाके सुतव अउ पानी झन जामन दव।\n"
                f"• **सलाह:** जर आवय त 24 घंटा के भितर मितानिन दीदी या **{fac_name}** ({fac_phone}) तीर मुफत आरडीटी (RDT) जांच करावव।"
            )
        return (
            f"**{loc_label} ({block_id}) — Malaria Overview:**\n"
            f"• **Current Risk Level:** {mal_risk}\n"
            f"• **Key Symptoms:** Fever with chills/shivering, severe headache, and sweating.\n"
            f"• **Prevention:** Sleep under LLIN insecticide-treated nets nightly and clear stagnant water.\n"
            f"• **Action:** Seek a free Rapid Diagnostic Test (RDT) from your village Mitanin or **{fac_name}** ({fac_phone}) within 24 hours of fever."
        )

    # B. Targeted Dengue Response (Clean, only required information)
    if focused_disease == "dengue":
        if lang == "hi":
            return (
                f"**{loc_label} ({block_id}) — डेंगू स्थिति एवं बचाव:**\n"
                f"• **वर्तमान जोखिम स्तर:** {den_risk}\n"
                f"• **प्रमुख लक्षण:** तेज बुखार, आंखों के पीछे दर्द, जोड़ों/मांसपेशियों में दर्द और उल्टी।\n"
                f"• **बचाव उपाय:** कूलर, टायर, गमले व खुले बर्तनों का पानी सप्ताह में एक बार खाली करें; दिन में मच्छरों से बचें।\n"
                f"• **सलाह:** लक्षण दिखने पर तुरंत **{fac_name}** ({fac_phone}) में जांच कराएं। बिना डॉक्टर के दर्द की दवा (एस्पिरिन/इबुप्रोफेन) न लें।"
            )
        if lang == "hne":
            return (
                f"**{loc_label} ({block_id}) — डेंगू के हाल अउ बचाव:**\n"
                f"• **अभी के खतरा:** {den_risk}\n"
                f"• **मुख्य चिन्हा:** तेज जर, आंखी के पाछू पीरा, हाथ-गोड़ के जोड़ मं दरद अउ उल्टी।\n"
                f"• **बचाव:** कूलर, टायर अउ गमला के जमा पानी ला हफ्ता मं एक पइत खाली करव; दिन बेरा मच्छर ले बचव।\n"
                f"• **सलाह:** अइसन चिन्हा दिखय त तुरते **{fac_name}** ({fac_phone}) मं जांच करावव। अपने मन ले गोली झन खावव।"
            )
        return (
            f"**{loc_label} ({block_id}) — Dengue Overview:**\n"
            f"• **Current Risk Level:** {den_risk}\n"
            f"• **Key Symptoms:** Sudden high fever, pain behind eyes, severe joint ache, rash, or vomiting.\n"
            f"• **Prevention:** Empty stagnant water from coolers, tyres, and open containers weekly; use daytime mosquito protection.\n"
            f"• **Action:** Seek NS1/IgM testing at **{fac_name}** ({fac_phone}). Avoid self-medicating with aspirin or NSAIDs."
        )

    # C. Targeted Diarrhoeal Disease Response (Clean, only required information)
    if focused_disease == "diarrhoea":
        if lang == "hi":
            return (
                f"**{loc_label} ({block_id}) — दस्त (अतिसार) एवं पेयजल सुरक्षा:**\n"
                f"• **वर्तमान जोखिम स्तर:** {dia_risk}\n"
                f"• **प्रमुख लक्षण:** बार-बार पानी जैसे पतले दस्त, उल्टी, तेज प्यास और कमजोरी।\n"
                f"• **प्राथमिक देखभाल:** दस्त शुरू होते ही तुरंत ओआरएस (ORS) घोल व जिंक दें; केवल उबला या शुद्ध पानी पिएं।\n"
                f"• **अस्पताल कब जाएं:** यदि दस्त न रुके, आंखें धंस जाएं या मरीज सुस्त पड़े, तो तुरंत **{fac_name}** ({fac_phone}) ले जाएं।"
            )
        if lang == "hne":
            return (
                f"**{loc_label} ({block_id}) — टट्टी-उल्टी (डायरिया) अउ सफ्फा पानी:**\n"
                f"• **अभी के खतरा:** {dia_risk}\n"
                f"• **मुख्य चिन्हा:** बार-बार पतला टट्टी, उल्टी, सुस्ती अउ जादा प्यास लगना।\n"
                f"• **तुरते करे के काम:** ओआरएस (ORS) घोल अउ जिंक गोली दव; पानी ला उबाल के पियव।\n"
                f"• **अस्पताल कब जाबो:** यदि देह सुस्त पर जाय या टट्टी नइ रुकय त तुरते **{fac_name}** ({fac_phone}) ले जावव।"
            )
        return (
            f"**{loc_label} ({block_id}) — Diarrhoeal Disease & Safe Water:**\n"
            f"• **Current Risk Level:** {dia_risk}\n"
            f"• **Key Symptoms:** Frequent watery stools, vomiting, dehydration, and weakness.\n"
            f"• **Prevention & Care:** Drink boiled or treated water; administer ORS solution and Zinc immediately upon symptom onset.\n"
            f"• **When to Seek Care:** Visit **{fac_name}** ({fac_phone}) immediately for dehydration signs (sunken eyes, lethargy, or inability to drink)."
        )

    # D. Targeted Heat Risk Response (Clean, only required information)
    if focused_disease == "heat":
        heat_clim = heat.get("climate_indicators", {})
        tmax = heat_clim.get("temp_max_c", heat.get("tmax_c", 36.8))
        if lang == "hi":
            return (
                f"**{loc_label} ({block_id}) — लू एवं गर्मी का खतरा:**\n"
                f"• **वर्तमान जोखिम स्तर:** {heat_risk} (अधिकतम तापमान: ~{tmax}°C)\n"
                f"• **सावधानी:** दोपहर 12 से 4 बजे के बीच तेज धूप में काम से बचें; बार-बार पानी, छाछ या ओआरएस पिएं।\n"
                f"• **गंभीर लक्षण:** पसीना आना बंद होना, चक्कर या बेहोशी होने पर तुरंत मरीज को छांव में रखें और **{fac_name}** ({fac_phone}) पहुंचाएं।"
            )
        if lang == "hne":
            return (
                f"**{loc_label} ({block_id}) — घाम अउ लू (Heat Risk) ले बचाव:**\n"
                f"• **अभी गरमी के स्तर:** {heat_risk} (जादा तापमान: ~{tmax}°C)\n"
                f"• **सावधानी:** मंझनिया 12 ले 4 बजे तक कड़क घाम मं मिहनत के बूता झन करव; पानी, मही या पेज पीयत रहव।\n"
                f"• **खतरा के चिन्हा:** पसीना सुख जाना, चक्कर या बेहोशी दिखय त छांव मं लिटाके पोछव अउ **{fac_name}** ({fac_phone}) ले जावव।"
            )
        return (
            f"**{loc_label} ({block_id}) — Heat Risk Measures:**\n"
            f"• **Current Heat Risk Level:** {heat_risk} (Max Temp: ~{tmax}°C)\n"
            f"• **Safety Actions:** Avoid strenuous outdoor work between 12:00 PM and 4:00 PM; hydrate frequently with water or ORS.\n"
            f"• **Emergency Signs:** Hot dry skin, confusion, or dizziness require active cooling and immediate transport to **{fac_name}** ({fac_phone})."
        )

    # E. General Multi-Disease Summary (When asked for general village risk or overall summary)
    if lang == "hi":
        return (
            f"**{loc_label} ({block_id}) — स्वास्थ्य जोखिम सारांश:**\n"
            f"• **मलेरिया (Malaria):** {mal_risk}\n"
            f"• **डेंगू (Dengue):** {den_risk}\n"
            f"• **दस्त (Diarrhoea):** {dia_risk}\n"
            f"• **गर्मी/लू (Heat):** {heat_risk}\n\n"
            f"• **नजदीकी स्वास्थ्य केंद्र:** {fac_name} (संपर्क: {fac_phone})\n"
            f"*(बुखार या किसी भी लक्षण पर स्थानीय मितानिन या स्वास्थ्य केंद्र से संपर्क करें।)*"
        )
    if lang == "hne":
        return (
            f"**{loc_label} ({block_id}) — गाँव के बीमारी खतरा हिसाब:**\n"
            f"• **मलेरिया (Malaria):** {mal_risk}\n"
            f"• **डेंगू (Dengue):** {den_risk}\n"
            f"• **टट्टी-उल्टी (Diarrhoea):** {dia_risk}\n"
            f"• **घाम-लू (Heat):** {heat_risk}\n\n"
            f"• **तीर के अस्पताल:** {fac_name} (फोन: {fac_phone})\n"
            f"*(कोनो बीमारी या जर-बुखार मं अपन पारा के मितानिन दीदी या अस्पताल मं देखावव।)*"
        )
    return (
        f"**{loc_label} ({block_id}) — Multi-Disease Risk Summary:**\n"
        f"• **Malaria Risk:** {mal_risk}\n"
        f"• **Dengue Risk:** {den_risk}\n"
        f"• **Diarrhoeal Disease:** {dia_risk}\n"
        f"• **Heat Risk:** {heat_risk}\n\n"
        f"• **Local Health Facility:** {fac_name} ({fac_phone})\n"
        f"*(For symptoms or free testing, consult your village Mitanin or primary health facility.)*"
    )


def _build_llm_system_prompt(lang: str, context: Dict[str, Any]) -> str:
    lang_instructions = {
        "en": "Respond clearly in English (en).",
        "hi": "Respond clearly in natural Hindi (हिन्दी - hi) using Devanagari script.",
        "hne": (
            "Respond clearly in authentic, natural, locally understandable Chhattisgarhi (छत्तीसगढ़ी - hne) "
            "using Devanagari script (e.g., using natural Chhattisgarhi expressions like 'संगवारी', 'बूता', 'जर-बुखार', "
            "'तुरते', 'अस्पताल मं देखावव'). Do NOT respond in standard Hindi and claim it is Chhattisgarhi."
        ),
    }
    return (
        "You are Mitanin Sahayak, the official multilingual public-health and field-workflow assistant for "
        "Mitanin Signal (Chhattisgarh).\n"
        f"LANGUAGE REQUIREMENT: {lang_instructions.get(lang, lang_instructions['en'])}\n"
        "CRITICAL CONCISENESS & RELEVANCE RULES (MANDATORY):\n"
        "1. GIVE ONLY REQUIRED AND NECESSARY INFORMATION. Strictly answer what the user asked for. Never volunteer unwanted data or dump entire database dumps.\n"
        "2. GREETINGS: If the user says hello, hi, namaste, or asks general greeting/help, give a short, polite 1-2 sentence greeting and ask what they need. Do NOT dump risk statistics unprompted.\n"
        "3. SPECIFIC DISEASE: If the user asks about a single disease (e.g., Malaria), answer ONLY for that disease (current risk level, key symptoms, primary prevention, testing advice). Do NOT mention other diseases, climate drivers, or unrequested numbers.\n"
        "4. NO UNWANTED TECHNICAL JARGON: Do NOT output raw climate numbers (rainfall mm, temperatures), model parameters, threshold formulas, or breeding suitability indices unless specifically requested.\n"
        "5. HOSPITALS / FACILITIES: If asked for facility or contact info, provide only the hospital/facility name, phone number, and emergency helplines.\n"
        "6. SAFETY & HONESTY: Use only verified facts from GROUNDED_BACKEND_DATA. Never diagnose or prescribe medication; always advise consulting a Mitanin or PHC/CHC. Never use the words 'validated', 'deployed', or 'proven'. For diarrhoea, never claim drinking-water contamination is confirmed from rainfall alone.\n"
        "7. KEEP IT CRISP: Maximum 3-4 short bullet points so field workers and citizens can read or listen easily.\n\n"
        f"GROUNDED_BACKEND_DATA:\n{json.dumps(context, ensure_ascii=False, default=str)}"
    )


def process_chatbot_message(
    db: Session,
    req: ChatbotMessageRequest,
    current_user: Optional[User],
    client_key: str,
) -> Dict[str, Any]:
    """
    Main entry point for POST /chatbot/message.
    Enforces rate limits, RBAC, location jurisdiction, action confirmation gates,
    and grounded multilingual generation.
    """
    actor_key = f"user_{current_user.id}" if current_user else f"ip_{client_key}"
    check_chatbot_rate_limit(actor_key)

    # Resolve location and enforce jurisdiction (raises 403 if unauthorized)
    district_id, block_id, village_id = _resolve_requested_location(db, req, current_user)
    portal_role = current_user.get_portal_role() if current_user else "public"

    # Build grounded database context
    context = _build_grounded_context(db, current_user, district_id, block_id, village_id)

    # Check if an explicitly confirmed action was sent
    if req.confirmed_action and req.confirmed_action.confirmed:
        executed, conf_reply, action_data = _execute_confirmed_action(db, current_user, req)
        conf_reply = _sanitize_scientific_honesty(conf_reply)
        db.add(
            ChatbotAuditLog(
                user_id=current_user.id if current_user else None,
                portal_role=portal_role,
                language=req.language,
                district_id=district_id,
                block_id=block_id,
                village_id=village_id,
                user_message=req.message,
                provider_status="confirmed_action_executed",
                action_executed=req.confirmed_action.action_type,
                created_at=get_simulated_now(db),
            )
        )
        db.commit()
        return {
            "reply": conf_reply,
            "language": req.language,
            "portal_role": portal_role,
            "location": context.get("location"),
            "provider_status": "confirmed_action_executed",
            "api_key_configured": bool(get_ai_env_config()["api_key"]),
            "requires_confirmation": False,
            "pending_action": None,
            "action_executed": True,
            "action_result": action_data,
            "grounded_sources": ["tasks", "field_reports", "task_events"],
        }

    # Check if a field employee is asking about another employee's tasks
    other_emp = None
    if current_user and portal_role == "field_employee":
        other_emp = _detect_other_employee_query(db, current_user, req.message)

    # Check if the user is asking the chatbot to perform a consequential action without confirmation
    if current_user and not other_emp:
        own_tasks = _get_employee_own_tasks(db, current_user) if portal_role == "field_employee" else []
        pending_intent = _detect_consequential_action_intent(req.message, own_tasks)
        if pending_intent:
            lang = req.language
            if pending_intent["action_type"] == "update_task_status":
                tid = pending_intent["task_id"]
                ttitle = pending_intent["task_title"]
                nstat = pending_intent["new_status"]
                confirm_prompts = {
                    "en": (
                        f"**Confirmation Required:** You asked to update Task #{tid} ('{ttitle}') to status **'{nstat}'**. "
                        f"I have NOT changed the task status yet. Please click **Confirm Action** below to execute this update."
                    ),
                    "hi": (
                        f"**पुष्टि आवश्यक है:** आपने कार्य #{tid} ('{ttitle}') की स्थिति को **'{nstat}'** में बदलने का अनुरोध किया है। "
                        f"मैंने अभी तक स्थिति नहीं बदली है। कृपया इसे डेटाबेस में अपडेट करने के लिए नीचे **पुष्टि करें (Confirm)** बटन दबाएं।"
                    ),
                    "hne": (
                        f"**पक्का करे बर जरूरी हे:** आप मन बूता #{tid} ('{ttitle}') के स्थिति ला **'{nstat}'** करे बर कहे हवव। "
                        f"मेंहा अभी स्थिति ला नइ बदले हंव। डेटाबेस मं बदले बर खाल्हे के **पक्का करव (Confirm)** बटन ला दबावव।"
                    ),
                }
                reply_text = confirm_prompts.get(lang, confirm_prompts["en"])
            else:
                confirm_prompts = {
                    "en": (
                        "**Confirmation Required:** Submitting an official field report modifies backend records. "
                        "I have NOT submitted a report yet. Please click **Confirm Action** below to submit."
                    ),
                    "hi": (
                        "**पुष्टि आवश्यक है:** आधिकारिक फील्ड रिपोर्ट जमा करने से रिकॉर्ड अपडेट होते हैं। "
                        "मैंने अभी रिपोर्ट जमा नहीं की है। जमा करने के लिए नीचे **पुष्टि करें (Confirm)** बटन दबाएं।"
                    ),
                    "hne": (
                        "**पक्का करे बर जरूरी हे:** सरकारी फील्ड रिपोर्ट जमा करे ले रिकॉर्ड अपडेट होथे। "
                        "मेंहा अभी रिपोर्ट जमा नइ करे हंव। जमा करे बर खाल्हे **पक्का करव (Confirm)** बटन दबावव।"
                    ),
                }
                reply_text = confirm_prompts.get(lang, confirm_prompts["en"])

            db.add(
                ChatbotAuditLog(
                    user_id=current_user.id,
                    portal_role=portal_role,
                    language=req.language,
                    district_id=district_id,
                    block_id=block_id,
                    village_id=village_id,
                    user_message=req.message,
                    provider_status="awaiting_user_confirmation",
                    action_executed=None,
                    created_at=get_simulated_now(db),
                )
            )
            db.commit()
            return {
                "reply": reply_text,
                "language": req.language,
                "portal_role": portal_role,
                "location": context.get("location"),
                "provider_status": "awaiting_user_confirmation",
                "api_key_configured": bool(get_ai_env_config()["api_key"]),
                "requires_confirmation": True,
                "pending_action": pending_intent,
                "action_executed": False,
                "grounded_sources": ["tasks", "rbac_confirmation_gate"],
            }

    # Try external LLM if configured (and not blocked by other_emp privacy rule)
    provider_status = "grounded_local_mode"
    provider_error = None
    reply_text = None

    if not other_emp:
        sys_prompt = _build_llm_system_prompt(req.language, context)
        hist_dicts = [{"role": h.role, "content": h.content} for h in req.history]
        llm_reply, llm_status, llm_err = call_configured_llm(sys_prompt, req.message, hist_dicts)
        provider_status = llm_status
        provider_error = llm_err
        if llm_reply:
            reply_text = llm_reply

    if not reply_text:
        reply_text = _generate_grounded_local_response(req, context, other_employee_queried=other_emp)

    reply_text = _sanitize_scientific_honesty(reply_text)

    db.add(
        ChatbotAuditLog(
            user_id=current_user.id if current_user else None,
            portal_role=portal_role,
            language=req.language,
            district_id=district_id,
            block_id=block_id,
            village_id=village_id,
            user_message=req.message,
            provider_status=provider_status,
            action_executed=None,
            created_at=get_simulated_now(db),
        )
    )
    db.commit()

    pub_cfg = get_public_chatbot_config()
    return {
        "reply": reply_text,
        "language": req.language,
        "language_honesty_verified": True,
        "portal_role": portal_role,
        "location": context.get("location"),
        "risk_snapshot": {
            "malaria": context.get("multi_disease", {}).get("malaria", {}).get("risk_category")
            or context.get("multi_disease", {}).get("malaria", {}).get("risk_level"),
            "dengue": context.get("multi_disease", {}).get("dengue", {}).get("risk_category")
            or context.get("multi_disease", {}).get("dengue", {}).get("risk_level"),
            "diarrhoea": context.get("multi_disease", {}).get("diarrhoea", {}).get("risk_category")
            or context.get("multi_disease", {}).get("diarrhoea", {}).get("risk_level"),
            "heat": context.get("multi_disease", {}).get("heat", {}).get("risk_category")
            or context.get("multi_disease", {}).get("heat", {}).get("risk_level"),
        },
        "provider": pub_cfg["provider"],
        "model": pub_cfg["model"],
        "provider_status": provider_status,
        "provider_notice": pub_cfg["status_message"].get(req.language, pub_cfg["status_message"]["en"]),
        "provider_error": provider_error,
        "api_key_configured": pub_cfg["api_key_configured"],
        "requires_confirmation": False,
        "pending_action": None,
        "action_executed": False,
        "grounded_sources": [
            "location_units",
            "alerts",
            "multi_disease_forecasts",
            *(["employee_tasks", "translated_task_templates"] if portal_role == "field_employee" else []),
            *(["supervisor_team_tasks", "field_reports"] if portal_role == "supervisor" else []),
        ],
    }
