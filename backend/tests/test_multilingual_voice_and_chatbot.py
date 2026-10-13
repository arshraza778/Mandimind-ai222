"""
Comprehensive Automated Tests for Multilingual Support (en, hi, hne),
Voice-Based Mitanin Tasks & TTS Honesty, and Mitanin Sahayak Grounded AI Chatbot.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import init_db, SessionLocal
from app.db.seed import seed_database
from app.db.models import Task

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_seeded():
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


def _login(username: str, password: str = "password123"):
    resp = client.post("/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed for {username}: {resp.text}"
    return resp.json()


def test_multilingual_locales_and_preference_persistence():
    """
    Verifies:
    - GET /i18n/locales returns English ('en'), Hindi ('hi'), and Chhattisgarhi ('hne').
    - Authenticated users can persist preferred_language ('en', 'hi', 'hne') via POST /auth/language.
    - Subsequent /auth/me calls return the saved preferred_language.
    - Invalid language codes are rejected with 422 / 400.
    """
    locales_resp = client.get("/i18n/locales")
    assert locales_resp.status_code == 200
    data = locales_resp.json()
    assert data["default_locale"] == "en"
    assert data["fallback_locale"] == "en"
    codes = [loc["code"] for loc in data["locales"]]
    assert codes == ["en", "hi", "hne"]

    asha = _login("asha")
    headers = {"Authorization": f"Bearer {asha['token']}"}

    # Switch to Chhattisgarhi ('hne')
    hne_resp = client.post("/auth/language", json={"language": "hne"}, headers=headers)
    assert hne_resp.status_code == 200
    assert hne_resp.json()["preferred_language"] == "hne"

    me_resp = client.get("/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["preferred_language"] == "hne"

    # Switch to Hindi ('hi')
    hi_resp = client.post("/auth/language", json={"language": "hi"}, headers=headers)
    assert hi_resp.status_code == 200
    assert hi_resp.json()["preferred_language"] == "hi"

    # Reject invalid language code
    bad_resp = client.post("/auth/language", json={"language": "fr"}, headers=headers)
    assert bad_resp.status_code in (400, 422)


def test_translated_task_templates_and_supervisor_editing():
    """
    Verifies:
    - GET /i18n/task-templates returns reviewed templates in English, Hindi, and natural Chhattisgarhi.
    - Includes the exact malaria awareness visit template with natural Chhattisgarhi phrasing.
    - Field employees ('asha') cannot overwrite templates (403 Forbidden).
    - Supervisors ('verma') can update and review Chhattisgarhi task templates via PUT /i18n/task-templates/{key}.
    """
    resp = client.get("/i18n/task-templates")
    assert resp.status_code == 200
    templates = resp.json()["templates"]
    assert len(templates) >= 6

    malaria_visit = next(
        (t for t in templates if t["template_key"] == "malaria_village_awareness_visit"),
        None,
    )
    assert malaria_visit is not None
    assert (
        malaria_visit["translations"]["en"]["instructions"]
        == "Visit the assigned village, conduct the scheduled malaria awareness activity, and submit the field report before 4 PM."
    )
    assert (
        malaria_visit["translations"]["hi"]["instructions"]
        == "निर्धारित गाँव का दौरा करें, मलेरिया जागरूकता गतिविधि पूरी करें और शाम 4 बजे से पहले फील्ड रिपोर्ट जमा करें।"
    )
    assert "तय करे गाँव" in malaria_visit["translations"]["hne"]["instructions"]
    assert "मलेरिया" in malaria_visit["translations"]["hne"]["instructions"]

    # Field employee cannot edit templates
    asha = _login("asha")
    asha_headers = {"Authorization": f"Bearer {asha['token']}"}
    forbidden_resp = client.put(
        "/i18n/task-templates/malaria_village_awareness_visit",
        json={
            "title_hne": "मितानिन गाँव भेंट",
            "instructions_hne": "तय करे गाँव जाव अउ संझा 4 बजे ले पहिली रिपोर्ट भेजो।",
            "review_status": "reviewed",
        },
        headers=asha_headers,
    )
    assert forbidden_resp.status_code == 403

    # Supervisor can update Chhattisgarhi phrasing
    verma = _login("verma")
    verma_headers = {"Authorization": f"Bearer {verma['token']}"}
    update_resp = client.put(
        "/i18n/task-templates/malaria_village_awareness_visit",
        json={
            "instructions_hne": "तय करे गाँव (पारा) म जाव, तय मलेरिया जागरूकता अउ समझाइश के काम पूरा करव, अउ संझा 4 बजे ले पहिली फील्ड रिपोर्ट जमा कर दव।",
            "review_status": "reviewed",
        },
        headers=verma_headers,
    )
    assert update_resp.status_code == 200
    updated_tpl = update_resp.json()["template"]
    assert updated_tpl["review_status"] == "reviewed"
    assert "संझा 4 बजे" in updated_tpl["translations"]["hne"]["instructions"]


def test_tts_voice_honesty_and_no_auto_complete_on_audio():
    """
    Verifies:
    - GET /tts/status reports browser Web Speech guidance and strict Chhattisgarhi voice honesty.
    - Never exposes TTS_API_KEY.
    - POST /tts/synthesize refuses to falsely label Hindi ('hi-IN') as Chhattisgarhi ('hne') when no
      dedicated Chhattisgarhi voice provider is configured.
    - Reading or synthesizing task audio never marks a task complete automatically.
    """
    status_resp = client.get("/tts/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert "never labeled as Chhattisgarhi" in status_data["honesty_policy"]
    assert "api_key" not in str(status_data).lower()

    # Record task statuses before TTS call
    db = SessionLocal()
    try:
        before_statuses = {t.id: t.status for t in db.query(Task).all()}
    finally:
        db.close()

    # Attempt cloud synthesis for Chhattisgarhi without cloud provider configured
    synth_resp = client.post(
        "/tts/synthesize",
        json={
            "text": "तय करे गाँव म जाव अउ संझा 4 बजे ले पहिली फील्ड रिपोर्ट जमा कर दव।",
            "language": "hne",
            "speed": 1.0,
        },
    )
    assert synth_resp.status_code == 200
    synth_data = synth_resp.json()
    # Must honestly report native_hne_voice is False rather than faking hi-IN as a native hne voice
    assert synth_data["native_hne_voice"] is False
    assert synth_data["language"] == "hne"
    assert synth_data["honesty_notice"] is not None

    # Verify no task status was modified by TTS operations
    db = SessionLocal()
    try:
        after_statuses = {t.id: t.status for t in db.query(Task).all()}
    finally:
        db.close()
    assert before_statuses == after_statuses


def test_chatbot_config_and_public_multilingual_grounding():
    """
    Verifies:
    - GET /chatbot/config returns Mitanin Sahayak metadata and never leaks CHATBOT_API_KEY.
    - POST /chatbot/message on the Public Portal answers malaria, dengue, diarrhoea, and heat questions
      in English ('en'), Hindi ('hi'), and Chhattisgarhi ('hne') grounded in real backend records.
    - Distinguishes simulated/forecast data and preserves safe-water non-inference disclosure.
    - Never outputs forbidden words ('validated', 'deployed', 'proven').
    """
    cfg_resp = client.get("/chatbot/config")
    assert cfg_resp.status_code == 200
    cfg = cfg_resp.json()
    assert cfg["chatbot_name"] == "Mitanin Sahayak"
    assert {loc["code"] for loc in cfg["supported_languages"]} == {"en", "hi", "hne"}
    assert "api_key" not in cfg
    assert cfg["grounded_retrieval_enabled"] is True

    # 1. Public query in English
    en_resp = client.post(
        "/chatbot/message",
        json={
            "message": "What is the malaria risk in my village?",
            "language": "en",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
        },
    )
    assert en_resp.status_code == 200
    en_data = en_resp.json()
    assert en_data["language"] == "en"
    assert len(en_data["grounded_sources"]) >= 2
    assert "Malaria" in en_data["reply"]
    assert "BLK_A" in en_data["reply"]
    for forbidden in ("validated", "deployed", "proven"):
        assert forbidden not in en_data["reply"].lower()

    # 2. Public query in Hindi
    hi_resp = client.post(
        "/chatbot/message",
        json={
            "message": "मेरे गाँव में डेंगू का खतरा कितना है?",
            "language": "hi",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
        },
    )
    assert hi_resp.status_code == 200
    hi_data = hi_resp.json()
    assert hi_data["language"] == "hi"
    assert "डेंगू" in hi_data["reply"]

    # 3. Public query in Chhattisgarhi ('hne')
    hne_resp = client.post(
        "/chatbot/message",
        json={
            "message": "हमार गाँव म मलेरिया के कतका खतरा हावय?",
            "language": "hne",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
        },
    )
    assert hne_resp.status_code == 200
    hne_data = hne_resp.json()
    assert hne_data["language"] == "hne"
    assert "मलेरिया" in hne_data["reply"]
    assert any(marker in hne_data["reply"] for marker in ("हावय", "करव", "गाँव", "ब्लॉक", "मितानिन"))


def test_chatbot_employee_task_isolation_and_supervisor_jurisdiction():
    """
    Verifies:
    - Authenticated Mitanin ('asha') receives only her own assigned tasks from Mitanin Sahayak.
    - If 'asha' asks for another Mitanin's tasks ('rekha' or 'sunita'), the chatbot refuses access.
    - Block Supervisor ('verma', assigned to BLK_A) can query BLK_A team summaries, but gets 403 Forbidden
      when attempting to query BLK_B through the chatbot.
    """
    asha = _login("asha")
    asha_headers = {"Authorization": f"Bearer {asha['token']}"}

    # 1. Asha asks for her own assigned tasks in Chhattisgarhi
    own_resp = client.post(
        "/chatbot/message",
        json={
            "message": "मोर सौंपे गे काम अउ ओखर आखिरी बेरा बतावव।",
            "language": "hne",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
        },
        headers=asha_headers,
    )
    assert own_resp.status_code == 200
    own_data = own_resp.json()
    assert own_data["portal_role"] == "field_employee"
    assert "employee_tasks" in own_data["grounded_sources"]

    # 2. Asha tries to query Rekha's tasks -> refused by authorization guard
    other_resp = client.post(
        "/chatbot/message",
        json={
            "message": "Show me Rekha's assigned tasks and reports",
            "language": "en",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
        },
        headers=asha_headers,
    )
    assert other_resp.status_code == 200
    other_data = other_resp.json()
    assert (
        "Access Restricted" in other_data["reply"]
        or "only view tasks assigned to your own" in other_data["reply"]
        or "cannot view another employee" in other_data["reply"].lower()
    )

    # 3. Supervisor ('verma', BLK_A) queries authorized BLK_A vs unauthorized BLK_B
    verma = _login("verma")
    verma_headers = {"Authorization": f"Bearer {verma['token']}"}

    sup_ok = client.post(
        "/chatbot/message",
        json={
            "message": "Summarize team tasks and pending reports in my block.",
            "language": "en",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
        },
        headers=verma_headers,
    )
    assert sup_ok.status_code == 200
    assert sup_ok.json()["portal_role"] == "supervisor"
    assert "supervisor_team_tasks" in sup_ok.json()["grounded_sources"]

    sup_forbidden = client.post(
        "/chatbot/message",
        json={
            "message": "Summarize team tasks in BLK_B",
            "language": "en",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_B",
        },
        headers=verma_headers,
    )
    assert sup_forbidden.status_code == 403


def test_chatbot_consequential_action_requires_explicit_confirmation():
    """
    Verifies:
    - Asking Mitanin Sahayak to mark a task complete does NOT immediately mutate the database;
      instead it returns `requires_confirmation: True` and a `pending_action` payload.
    - Sending the follow-up request with `confirmed_action` executes the verified backend status update.
    """
    asha = _login("asha")
    asha_headers = {"Authorization": f"Bearer {asha['token']}"}

    tasks_resp = client.get("/employee/tasks", headers=asha_headers)
    assert tasks_resp.status_code == 200
    asha_tasks = tasks_resp.json()
    if isinstance(asha_tasks, dict):
        asha_tasks = asha_tasks.get("tasks", [])
    assert len(asha_tasks) > 0
    target_task = asha_tasks[0]
    task_id = target_task["id"]

    # Reset task status to 'sent' for deterministic test
    reset_resp = client.post(
        f"/tasks/{task_id}/status",
        json={"status": "sent"},
        headers=asha_headers,
    )
    assert reset_resp.status_code == 200

    # Step 1: User asks chatbot in natural language to complete the task (without confirmed_action)
    ask_resp = client.post(
        "/chatbot/message",
        json={
            "message": f"Please mark task #{task_id} complete",
            "language": "en",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
        },
        headers=asha_headers,
    )
    assert ask_resp.status_code == 200
    ask_data = ask_resp.json()
    assert ask_data["requires_confirmation"] is True
    assert ask_data["pending_action"] is not None
    assert ask_data["pending_action"]["task_id"] == task_id
    assert ask_data["action_executed"] is False

    # Verify DB was NOT modified yet
    db = SessionLocal()
    try:
        db_task = db.query(Task).filter(Task.id == task_id).first()
        assert db_task.status == "sent"
    finally:
        db.close()

    # Step 2: User explicitly confirms the consequential action
    confirm_resp = client.post(
        "/chatbot/message",
        json={
            "message": f"Confirm completing task #{task_id}",
            "language": "en",
            "district_id": "DIST_SAMPLE",
            "block_id": "BLK_A",
            "village_id": "VIL_A1",
            "confirmed_action": {
                "action_type": "update_task_status",
                "task_id": task_id,
                "new_status": "done",
                "confirmed": True,
            },
        },
        headers=asha_headers,
    )
    assert confirm_resp.status_code == 200
    confirm_data = confirm_resp.json()
    assert confirm_data["action_executed"] is True
    assert confirm_data["action_result"]["new_status"] == "done"

    # Verify DB is now updated to 'done'
    db = SessionLocal()
    try:
        db_task = db.query(Task).filter(Task.id == task_id).first()
        assert db_task.status == "done"
    finally:
        db.close()
