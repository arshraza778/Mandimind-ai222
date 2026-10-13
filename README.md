# Mitanin Signal: Multi-Disease Climate Early-Warning System (Prototype)

A climate-sensitive multi-disease early-warning and frontline action-tracking **PROTOTYPE** for Chhattisgarh covering four climate-sensitive health risks:
1. **Malaria** (`malaria`)
2. **Dengue** (`dengue`)
3. **Diarrhoeal Disease** (`diarrhoea`)
4. **Heat-Related Health Risk** (`heat`)

It forecasts transmission and meteorological health risks using lagged climate indicators, evaluates statistical models against seasonal baselines via an explicit skill gate, provides role-based portals and location-specific dashboards (`District → Block → Village`) for citizens, community health workers (Mitanins), and supervisors, and tracks closed-loop frontline execution.

Now upgraded with:
- **Multilingual Interface (`en`, `hi`, `hne`)**: Instant switching and persistence across **English (`en`)**, **Hindi (`hi`)**, and **Chhattisgarhi (`hne` — ISO 639-3)** with a standalone Chhattisgarhi dictionary (`frontend/src/i18n/locales/hne.ts`) and supervisor-editable multilingual task templates.
- **Voice-Based Task System for Mitanins**: Speaker buttons on every task card plus a dedicated outdoor-friendly **Voice Tasks** view (`VoiceTasksPage.tsx`) featuring Play, Pause/Resume, Stop, Replay, adjustable speed (`0.75x`–`1.25x`), speech-to-text dictation (`VoiceInputButton.tsx`), and strict Chhattisgarhi voice honesty (never falsely labeling Hindi `hi-IN` audio as Chhattisgarhi `hne`).
- **Mitanin Sahayak Multilingual AI Chatbot**: Role-aware, jurisdiction-enforced public-health and field-workflow assistant grounded in live backend records with a configurable server-side AI provider adapter (`backend/app/ai_provider.py`).

> **SIMULATED data. Not real surveillance data.**  
> **PROTOTYPE - SIMULATED DATA - sample names only**

---

## Scientific & Data Honesty Rules (Applies Everywhere)
- **All data is SIMULATED**: Never treat these numbers as clinical or epidemiological findings for Chhattisgarh.
- **Sample names only**: Synthetic blocks (`BLK_A`–`BLK_F`) and sample villages under `"Sample District (Bastar Demo Region)"` and `"South Bastar Region [SAMPLE DISTRICT]"`.
- **Strict Vocabulary**: Never use the words *"validated"*, *"deployed"*, or *"proven"*.
- **Lead Time Targets**: The 2–4 week lead time is an advance-warning target, not a verified outcome. All lead times are labeled `(target)`.
- **Model Skill Gate**: If the weather-informed GLM does not beat the seasonal baseline by at least a 60% win share and a 5% median MAE improvement, the system falls back to the seasonal baseline.
- **Geographic Granularity Disclosure**: When a village is selected, the system explicitly discloses that surveillance cases and weather models are evaluated at the **Block level** rather than inventing synthetic village-level forecast numbers.
- **Diarrhoeal Safe-Water Non-Inference Rule**: Drinking-water contamination or sanitation failure is **never inferred from rainfall alone**. Direct water-quality and sanitation telemetry is explicitly disclosed as not connected in this prototype; field verification via H2S / OTs chlorine test kits is recommended.
- **Heat Risk Separation**: Heat-Related Health Risk (`heat`) is kept separate from infectious-disease case models and is explicitly labeled as a **Rule-Based Meteorological Heat-Index Assessment (Non-Infectious)** rather than a trained clinical ML forecast.
- **Insufficient Historical Data Handling**: When a block has insufficient historical disease observations (`BLK_F` for `dengue` and `diarrhoea`, with only 18 weeks vs 52 required), the system returns `prediction_available: false` and displays that statistical prediction is unavailable rather than manufacturing a forecast curve.

---

## 1. Multilingual Architecture (`en`, `hi`, `hne`)

- **Supported Locales**:
  - `en`: English (`en-IN`)
  - `hi`: Hindi (`हिन्दी`, `hi-IN`)
  - `hne`: Chhattisgarhi (`छत्तीसगढ़ी`, `hne-IN`, ISO 639-3 standard identifier for Chhattisgarhi)
- **Fallback Chain**: `hne → hi → en` (`frontend/src/i18n/I18nContext.tsx` and `GET /i18n/locales`).
- **Separate Chhattisgarhi Dictionary**: Stored in `frontend/src/i18n/locales/hne.ts` so native speakers and Chhattisgarh public-health reviewers can inspect and refine regional phrasing independently.
- **Reviewed Multilingual Task Templates**: Stored in SQLite (`translated_task_templates` table) and exposed via `GET /i18n/task-templates` and `PUT /i18n/task-templates/{template_key}` so Supervisors can review and refine Chhattisgarhi task instructions in the **Settings, Data & Languages** page without changing code.
- **Session & Account Persistence**: Selected language updates the UI immediately without page reload, persists in `localStorage`, and syncs to the authenticated user's `preferred_language` column via `POST /auth/language`.

---

## 2. Voice-Based Task System & Chhattisgarhi Voice Honesty

- **Spoken Task Format**: Every task can be read aloud in `en`, `hi`, or `hne`, speaking:
  1. Task title
  2. Task instructions
  3. Assigned village/location
  4. Due date/time
  5. Priority
  6. Disease-specific safety instructions
- **Voice Controls**: Play, Pause/Resume, Stop, Replay, Speed selector (`0.75x`, `0.9x`, `1.0x`, `1.15x`, `1.25x`), and Language selector (`en`, `hi`, `hne`).
- **Strict Chhattisgarhi (`hne`) Voice Honesty**:
  - The browser's `window.speechSynthesis` is inspected for a genuine `hne` / `hne-IN` voice.
  - If unavailable on the device, the client queries `POST /tts/synthesize` for an optional configured cloud TTS provider (`TTS_PROVIDER`, `TTS_API_KEY`, `TTS_VOICE_HNE`).
  - **Never Fake Hindi as Chhattisgarhi**: If neither a native browser `hne` voice nor a cloud `hne` TTS provider is configured, the system **never** labels a Hindi (`hi-IN`) voice as Chhattisgarhi. Instead, it keeps the Chhattisgarhi text clearly readable on screen, displays a transparent notice, and offers an explicitly labeled *"Read using Hindi voice (हिन्दी आवाज़)"* option.
- **Explicit Task Completion Only**: Playing audio or using speech-to-text dictation never marks a task complete automatically. Tasks only change status through explicit verified actions.

---

## 3. Mitanin Sahayak — Grounded Multilingual AI Chatbot

- **Configurable Provider Adapter (`backend/app/ai_provider.py`)**:
  - Supports `gemini`, `openai`, `anthropic`, or `openai_compatible` via environment variables in `.env` (see `.env.example`).
  - **API Key Security**: `CHATBOT_API_KEY` and `TTS_API_KEY` are read exclusively on the backend and are never exposed in frontend code or browser responses.
  - **Graceful Operation Without API Key**: When `CHATBOT_API_KEY` is not yet configured, `Mitanin Sahayak` displays a clear configuration status badge and continues to answer questions in `en`, `hi`, and `hne` using deterministic grounded backend retrieval.
- **Role & Jurisdiction Enforcement**:
  - **Public Portal**: Answers questions on malaria, dengue, diarrhoeal disease, safe-water practices, heat safety, local risk levels, and CHC/PHC contacts.
  - **Field Employee / Mitanin**: Retrieves only the authenticated Mitanin's own assigned tasks and blocks queries for other employees' tasks.
  - **Supervisor**: Summarizes team tasks, alerts, and field reports strictly within the supervisor's assigned block/district jurisdiction (`403 Forbidden` outside jurisdiction).
  - **Explicit Confirmation Gate**: Consequential actions (such as marking a task complete via chat) return a `pending_confirmation` prompt first and only execute in SQLite after explicit user confirmation (`confirmed_action`).

### Environment Variables (`.env` / `.env.example`)

Copy `.env.example` to `.env` and provide your API key when ready:

```ini
CHATBOT_PROVIDER=none          # gemini | openai | anthropic | openai_compatible | none
CHATBOT_API_KEY=               # Your provider API key (never exposed to browser)
CHATBOT_MODEL=                 # e.g., gemini-2.5-flash, gpt-4o-mini, claude-3-5-sonnet-latest
CHATBOT_BASE_URL=              # Optional custom endpoint for openai_compatible
CHATBOT_TIMEOUT_SECONDS=20
CHATBOT_RATE_LIMIT_PER_MINUTE=30

TTS_PROVIDER=none              # none | openai_compatible | custom_http
TTS_API_KEY=
TTS_BASE_URL=
TTS_VOICE_EN=
TTS_VOICE_HI=
TTS_VOICE_HNE=
```

---

## Multi-Disease Risk Modules & Documented Thresholds

Each module implements the shared `BaseDiseaseRiskModule` contract (`backend/forecast/multi_disease.py`) and uses documented, disease-specific risk criteria (`Low`, `Moderate`, `High`, `Very High`):

| Module | Prediction Nature | Primary Metric | Low | Moderate | High | Very High |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Malaria** (`malaria`) | Trained Statistical NB-GLM (Skill-Gated vs Seasonal Baseline) | Weekly block malaria cases | `< 0.70×` seasonal alert threshold | `0.70× – 0.99×` alert threshold | `1.00× – 1.34×` alert threshold | `≥ 1.35×` alert threshold |
| **2. Dengue** (`dengue`) | Trained Statistical NB-GLM (`Aedes` Vector-Climate Covariates) | Weekly block dengue cases | `< 12` cases/wk | `12 – 24` cases/wk | `25 – 39` cases/wk | `≥ 40` cases/wk |
| **3. Diarrhoeal Disease** (`diarrhoea`) | Trained Statistical NB-GLM (Heavy-Rainfall & Seasonal Covariates) | Weekly block diarrhoeal cases | `< 28` cases/wk | `28 – 54` cases/wk | `55 – 84` cases/wk | `≥ 85` cases/wk |
| **4. Heat-Related Health Risk** (`heat`) | Rule-Based Meteorological Heat-Index Assessment (Non-Infectious) | Weekly peak Heat Index (`°C`) | `HI < 32.0°C` | `32.0°C ≤ HI < 38.0°C` | `38.0°C ≤ HI < 41.0°C` | `HI ≥ 41.0°C` or `Tmax ≥ 43.0°C` |

---

## Role-Based Login Portals & Seeded Test Accounts

| Username | Password | Assigned Role | Assigned Jurisdiction |
| :--- | :--- | :--- | :--- |
| `asha` | `password123` | **Field Employee / Mitanin** | `DIST_SAMPLE` · `BLK_A` · `VIL_A1` (Sector 4 Hamlet) |
| `rekha` | `password123` | **Field Employee / Mitanin** | `DIST_SAMPLE` · `BLK_A` · `VIL_A2` (Tokapal Tola) |
| `anita` | `password123` | **Field Employee / Mitanin** | `DIST_SAMPLE` · `BLK_A` · `VIL_A3` (Keslur Hamlet) |
| `sunita` | `password123` | **Field Employee / Mitanin** | `DIST_SAMPLE` · `BLK_B` · `VIL_B1` (Kanger Hamlet) |
| `meena` | `password123` | **Field Employee / Mitanin** | `DIST_SAMPLE` · `BLK_E` · `VIL_E1` (Forest Hamlet) |
| `radha` | `password123` | **Field Employee / Mitanin** | `DIST_SAMPLE` · `BLK_C` · `VIL_C1` (Karpawand) |
| `verma` | `password123` | **Supervisor (Block)** | `DIST_SAMPLE` · `BLK_A` (All Hamlets in Block A) |
| `patel` | `password123` | **Supervisor (Block)** | `DIST_SAMPLE` · `BLK_B` (All Hamlets in Block B) |
| `sharma` | `password123` | **Supervisor (District)** | `DIST_SAMPLE` (All Blocks `BLK_A`–`BLK_F`) |

---

## 2-Minute Quickstart (One-Click Setup & Run)

```powershell
# Run one-click seed and launch both backend and frontend servers
python seed_and_run.py --serve
```

Once running:
- **Portal Landing Page & Dashboards**: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- **Frontline Mobile Interface**: [http://127.0.0.1:5173/mitanin](http://127.0.0.1:5173/mitanin)
- **Backend Swagger API**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## Running Automated Tests

Run the complete test suite (54 unit, integration, RBAC, multi-disease, multilingual, voice, chatbot, and E2E tests):

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests/ -v
```

### Key Test Suites:
- `backend/tests/test_multilingual_voice_and_chatbot.py`: Verifies `en`/`hi`/`hne` locale endpoints, user language preference persistence, reviewed Chhattisgarhi task templates & supervisor editing, TTS voice honesty (`never_fake_hindi_as_hne`), non-auto-completion on audio playback, `Mitanin Sahayak` public/employee/supervisor grounding, employee task isolation, jurisdiction enforcement, and explicit confirmation before consequential actions.
- `backend/tests/test_multi_disease.py`: Verifies all 4 risk modules (`malaria`, `dengue`, `diarrhoea`, `heat`), documented thresholds, safe-water non-inference disclosure, and insufficient historical data handling.
- `backend/tests/test_rbac_and_portals.py`: Verifies PBKDF2 password login, role detection, logout session invalidation, cascading location hierarchy, and strict jurisdiction enforcement.
- `backend/tests/test_forecast_and_pipeline.py`: Verifies strict zero data leakage, MAE/RMSE metrics (strictly **no MAPE**), skill gate selection, and SQLite data preservation.
- `backend/tests/test_e2e_workflows.py` & `backend/tests/test_api.py` & `backend/tests/test_db_and_api.py`: End-to-end workflows, 48-hour Simulated Clock escalation path, and core API contract tests.
