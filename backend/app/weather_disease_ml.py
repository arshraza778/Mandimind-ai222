"""
Weather-Related Disease Prediction ML Inference Service.

Loads the fitted scikit-learn Pipeline from `artifacts/disease_prediction_model.joblib`
once (cached in memory) and executes validated inference using the exact 50-feature order
from `Weather-related disease prediction.csv`.

Safety & Honesty Rules:
- Never retrains on server startup or per-request.
- Never exposes local filesystem paths, secrets, or stack traces.
- Never presents model output as a confirmed clinical diagnosis.
- Triggers an explicit urgent-care warning when emergency red-flag symptoms
  (e.g., chest_pain, shortness_of_breath, confusion, trouble_seeing, rapid_breathing)
  or acute emergency conditions (Heart Attack, Stroke, Heat Stroke) are present.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
MODEL_ARTIFACT_PATH = ARTIFACTS_DIR / "disease_prediction_model.joblib"
METRICS_ARTIFACT_PATH = ARTIFACTS_DIR / "model_metrics.json"
EDA_ARTIFACT_PATH = ARTIFACTS_DIR / "dataset_analysis.json"

def normalize_humidity_array(X: Any) -> np.ndarray:
    """
    Ensures Humidity is normalized to [0, 1] fraction if a caller passes percentage (e.g., 74 instead of 0.74),
    while preserving exact dataset values when already in [0, 1.2].
    """
    arr = np.asarray(X, dtype=float).copy()
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    if arr.shape[1] >= 3:
        hum = arr[:, 2]
        mask_pct = hum > 1.2
        if np.any(mask_pct):
            arr[mask_pct, 2] = hum[mask_pct] / 100.0
    return arr


main_mod = sys.modules.get("__main__")
if main_mod is not None and not hasattr(main_mod, "normalize_humidity_array"):
    setattr(main_mod, "normalize_humidity_array", normalize_humidity_array)


ORDERED_FEATURE_COLUMNS: List[str] = [
    "Age",
    "Gender",
    "Temperature (C)",
    "Humidity",
    "Wind Speed (km/h)",
    "nausea",
    "joint_pain",
    "abdominal_pain",
    "high_fever",
    "chills",
    "fatigue",
    "runny_nose",
    "pain_behind_the_eyes",
    "dizziness",
    "headache",
    "chest_pain",
    "vomiting",
    "cough",
    "shivering",
    "asthma_history",
    "high_cholesterol",
    "diabetes",
    "obesity",
    "hiv_aids",
    "nasal_polyps",
    "asthma",
    "high_blood_pressure",
    "severe_headache",
    "weakness",
    "trouble_seeing",
    "fever",
    "body_aches",
    "sore_throat",
    "sneezing",
    "diarrhea",
    "rapid_breathing",
    "rapid_heart_rate",
    "pain_behind_eyes",
    "swollen_glands",
    "rashes",
    "sinus_headache",
    "facial_pain",
    "shortness_of_breath",
    "reduced_smell_and_taste",
    "skin_irritation",
    "itchiness",
    "throbbing_headache",
    "confusion",
    "back_pain",
    "knee_ache",
]

MEDICAL_HISTORY_FEATURES: List[str] = [
    "asthma_history",
    "high_cholesterol",
    "diabetes",
    "obesity",
    "hiv_aids",
    "nasal_polyps",
    "asthma",
    "high_blood_pressure",
]

SYMPTOM_FEATURES: List[str] = [
    c
    for c in ORDERED_FEATURE_COLUMNS
    if c not in ("Age", "Gender", "Temperature (C)", "Humidity", "Wind Speed (km/h)")
    and c not in MEDICAL_HISTORY_FEATURES
]

EMERGENCY_SYMPTOM_FLAGS: Dict[str, str] = {
    "chest_pain": "Chest pain reported — possible acute cardiac or pulmonary emergency.",
    "shortness_of_breath": "Shortness of breath / breathing difficulty reported.",
    "confusion": "Acute confusion / altered mental state reported.",
    "trouble_seeing": "Sudden visual disturbance (trouble seeing) reported.",
    "rapid_breathing": "Rapid breathing (tachypnea) reported.",
    "rapid_heart_rate": "Rapid heart rate (tachycardia) reported.",
}

ACUTE_EMERGENCY_CONDITIONS = {"Heart Attack", "Stroke", "Heat Stroke"}

DISEASE_ACTION_GUIDANCE: Dict[str, Dict[str, Any]] = {
    "Malaria": {
        "category": "Vector-Borne Parasitic Fever",
        "next_steps": [
            "Request a free Rapid Diagnostic Test (RDT) or blood smear from your local Mitanin or nearest Primary Health Centre (PHC).",
            "Do not self-medicate with incomplete antimalarial courses; start ACT/chloroquine only after RDT/microscopy confirmation.",
            "Use LLIN mosquito nets and eliminate stagnant water around the household.",
        ],
    },
    "Dengue": {
        "category": "Vector-Borne Viral Fever (Aedes)",
        "next_steps": [
            "Visit a PHC/CHC for NS1 antigen / IgM blood testing and platelet monitoring.",
            "Maintain oral hydration (ORS, clean water) and avoid aspirin/ibuprofen/NSAIDs due to bleeding risk.",
            "Seek immediate hospital care if warning signs appear (persistent vomiting, abdominal pain, mucosal bleeding, lethargy).",
        ],
    },
    "Heat Stroke": {
        "category": "Acute Meteorological Thermal Emergency",
        "next_steps": [
            "URGENT: Move the person immediately to a shaded or cool area, loosen clothing, and apply cool wet cloths or fan cooling.",
            "Seek emergency medical transport (Call 108 / 104) immediately — heat stroke is a life-threatening medical emergency.",
            "If conscious and able to swallow safely, provide small sips of cool water or ORS.",
        ],
    },
    "Heart Attack": {
        "category": "Acute Cardiovascular Emergency",
        "next_steps": [
            "URGENT EMERGENCY: Call 108 ambulance or proceed immediately to the nearest Emergency Department / CHC / District Hospital.",
            "Have the person rest in a comfortable seated position and avoid any physical exertion while awaiting emergency care.",
            "Do not rely on an algorithmic tool to rule in or rule out myocardial infarction — an immediate ECG and clinical evaluation are required.",
        ],
    },
    "Stroke": {
        "category": "Acute Neurological / Cerebrovascular Emergency",
        "next_steps": [
            "URGENT EMERGENCY: Call 108 immediately and note the exact time symptoms started.",
            "Check for facial drooping, arm weakness, vision trouble, confusion, or speech difficulty (FAST).",
            "Immediate hospital neuroimaging and emergency evaluation are critical; do not give food, drink, or unprescribed medication.",
        ],
    },
    "Influenza": {
        "category": "Respiratory Viral Illness",
        "next_steps": [
            "Rest, maintain adequate hydration, and monitor body temperature.",
            "Practice respiratory hygiene (masking, handwashing) to protect elderly or immunocompromised household members.",
            "Consult a PHC/CHC clinician if high fever persists beyond 3 days or if breathing difficulty develops.",
        ],
    },
    "Common Cold": {
        "category": "Upper Respiratory Tract Infection",
        "next_steps": [
            "Supportive care: rest, warm fluids, saline gargles, and hand hygiene.",
            "Avoid unnecessary antibiotics; consult a healthcare worker if fever escalates or symptoms last >7–10 days.",
        ],
    },
    "Sinusitis": {
        "category": "Upper Airway / Sinus Inflammation",
        "next_steps": [
            "Use steam inhalation, warm compresses over the sinus area, and adequate hydration.",
            "Consult a PHC clinician if severe facial pain, high fever, visual changes, or symptoms lasting >10 days occur.",
        ],
    },
    "Migraine": {
        "category": "Neurological Headache Disorder",
        "next_steps": [
            "Rest in a quiet, darkened room and maintain hydration.",
            "Seek urgent medical evaluation if the headache is sudden/thunderclap, accompanied by fever, confusion, stiff neck, or vision loss.",
        ],
    },
    "Eczema": {
        "category": "Dermatological / Skin Condition",
        "next_steps": [
            "Keep skin moisturized with fragrance-free emollients and avoid harsh soaps or scratching.",
            "Consult a PHC medical officer if signs of secondary skin infection (pus, spreading redness, fever) appear.",
        ],
    },
    "Arthritis": {
        "category": "Musculoskeletal / Joint Condition",
        "next_steps": [
            "Avoid overloading affected joints during acute pain flares; gentle range-of-motion care may help.",
            "Seek medical evaluation at a PHC/CHC if a joint becomes acutely hot, swollen, red, or accompanied by high fever.",
        ],
    },
}


_CACHED_BUNDLE: Optional[Dict[str, Any]] = None
_CACHED_MTIME: Optional[float] = None


def load_model_bundle() -> Optional[Dict[str, Any]]:
    """
    Loads the trained model bundle from disk and caches it in memory.
    Automatically reloads only if the artifact file timestamp changes.
    """
    global _CACHED_BUNDLE, _CACHED_MTIME
    if not MODEL_ARTIFACT_PATH.exists():
        return None
    try:
        mtime = MODEL_ARTIFACT_PATH.stat().st_mtime
        if _CACHED_BUNDLE is not None and _CACHED_MTIME == mtime:
            return _CACHED_BUNDLE

        main_mod = sys.modules.get("__main__")
        if main_mod is not None and not hasattr(main_mod, "normalize_humidity_array"):
            setattr(main_mod, "normalize_humidity_array", normalize_humidity_array)

        bundle = joblib.load(MODEL_ARTIFACT_PATH)
        _CACHED_BUNDLE = bundle
        _CACHED_MTIME = mtime
        return bundle
    except Exception:
        return None


def get_model_health_status() -> Dict[str, Any]:
    """
    Returns public-safe status and evaluation summary of the trained ML model.
    Never exposes local file paths.
    """
    bundle = load_model_bundle()
    if bundle is None:
        return {
            "model_loaded": False,
            "status": "unavailable",
            "message": "Trained weather-disease prediction artifact is not currently loaded.",
        }

    metrics_json: Dict[str, Any] = {}
    if METRICS_ARTIFACT_PATH.exists():
        try:
            metrics_json = json.loads(METRICS_ARTIFACT_PATH.read_text(encoding="utf-8"))
        except Exception:
            metrics_json = {}

    return {
        "model_loaded": True,
        "status": "ready",
        "model_name": bundle.get("model_name"),
        "model_version": bundle.get("model_version"),
        "trained_at": bundle.get("trained_at"),
        "num_classes": len(bundle.get("classes", [])),
        "classes": bundle.get("classes", []),
        "feature_count": len(bundle.get("feature_columns", ORDERED_FEATURE_COLUMNS)),
        "numeric_features": bundle.get("numeric_columns", []),
        "gender_encoding": {"0": "Female / Code 0 (per dataset)", "1": "Male / Code 1 (per dataset)"},
        "medical_history_features": bundle.get("medical_history_columns", MEDICAL_HISTORY_FEATURES),
        "symptom_features": bundle.get("symptom_columns", SYMPTOM_FEATURES),
        "numeric_ranges": bundle.get("numeric_ranges", {}),
        "test_metrics": bundle.get("test_metrics", {}),
        "validation_metrics": bundle.get("validation_metrics", {}),
        "cv_5fold_macro_f1_mean": bundle.get("cv_5fold_macro_f1_mean"),
        "cv_5fold_macro_f1_std": bundle.get("cv_5fold_macro_f1_std"),
        "top_features": bundle.get("top_features", [])[:12],
        "model_comparison": metrics_json.get("model_comparison", []),
        "per_class_report": metrics_json.get("test_set_evaluation", {}).get("per_class_report", {}),
        "limitations": metrics_json.get("limitations_and_medical_safety", []),
    }


def run_weather_disease_prediction(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes a single validated prediction using the loaded scikit-learn Pipeline.
    """
    bundle = load_model_bundle()
    if bundle is None or "pipeline" not in bundle:
        raise RuntimeError("Prediction model artifact is unavailable.")

    pipeline = bundle["pipeline"]
    feature_cols: List[str] = bundle.get("feature_columns", ORDERED_FEATURE_COLUMNS)

    # Extract demographic and weather inputs
    age = float(payload["age"])
    gender_raw = payload["gender"]
    if isinstance(gender_raw, str):
        g_norm = gender_raw.strip().lower()
        gender_val = 1 if g_norm in ("1", "male", "m") else 0
    else:
        gender_val = int(gender_raw)

    temp_c = float(payload["temperature_c"])
    humidity_raw = float(payload["humidity"])
    # Dataset stores Humidity as fraction in [0.0, 1.0]. Accept either fraction (0-1) or percentage (1-100).
    humidity_fraction = humidity_raw / 100.0 if humidity_raw > 1.0 else humidity_raw
    wind_kmh = float(payload["wind_speed_kmh"])

    symptoms_in: Dict[str, Any] = payload.get("symptoms") or {}
    history_in: Dict[str, Any] = payload.get("medical_history") or {}

    # Build the exact 50-feature dictionary in training column order
    row_dict: Dict[str, Any] = {
        "Age": age,
        "Gender": gender_val,
        "Temperature (C)": temp_c,
        "Humidity": humidity_fraction,
        "Wind Speed (km/h)": wind_kmh,
    }

    active_symptoms: List[str] = []
    active_history: List[str] = []

    for col in feature_cols:
        if col in row_dict:
            continue
        if col in MEDICAL_HISTORY_FEATURES:
            val = 1 if bool(history_in.get(col, symptoms_in.get(col, 0))) else 0
            row_dict[col] = val
            if val == 1:
                active_history.append(col)
        else:
            val = 1 if bool(symptoms_in.get(col, 0)) else 0
            row_dict[col] = val
            if val == 1:
                active_symptoms.append(col)

    # Maintain eye-pain synonym consistency if user selected one of the two eye-pain fields
    # while allowing explicit independent control if both are passed
    X_df = pd.DataFrame([[row_dict[c] for c in feature_cols]], columns=feature_cols)

    probs = pipeline.predict_proba(X_df)[0]
    classes: List[str] = list(pipeline.classes_)

    ranked_indices = np.argsort(probs)[::-1]
    top_idx = int(ranked_indices[0])
    second_idx = int(ranked_indices[1]) if len(ranked_indices) > 1 else top_idx

    predicted_disease = str(classes[top_idx])
    top_score = float(probs[top_idx])
    second_score = float(probs[second_idx])
    score_margin = top_score - second_score

    top_predictions = [
        {
            "disease": str(classes[i]),
            "probability_score": round(float(probs[i]), 4),
            "percentage": round(float(probs[i]) * 100.0, 1),
            "category": DISEASE_ACTION_GUIDANCE.get(str(classes[i]), {}).get("category", "Clinical Condition"),
        }
        for i in ranked_indices[:5]
    ]

    # Determine uncertainty / confidence band honestly
    total_binary_active = len(active_symptoms) + len(active_history)
    if total_binary_active == 0:
        confidence_band = "Low (No Symptoms Selected)"
        uncertainty_note = (
            "No symptom or medical-history flags were selected. Prediction relies solely on Age, Gender, "
            "and Weather variables, which cannot reliably distinguish clinical conditions."
        )
    elif top_score >= 0.70 and score_margin >= 0.35:
        confidence_band = "High Model Agreement"
        uncertainty_note = (
            f"The classifier assigned a {top_score * 100:.1f}% model score to {predicted_disease} "
            f"(margin of +{score_margin * 100:.1f}% over the next candidate, {classes[second_idx]}). "
            "Model agreement reflects statistical similarity to training records, not clinical certainty."
        )
    elif top_score >= 0.45 and score_margin >= 0.15:
        confidence_band = "Moderate Model Agreement"
        uncertainty_note = (
            f"The top candidate is {predicted_disease} ({top_score * 100:.1f}%), with secondary overlap "
            f"for {classes[second_idx]} ({second_score * 100:.1f}%). Multiple conditions share these symptoms."
        )
    else:
        confidence_band = "Low / Overlapping Symptom Profile"
        uncertainty_note = (
            f"Scores are spread across multiple candidate conditions ({predicted_disease}: {top_score * 100:.1f}%, "
            f"{classes[second_idx]}: {second_score * 100:.1f}%). Please consult a qualified clinician."
        )

    # Check Emergency Red Flags
    emergency_reasons: List[str] = []
    for sym_key, reason in EMERGENCY_SYMPTOM_FLAGS.items():
        if row_dict.get(sym_key, 0) == 1:
            emergency_reasons.append(reason)
    if predicted_disease in ACUTE_EMERGENCY_CONDITIONS and top_score >= 0.35:
        emergency_reasons.append(
            f"Top model match includes an acute medical emergency condition ({predicted_disease})."
        )

    is_emergency = len(emergency_reasons) > 0
    emergency_warning = {
        "is_emergency": is_emergency,
        "headline": (
            "URGENT MEDICAL WARNING: Potential Emergency Symptoms Detected"
            if is_emergency
            else None
        ),
        "reasons": emergency_reasons,
        "urgent_action": (
            "Do NOT rely on this experimental prediction tool. Seek immediate emergency medical care at the "
            "nearest Community Health Centre (CHC), District Hospital, or call Emergency Helpline 108 / 104 immediately."
            if is_emergency
            else None
        ),
    }

    # Explainability: compare active symptoms with training class profile
    class_profiles = bundle.get("class_profiles", {})
    pred_profile = class_profiles.get(predicted_disease, {})
    profile_top_feats = {
        item["feature"]: item["prevalence"]
        for item in pred_profile.get("top_associated_features", [])
    }
    matched_class_features = [
        {
            "feature": feat,
            "class_prevalence_pct": round(profile_top_feats[feat] * 100.0, 1),
        }
        for feat in (active_symptoms + active_history)
        if feat in profile_top_feats
    ]

    guidance = DISEASE_ACTION_GUIDANCE.get(
        predicted_disease,
        {
            "category": "Weather-Associated Health Condition",
            "next_steps": [
                "Consult a qualified medical practitioner or your nearest Primary Health Centre (PHC) for clinical evaluation.",
            ],
        },
    )

    return {
        "predicted_disease": predicted_disease,
        "disease_category": guidance["category"],
        "model_score": round(top_score, 4),
        "model_score_pct": round(top_score * 100.0, 1),
        "score_interpretation": (
            "Multiclass model probability score derived from statistical patterns in the training dataset "
            "(not a clinical post-test probability or confirmed diagnosis)."
        ),
        "confidence_band": confidence_band,
        "uncertainty_note": uncertainty_note,
        "top_predictions": top_predictions,
        "emergency_warning": emergency_warning,
        "explanation": {
            "inputs_used": {
                "age": int(age),
                "gender_code": gender_val,
                "temperature_c": round(temp_c, 2),
                "humidity_fraction": round(humidity_fraction, 4),
                "humidity_pct": round(humidity_fraction * 100.0, 1),
                "wind_speed_kmh": round(wind_kmh, 2),
                "active_symptoms": active_symptoms,
                "active_medical_history": active_history,
                "total_active_flags": total_binary_active,
            },
            "matched_training_indicators": matched_class_features,
            "class_training_weather_mean": {
                "temperature_c": pred_profile.get("mean_temp_c"),
                "humidity_fraction": pred_profile.get("mean_humidity"),
                "wind_speed_kmh": pred_profile.get("mean_wind_kmh"),
            },
        },
        "recommended_next_steps": guidance["next_steps"],
        "medical_disclaimer": (
            "EXPERIMENTAL DECISION-SUPPORT PROTOTYPE: This output is generated by a statistical machine-learning "
            "classifier trained on `Weather-related disease prediction.csv` and is NOT a confirmed medical diagnosis. "
            "Always consult a qualified doctor, PHC/CHC medical officer, or Mitanin health worker for clinical testing and treatment."
        ),
        "limitations": [
            "Trained on a static 5,200-row tabular dataset (11 classes); does not replace RDT, lab testing, ECG, or physical examination.",
            "Does not predict future community disease outbreaks on its own; block-level epidemiological forecasts are handled separately.",
        ],
        "model_metadata": {
            "model_name": bundle.get("model_name"),
            "model_version": bundle.get("model_version"),
            "trained_at": bundle.get("trained_at"),
            "test_macro_f1": bundle.get("test_metrics", {}).get("macro_f1"),
            "test_accuracy": bundle.get("test_metrics", {}).get("accuracy"),
        },
    }
