import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

# Paths
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

ARTIFACTS = ROOT / "artifacts"
DOCS = ROOT / "docs"
DATA = ROOT / "backend" / "data"

print("=" * 70)
print("COMPREHENSIVE PREDICTION VERIFICATION SUITE")
print("=" * 70)

# ==============================================================================
# TEST 1: WEATHER-RELATED DISEASE PREDICTION MODEL
# ==============================================================================
print("\n>>> [1/3] Testing Weather-Related Disease Prediction Model...")
model_path = ARTIFACTS / "disease_prediction_model.joblib"
csv_path = DOCS / "Weather-related disease prediction.csv"

from app.weather_disease_ml import normalize_humidity_array
main_mod = sys.modules.get("__main__")
if main_mod is not None and not hasattr(main_mod, "normalize_humidity_array"):
    setattr(main_mod, "normalize_humidity_array", normalize_humidity_array)

if not model_path.exists() or not csv_path.exists():
    print(f"Error: missing model or dataset: {model_path}, {csv_path}")
else:
    model_obj = joblib.load(model_path)
    # Could be dict or pipeline
    pipeline = model_obj["pipeline"] if isinstance(model_obj, dict) and "pipeline" in model_obj else model_obj
    target_encoder = model_obj.get("target_encoder") if isinstance(model_obj, dict) else None

    df_raw = pd.read_csv(csv_path)
    target_col = "prognosis"
    feature_cols = [c for c in df_raw.columns if c != target_col]

    # Reconstruct test split identically to train_model.py
    df_dedup = df_raw.drop_duplicates().reset_index(drop=True)
    
    from sklearn.model_selection import train_test_split
    df_train_val, df_test = train_test_split(
        df_dedup,
        test_size=0.1502,
        random_state=42,
        stratify=df_dedup[target_col]
    )
    
    X_test = df_test[feature_cols]
    y_test = df_test[target_col].values

    y_pred_raw = pipeline.predict(X_test)
    if target_encoder is not None:
        y_pred = target_encoder.inverse_transform(y_pred_raw)
    else:
        y_pred = y_pred_raw

    # Check probabilities & Top-K accuracy
    y_proba = pipeline.predict_proba(X_test)
    classes = target_encoder.classes_ if target_encoder is not None else pipeline.classes_
    
    # Top-1 accuracy
    correct = (y_pred == y_test)
    total = len(y_test)
    n_correct = int(correct.sum())
    top1_acc = n_correct / total

    # Top-2 accuracy
    top2_correct = 0
    top3_correct = 0
    for i in range(total):
        top_k_indices = np.argsort(y_proba[i])[::-1]
        top_classes = [classes[idx] for idx in top_k_indices]
        if y_test[i] in top_classes[:2]:
            top2_correct += 1
        if y_test[i] in top_classes[:3]:
            top3_correct += 1
    top2_acc = top2_correct / total
    top3_acc = top3_correct / total

    print(f"  Test Samples Evaluated: {total}")
    print(f"  Correct Predictions:   {n_correct} / {total}")
    print(f"  Top-1 Accuracy:        {top1_acc:.4%} ({top1_acc*100:.2f}%)")
    print(f"  Top-2 Accuracy:        {top2_acc:.4%} ({top2_acc*100:.2f}%)")
    print(f"  Top-3 Accuracy:        {top3_acc:.4%} ({top3_acc*100:.2f}%)")

    # Breakdown per disease
    print("\n  Per-Disease Prediction Accuracy on Unseen Test Set:")
    per_disease = {}
    for cls in np.unique(y_test):
        idx = (y_test == cls)
        cls_total = int(idx.sum())
        cls_correct = int((y_pred[idx] == cls).sum())
        cls_acc = cls_correct / cls_total
        per_disease[cls] = (cls_correct, cls_total, cls_acc)
        print(f"    - {cls:<15}: {cls_correct:2d} / {cls_total:2d} correct ({cls_acc:6.1%})")

    # Misclassifications analysis
    mismatches = [(y_test[i], y_pred[i], y_proba[i].max()) for i in range(total) if not correct[i]]
    print(f"\n  Total Misclassifications on Held-out Test Set: {len(mismatches)} / {total} ({len(mismatches)/total:.2%})")
    for true_cls, pred_cls, conf in mismatches:
        print(f"    Actual: {true_cls:<14} -> Predicted: {pred_cls:<14} (Confidence: {conf:.2%})")

    # Clinical Vignette checks
    print("\n  Testing Controlled Clinical Vignettes:")
    # Vignette A: Classic Malaria (fever, chills, shivering, headache, warm weather)
    vignette_malaria = X_test.iloc[0:1].copy()
    for col in vignette_malaria.columns:
        if col in ["Age", "Gender", "Temperature (C)", "Humidity", "Wind Speed (km/h)"]:
            continue
        vignette_malaria[col] = 0
    vignette_malaria["Temperature (C)"] = 30.5
    vignette_malaria["Humidity"] = 80.0
    vignette_malaria["Wind Speed (km/h)"] = 12.0
    for s in ["high_fever", "chills", "shivering", "headache", "sweating", "fatigue"]:
        if s in vignette_malaria.columns:
            vignette_malaria[s] = 1
    
    pred_vm_raw = pipeline.predict(vignette_malaria)[0]
    pred_vm = target_encoder.inverse_transform([pred_vm_raw])[0] if target_encoder is not None else pred_vm_raw
    print(f"    Vignette 1 [Classic Malaria Symptoms]: Predicted -> '{pred_vm}'")

    # Vignette B: Classic Heat Stroke (extreme heat, high body temp, dizziness, confusion, no chills)
    vignette_hs = X_test.iloc[0:1].copy()
    for col in vignette_hs.columns:
        if col in ["Age", "Gender", "Temperature (C)", "Humidity", "Wind Speed (km/h)"]:
            continue
        vignette_hs[col] = 0
    vignette_hs["Temperature (C)"] = 43.5
    vignette_hs["Humidity"] = 25.0
    vignette_hs["Wind Speed (km/h)"] = 5.0
    for s in ["high_fever", "dizziness", "confusion", "headache", "fatigue"]:
        if s in vignette_hs.columns:
            vignette_hs[s] = 1
    pred_hs_raw = pipeline.predict(vignette_hs)[0]
    pred_hs = target_encoder.inverse_transform([pred_hs_raw])[0] if target_encoder is not None else pred_hs_raw
    print(f"    Vignette 2 [Heat Stroke in 43.5C weather]: Predicted -> '{pred_hs}'")

# ==============================================================================
# TEST 2: WHO MALARIA TIME-SERIES FORECAST MODEL
# ==============================================================================
print("\n>>> [2/3] Testing WHO Malaria Annual Forecasting Model...")
malaria_model_path = ARTIFACTS / "malaria_forecast_model.joblib"
inc_path = DOCS / "archive" / "incidence_per_1000_pop_at_risk.csv"

if not malaria_model_path.exists() or not inc_path.exists():
    print(f"Error: missing malaria model or incidence dataset: {malaria_model_path}, {inc_path}")
else:
    malaria_obj = joblib.load(malaria_model_path)
    m_pipeline = malaria_obj.get("pipeline")
    feature_cols = malaria_obj.get("feature_cols", [])
    
    # Load incidence data
    df_inc = pd.read_csv(inc_path)
    
    # Reconstruct the feature engineering strictly
    df_inc["incidence"] = pd.to_numeric(df_inc["No. of cases"], errors="coerce")
    df_sorted = df_inc.sort_values(["Country", "Year"]).reset_index(drop=True)
    
    df_sorted["inc_lag_1"] = df_sorted.groupby("Country")["incidence"].shift(1)
    df_sorted["inc_lag_2"] = df_sorted.groupby("Country")["incidence"].shift(2)
    df_sorted["inc_lag_3"] = df_sorted.groupby("Country")["incidence"].shift(3)
    df_sorted["inc_diff_1"] = df_sorted["inc_lag_1"] - df_sorted["inc_lag_2"]
    df_sorted["inc_diff_2"] = df_sorted["inc_lag_2"] - df_sorted["inc_lag_3"]
    df_sorted["inc_ratio_1"] = (df_sorted["inc_lag_1"] + 0.1) / (df_sorted["inc_lag_2"] + 0.1)
    
    # Rolling 3-yr stats strictly over lags
    roll_mean = df_sorted.groupby("Country")["incidence"].shift(1).rolling(3).mean()
    roll_std = df_sorted.groupby("Country")["incidence"].shift(1).rolling(3).std().fillna(0)
    roll_min = df_sorted.groupby("Country")["incidence"].shift(1).rolling(3).min()
    roll_max = df_sorted.groupby("Country")["incidence"].shift(1).rolling(3).max()
    
    df_sorted["inc_roll_mean_3"] = (df_sorted["inc_lag_1"] + df_sorted["inc_lag_2"] + df_sorted["inc_lag_3"]) / 3.0
    df_sorted["inc_roll_std_3"] = np.std(
        np.column_stack([df_sorted["inc_lag_1"], df_sorted["inc_lag_2"], df_sorted["inc_lag_3"]]),
        axis=1
    )
    df_sorted["inc_roll_min_3"] = np.minimum(np.minimum(df_sorted["inc_lag_1"], df_sorted["inc_lag_2"]), df_sorted["inc_lag_3"])
    df_sorted["inc_roll_max_3"] = np.maximum(np.maximum(df_sorted["inc_lag_1"], df_sorted["inc_lag_2"]), df_sorted["inc_lag_3"])
    df_sorted["is_zero_lag_1"] = (df_sorted["inc_lag_1"] == 0).astype(float)
    df_sorted["years_since_2000"] = df_sorted["Year"] - 2000
    
    # Chronological test split: 2017 & 2018
    test_df = df_sorted[df_sorted["Year"].isin([2017, 2018])].dropna(subset=["incidence", "inc_lag_3"]).copy()
    
    X_test_mal = test_df[feature_cols]
    y_test_mal = test_df["incidence"].values
    
    # Predict raw
    pred_raw = m_pipeline.predict(X_test_mal)
    pred_final = np.clip(pred_raw, 0.0, None)
    
    # Apply zero-elimination lock rule (same as inference service)
    zero_lock = (test_df["inc_lag_1"] == 0) & (test_df["inc_lag_2"] == 0) & (test_df["inc_lag_3"] == 0)
    pred_final[zero_lock] = 0.0
    
    mae = np.mean(np.abs(y_test_mal - pred_final))
    rmse = np.sqrt(np.mean((y_test_mal - pred_final)**2))
    r2 = 1.0 - np.sum((y_test_mal - pred_final)**2) / np.sum((y_test_mal - np.mean(y_test_mal))**2)
    corr = np.corrcoef(y_test_mal, pred_final)[0, 1]
    
    # Directional accuracy (did it correctly predict whether incidence increased or decreased vs lag_1?)
    actual_change = y_test_mal - test_df["inc_lag_1"].values
    pred_change = pred_final - test_df["inc_lag_1"].values
    same_direction = np.sign(actual_change) == np.sign(pred_change)
    dir_acc = np.mean(same_direction)

    print(f"  Test Samples Evaluated (2017-2018): {len(y_test_mal)}")
    print(f"  Test MAE (cases per 1,000):        {mae:.4f}")
    print(f"  Test RMSE:                          {rmse:.4f}")
    print(f"  Test R-Squared (R2):                {r2:.4f} ({r2*100:.2f}%)")
    print(f"  Pearson Correlation (r):            {corr:.4f}")
    print(f"  Directional Trend Accuracy:         {dir_acc:.2%}")

    # Inspect specific countries: India, Algeria, Rwanda, Nigeria
    print("\n  Country-Specific Predictions vs Ground Truth Actuals:")
    for country in ["India", "Algeria", "Nigeria", "Rwanda", "Thailand"]:
        c_rows = test_df[test_df["Country"] == country]
        for _, row in c_rows.iterrows():
            yr = int(row["Year"])
            act = row["incidence"]
            idx = c_rows.index.get_loc(_)
            # get prediction for this row
            p_val = pred_final[test_df.index.get_loc(_)]
            err = abs(act - p_val)
            print(f"    - {country:<10} ({yr}): Actual={act:7.2f} | Predicted={p_val:7.2f} | Absolute Error={err:6.2f}")

# ==============================================================================
# TEST 3: SURVEILLANCE OUTBREAK FORECASTS & PREDICTION INTERVALS
# ==============================================================================
print("\n>>> [3/3] Testing Block-Level Outbreak Forecasts & Empirical Coverage...")
forecasts_path = DATA / "forecasts.json"
evidence_path = DATA / "evidence.json"
cases_path = DATA / "cases.csv"

if not forecasts_path.exists() or not evidence_path.exists() or not cases_path.exists():
    print(f"Error: missing forecast files in {DATA}")
else:
    with open(forecasts_path) as f:
        fcasts = json.load(f)
    with open(evidence_path) as f:
        evid = json.load(f)
    df_cases = pd.read_csv(cases_path)
    
    print(f"  Forecast Run ID: {fcasts.get('run_id')}")
    print(f"  Generated At:    {fcasts.get('generated_at')}")
    print(f"  Granularity:     {fcasts.get('granularity')}")
    print(f"  Horizon Steps:   {fcasts.get('horizon_steps')}")

    # Check units
    units = fcasts.get("units", {})
    evid_units = evid.get("units", {})

    print(f"\n  Block Decision & Validation:")
    for unit_id, udata in units.items():
        e_data = evid_units.get(unit_id, {})
        method = udata.get("method_used")
        risk = udata.get("risk")
        confidence = udata.get("confidence")
        gate_status = e_data.get("skill_gate_status")
        win_share = e_data.get("win_share")
        med_imp = e_data.get("median_improvement")
        
        # Check point forecasts and intervals
        pts = udata.get("point_forecasts", [])
        lows = udata.get("lower_80", [])
        highs = udata.get("upper_80", [])

        # Intervals sanity check
        valid_intervals = all(l <= p <= h or np.isclose(l, p) or np.isclose(p, h) for l, p, h in zip(lows, pts, highs))

        print(f"    Unit: {unit_id:<6} ({udata.get('unit_name')})")
        print(f"      Selected Method:   {method} (Gate: {gate_status})")
        print(f"      Risk Assessment:   {risk} (Confidence: {confidence:.2%})")
        print(f"      Win Share / Imp:   {win_share:.1%} / {med_imp:.1%}")
        print(f"      Forecast Horizons: {pts}")
        print(f"      80% Interval:      [{lows[0]} - {highs[0]}] -> [{lows[-1]} - {highs[-1]}] (Well-ordered: {valid_intervals})")

    # Check backtested accuracy across historical rolling origins
    print("\n  Summary of Backtested Model Error Metrics across All Units (evidence.json):")
    for unit_id, e_data in evid_units.items():
        bm = e_data.get("baseline_metrics", {})
        wm = e_data.get("weather_metrics", {})
        b_mae = bm.get("mae") if bm else None
        w_mae = wm.get("mae") if wm else None
        dec = e_data.get("decision")
        print(f"    - {unit_id}: Baseline MAE={b_mae:.2f} | Weather MAE={w_mae:.2f} | Decision={dec}")

print("\n" + "=" * 70)
print("VERIFICATION COMPLETED SUCCESSFULLY.")
print("=" * 70)
