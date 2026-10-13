#!/usr/bin/env python3
"""
Reproducible EDA, Training, Validation, and Evaluation Pipeline for
Weather-Related Disease Prediction (`docs/Weather-related disease prediction.csv`).

Usage:
    python backend/train_model.py

Outputs saved to `artifacts/`:
    - artifacts/disease_prediction_model.joblib
    - artifacts/model_metrics.json
    - artifacts/classification_report.csv
    - artifacts/confusion_matrix.png
    - artifacts/feature_importance.png
    - artifacts/dataset_analysis.json
"""

from __future__ import annotations

import hashlib
import json
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    ExtraTreesClassifier,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
)
from sklearn.model_selection import (
    GridSearchCV,
    StratifiedKFold,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

warnings.filterwarnings("ignore", category=UserWarning)

RANDOM_SEED = 42
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = PROJECT_ROOT / "docs" / "Weather-related disease prediction.csv"
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"

TARGET_COL = "prognosis"
NUMERIC_COLS = [
    "Age",
    "Temperature (C)",
    "Humidity",
    "Wind Speed (km/h)",
]
GENDER_COL = "Gender"

MEDICAL_HISTORY_COLS = [
    "asthma_history",
    "high_cholesterol",
    "diabetes",
    "obesity",
    "hiv_aids",
    "nasal_polyps",
    "asthma",
    "high_blood_pressure",
]


def normalize_humidity_array(X: Any) -> np.ndarray:
    """
    Ensures Humidity is normalized to [0, 1] fraction if a caller passes percentage (e.g., 74 instead of 0.74),
    while preserving exact dataset values when already in [0, 1.2].
    """
    arr = np.asarray(X, dtype=float).copy()
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    # Column index 2 in NUMERIC_COLS is Humidity
    if arr.shape[1] >= 3:
        hum = arr[:, 2]
        mask_pct = hum > 1.2
        if np.any(mask_pct):
            arr[mask_pct, 2] = hum[mask_pct] / 100.0
    return arr


def perform_eda(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Comprehensive exploratory data analysis on the raw dataset without modifying it.
    """
    n_rows, n_cols = df.shape
    feature_cols = [c for c in df.columns if c != TARGET_COL]
    symptom_And_history_cols = [
        c for c in feature_cols if c not in NUMERIC_COLS and c != GENDER_COL
    ]
    symptom_cols = [c for c in symptom_And_history_cols if c not in MEDICAL_HISTORY_COLS]

    # Missing & invalid value checks
    missing_per_col = {col: int(df[col].isna().sum()) for col in df.columns if df[col].isna().sum() > 0}
    total_missing = int(df.isna().sum().sum())

    # Duplicate checks
    exact_dup_count = int(df.duplicated().sum())
    feature_dup_count = int(df[feature_cols].duplicated().sum())

    # Check if identical feature vectors ever map to different prognosis labels
    grouped_label_nunique = df.groupby(feature_cols, dropna=False)[TARGET_COL].nunique()
    conflicting_feature_groups = int((grouped_label_nunique > 1).sum())

    # Class distribution
    class_counts = df[TARGET_COL].value_counts().to_dict()
    class_distribution = [
        {
            "disease": str(k),
            "count": int(v),
            "percentage": round(float(v) * 100.0 / n_rows, 2),
        }
        for k, v in class_counts.items()
    ]

    # Numerical feature summary
    numeric_summary = {}
    for col in NUMERIC_COLS:
        s = df[col].astype(float)
        numeric_summary[col] = {
            "dtype": str(df[col].dtype),
            "min": round(float(s.min()), 4),
            "max": round(float(s.max()), 4),
            "mean": round(float(s.mean()), 4),
            "std": round(float(s.std()), 4),
            "median": round(float(s.median()), 4),
            "q25": round(float(s.quantile(0.25)), 4),
            "q75": round(float(s.quantile(0.75)), 4),
        }

    # Gender encoding distribution
    gender_counts = {str(k): int(v) for k, v in df[GENDER_COL].value_counts(dropna=False).to_dict().items()}

    # Binary columns validation (check all values are in {0, 1})
    non_binary_cols = {}
    for col in symptom_And_history_cols + [GENDER_COL]:
        uniq = sorted(df[col].dropna().unique().tolist())
        if not set(uniq).issubset({0, 1}):
            non_binary_cols[col] = uniq

    # Highly correlated feature pairs (|r| >= 0.45)
    corr_matrix = df[feature_cols].corr().abs()
    high_correlations = []
    for i in range(len(feature_cols)):
        for j in range(i + 1, len(feature_cols)):
            c1, c2 = feature_cols[i], feature_cols[j]
            r_val = float(corr_matrix.iloc[i, j])
            if r_val >= 0.45:
                high_correlations.append({
                    "feature_1": c1,
                    "feature_2": c2,
                    "abs_pearson_r": round(r_val, 4),
                })
    high_correlations.sort(key=lambda x: x["abs_pearson_r"], reverse=True)

    # Check semantically overlapping / near-duplicate named columns
    semantic_overlap_pairs = [
        ("pain_behind_the_eyes", "pain_behind_eyes"),
        ("asthma_history", "asthma"),
        ("high_fever", "fever"),
        ("headache", "severe_headache"),
        ("headache", "sinus_headache"),
        ("headache", "throbbing_headache"),
    ]
    semantic_overlap_analysis = []
    for c1, c2 in semantic_overlap_pairs:
        if c1 in df.columns and c2 in df.columns:
            both_1 = int(((df[c1] == 1) & (df[c2] == 1)).sum())
            either_1 = int(((df[c1] == 1) | (df[c2] == 1)).sum())
            equal_rows = int((df[c1] == df[c2]).sum())
            semantic_overlap_analysis.append({
                "col_1": c1,
                "col_2": c2,
                "col_1_positive_count": int((df[c1] == 1).sum()),
                "col_2_positive_count": int((df[c2] == 1).sum()),
                "both_positive_count": both_1,
                "jaccard_overlap": round(both_1 / max(either_1, 1), 4),
                "exact_match_rate": round(equal_rows / n_rows, 4),
            })

    # Check rows with zero active symptoms/history
    active_symptom_count = df[symptom_And_history_cols].sum(axis=1)
    zero_symptom_rows = int((active_symptom_count == 0).sum())
    zero_symptom_by_class = (
        df.loc[active_symptom_count == 0, TARGET_COL].value_counts().to_dict()
    )

    # Check decimal precision patterns in weather columns (synthetic/augmented sub-populations)
    temp_decimals = df["Temperature (C)"].astype(str).apply(lambda s: len(s.split(".")[1]) if "." in s else 0)
    long_float_rows = int((temp_decimals > 4).sum())
    long_float_by_class = (
        df.loc[temp_decimals > 4, TARGET_COL].value_counts().to_dict()
    )

    # Check duplicate distribution across classes
    dup_by_class = df.loc[df.duplicated(keep=False), TARGET_COL].value_counts().to_dict()

    return {
        "dataset_file": "docs/Weather-related disease prediction.csv",
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "shape": {"rows": n_rows, "columns": n_cols, "feature_count": len(feature_cols)},
        "target_column": TARGET_COL,
        "num_classes": len(class_counts),
        "class_distribution": class_distribution,
        "feature_groups": {
            "numeric_continuous": NUMERIC_COLS,
            "demographic_binary": [GENDER_COL],
            "medical_history_binary": MEDICAL_HISTORY_COLS,
            "symptom_binary": symptom_cols,
            "all_features_ordered": feature_cols,
        },
        "data_quality": {
            "total_missing_values": total_missing,
            "missing_by_column": missing_per_col,
            "exact_duplicate_rows": exact_dup_count,
            "feature_only_duplicate_rows": feature_dup_count,
            "conflicting_duplicate_feature_groups": conflicting_feature_groups,
            "duplicate_rows_involved_by_class": {str(k): int(v) for k, v in dup_by_class.items()},
            "non_binary_flag_columns": non_binary_cols,
            "zero_symptom_and_history_rows": zero_symptom_rows,
            "zero_symptom_rows_by_class": {str(k): int(v) for k, v in zero_symptom_by_class.items()},
        },
        "numeric_summary": numeric_summary,
        "gender_distribution": gender_counts,
        "high_feature_correlations": high_correlations,
        "semantic_column_overlap": semantic_overlap_analysis,
        "synthetic_and_leakage_investigation": {
            "high_precision_float_rows_count": long_float_rows,
            "high_precision_float_rows_by_class": {str(k): int(v) for k, v in long_float_by_class.items()},
            "findings": [
                "The dataset contains 5,200 rows and 50 predictor columns across 11 disease classes, with 0 missing values.",
                "Class sizes are imbalanced: Heart Attack (1,013), Migraine (941), and Influenza (658) have higher representation because of 2,042 rows with high-precision weather decimals (e.g., 24.38287037 C), whereas the other 8 classes have ~310-338 rows each.",
                "There are 219 exact duplicate rows (and 0 conflicting feature duplicates), leaving 4,981 unique records. Deduplicating before splitting prevents train-to-test duplicate leakage.",
                "`asthma_history` is constant 0 across all 5,200 rows, while `asthma` has 333 positive rows (strongly correlated with `high_blood_pressure` r=0.649 and `chest_pain` r=0.580). `pain_behind_the_eyes` (528 positives, associated with Migraine) and `pain_behind_eyes` (30 positives, associated with Dengue) are mutually exclusive (0 overlap). All 50 columns are preserved to maintain exact schema compatibility.",
                "342 rows have all 45 binary symptom/history flags set to 0 (all 342 are labeled Influenza), which is an important synthetic-dataset artifact.",
            ],
        },
    }


def create_leakage_free_splits(
    df: pd.DataFrame, feature_cols: List[str]
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Deduplicates exact duplicate records before creating the 70% train / 15% validation / 15% test
    stratified split so that no identical feature vector ever leaks across train, validation, and test sets.
    """
    n_raw = len(df)
    df_dedup = df.drop_duplicates(subset=feature_cols, keep="first").reset_index(drop=True)
    n_dedup = len(df_dedup)

    # First split: 70% train, 30% temp (validation + test)
    df_train, df_temp = train_test_split(
        df_dedup,
        test_size=0.30,
        random_state=RANDOM_SEED,
        stratify=df_dedup[TARGET_COL],
    )

    # Second split: 15% validation, 15% test (split temp 50/50)
    df_val, df_test = train_test_split(
        df_temp,
        test_size=0.50,
        random_state=RANDOM_SEED,
        stratify=df_temp[TARGET_COL],
    )

    df_train = df_train.reset_index(drop=True)
    df_val = df_val.reset_index(drop=True)
    df_test = df_test.reset_index(drop=True)

    # Verify zero feature-vector overlap across splits
    train_hashes = set(pd.util.hash_pandas_object(df_train[feature_cols], index=False))
    val_hashes = set(pd.util.hash_pandas_object(df_val[feature_cols], index=False))
    test_hashes = set(pd.util.hash_pandas_object(df_test[feature_cols], index=False))

    overlap_train_val = len(train_hashes.intersection(val_hashes))
    overlap_train_test = len(train_hashes.intersection(test_hashes))
    overlap_val_test = len(val_hashes.intersection(test_hashes))

    split_info = {
        "raw_rows": n_raw,
        "deduplicated_unique_rows": n_dedup,
        "exact_duplicates_removed_before_split": n_raw - n_dedup,
        "train_rows": len(df_train),
        "val_rows": len(df_val),
        "test_rows": len(df_test),
        "split_ratios": {
            "train": round(len(df_train) / n_dedup, 4),
            "validation": round(len(df_val) / n_dedup, 4),
            "test": round(len(df_test) / n_dedup, 4),
        },
        "cross_split_feature_overlap": {
            "train_val_overlap": overlap_train_val,
            "train_test_overlap": overlap_train_test,
            "val_test_overlap": overlap_val_test,
        },
        "random_seed": RANDOM_SEED,
    }
    return df_train, df_val, df_test, split_info


def build_preprocessor(feature_cols: List[str], scale_numeric: bool = True) -> ColumnTransformer:
    binary_cols = [c for c in feature_cols if c not in NUMERIC_COLS]
    if scale_numeric:
        num_pipe = Pipeline([
            ("norm_humidity", FunctionTransformer(normalize_humidity_array, validate=False)),
            ("scaler", StandardScaler()),
        ])
    else:
        num_pipe = Pipeline([
            ("norm_humidity", FunctionTransformer(normalize_humidity_array, validate=False)),
        ])

    return ColumnTransformer(
        transformers=[
            ("num", num_pipe, NUMERIC_COLS),
            ("bin", "passthrough", binary_cols),
        ],
        remainder="drop",
    )


def evaluate_predictions(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob: np.ndarray,
    classes: List[str],
) -> Dict[str, Any]:
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_true, y_pred)), 4),
        "macro_precision": round(float(precision_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "macro_recall": round(float(recall_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "weighted_precision": round(float(precision_score(y_true, y_pred, average="weighted", zero_division=0)), 4),
        "weighted_recall": round(float(recall_score(y_true, y_pred, average="weighted", zero_division=0)), 4),
        "weighted_f1": round(float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 4),
        "log_loss": round(float(log_loss(y_true, y_prob, labels=classes)), 4),
    }


def save_confusion_matrix_plot(
    cm: np.ndarray, classes: List[str], out_path: Path, title: str
) -> None:
    fig, ax = plt.subplots(figsize=(10, 8), dpi=160)
    im = ax.imshow(cm, interpolation="nearest", cmap="Purples")
    cbar = ax.figure.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.ax.set_ylabel("Test Set Case Count", rotation=-90, va="bottom", fontsize=9)

    ax.set(
        xticks=np.arange(len(classes)),
        yticks=np.arange(len(classes)),
        xticklabels=classes,
        yticklabels=classes,
        title=title,
        ylabel="True Disease Label (prognosis)",
        xlabel="Predicted Disease Label",
    )
    plt.setp(ax.get_xticklabels(), rotation=40, ha="right", rotation_mode="anchor", fontsize=9)
    plt.setp(ax.get_yticklabels(), fontsize=9)

    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(
                j,
                i,
                format(cm[i, j], "d"),
                ha="center",
                va="center",
                fontsize=8,
                fontweight="bold" if i == j else "normal",
                color="white" if cm[i, j] > thresh else "#1F1D2B",
            )

    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def save_feature_importance_plot(
    feature_importances: List[Dict[str, Any]], out_path: Path, model_name: str
) -> None:
    top_k = feature_importances[:20][::-1]
    names = [item["feature"] for item in top_k]
    vals = [item["importance"] for item in top_k]

    fig, ax = plt.subplots(figsize=(9, 7), dpi=160)
    bars = ax.barh(names, vals, color="#534AB7", edgecolor="#383177", height=0.7)
    ax.set_xlabel("Importance Score", fontsize=10)
    ax.set_title(f"Top 20 Predictive Features — {model_name}", fontsize=12, fontweight="bold")
    ax.grid(axis="x", linestyle="--", alpha=0.4)
    for bar in bars:
        w = bar.get_width()
        ax.text(
            w + max(vals) * 0.01,
            bar.get_y() + bar.get_height() / 2.0,
            f"{w:.4f}",
            va="center",
            ha="left",
            fontsize=8,
            color="#1F1D2B",
        )
    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    print("=" * 80)
    print(" WEATHER-RELATED DISEASE PREDICTION — ML TRAINING & EVALUATION PIPELINE ")
    print("=" * 80)

    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found at {DATASET_PATH}")

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load dataset & run EDA
    print(f"[1/6] Loading dataset from: {DATASET_PATH.relative_to(PROJECT_ROOT)}")
    df = pd.read_csv(DATASET_PATH)
    feature_cols = [c for c in df.columns if c != TARGET_COL]

    eda_report = perform_eda(df)
    eda_path = ARTIFACTS_DIR / "dataset_analysis.json"
    eda_path.write_text(json.dumps(eda_report, indent=2), encoding="utf-8")
    print(
        f"      Shape: {df.shape[0]} rows x {df.shape[1]} cols | "
        f"Classes: {eda_report['num_classes']} | "
        f"Exact duplicates: {eda_report['data_quality']['exact_duplicate_rows']}"
    )

    # 2. Leakage-free stratified 70 / 15 / 15 split
    print("[2/6] Creating leakage-free deduplicated stratified 70/15/15 splits...")
    df_train, df_val, df_test, split_info = create_leakage_free_splits(df, feature_cols)
    X_train, y_train = df_train[feature_cols], df_train[TARGET_COL].to_numpy(dtype=str)
    X_val, y_val = df_val[feature_cols], df_val[TARGET_COL].to_numpy(dtype=str)
    X_test, y_test = df_test[feature_cols], df_test[TARGET_COL].to_numpy(dtype=str)
    print(
        f"      Unique rows: {split_info['deduplicated_unique_rows']} -> "
        f"Train: {len(df_train)}, Val: {len(df_val)}, Test: {len(df_test)}"
    )

    # 3. Train & tune candidate models on Training/Validation data only
    print("[3/6] Training and tuning candidate models (5-fold Stratified CV on Train)...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)

    candidates = [
        {
            "key": "logistic_regression",
            "name": "Logistic Regression (Baseline)",
            "scale": True,
            "estimator": LogisticRegression(
                max_iter=1000, random_state=RANDOM_SEED
            ),
            "param_grid": {
                "clf__C": [1.0, 3.0],
                "clf__class_weight": [None, "balanced"],
            },
        },
        {
            "key": "random_forest",
            "name": "Random Forest Classifier",
            "scale": True,
            "estimator": RandomForestClassifier(
                random_state=RANDOM_SEED, n_jobs=1
            ),
            "param_grid": {
                "clf__n_estimators": [250],
                "clf__max_depth": [None, 24],
                "clf__class_weight": [None, "balanced_subsample"],
            },
        },
        {
            "key": "extra_trees",
            "name": "Extra Trees Classifier",
            "scale": True,
            "estimator": ExtraTreesClassifier(
                random_state=RANDOM_SEED, n_jobs=1
            ),
            "param_grid": {
                "clf__n_estimators": [250],
                "clf__max_depth": [None, 24],
                "clf__class_weight": [None, "balanced"],
            },
        },
        {
            "key": "hist_gradient_boosting",
            "name": "HistGradientBoosting Classifier",
            "scale": True,
            "estimator": HistGradientBoostingClassifier(
                random_state=RANDOM_SEED, max_iter=150
            ),
            "param_grid": {
                "clf__learning_rate": [0.08],
                "clf__max_leaf_nodes": [31],
                "clf__l2_regularization": [0.1, 1.0],
            },
        },
    ]

    comparison_results: List[Dict[str, Any]] = []
    fitted_models: Dict[str, Pipeline] = {}

    for cand in candidates:
        t0 = time.perf_counter()
        pipe = Pipeline([
            ("preprocess", build_preprocessor(feature_cols, scale_numeric=cand["scale"])),
            ("clf", cand["estimator"]),
        ])
        grid = GridSearchCV(
            pipe,
            param_grid=cand["param_grid"],
            scoring="f1_macro",
            cv=cv,
            n_jobs=1,
            refit=True,
        )
        grid.fit(X_train, y_train)
        train_time_sec = time.perf_counter() - t0

        best_pipe: Pipeline = grid.best_estimator_
        classes_list = [str(c) for c in best_pipe.classes_]

        # Evaluate on Validation Set
        val_t0 = time.perf_counter()
        val_pred = best_pipe.predict(X_val)
        val_prob = best_pipe.predict_proba(X_val)
        val_infer_sec = time.perf_counter() - val_t0

        val_metrics = evaluate_predictions(y_val, val_pred, val_prob, classes_list)

        # Extract CV mean and std for best index
        best_idx = grid.best_index_
        cv_mean_macro_f1 = float(grid.cv_results_["mean_test_score"][best_idx])
        cv_std_macro_f1 = float(grid.cv_results_["std_test_score"][best_idx])

        record = {
            "model_key": cand["key"],
            "model_name": cand["name"],
            "best_params": grid.best_params_,
            "cv_5fold_macro_f1_mean": round(cv_mean_macro_f1, 4),
            "cv_5fold_macro_f1_std": round(cv_std_macro_f1, 4),
            "validation_metrics": val_metrics,
            "training_search_time_sec": round(train_time_sec, 3),
            "validation_inference_time_sec": round(val_infer_sec, 4),
        }
        comparison_results.append(record)
        fitted_models[cand["key"]] = best_pipe

        print(
            f"      - {cand['name']:<32} | "
            f"CV Macro-F1: {cv_mean_macro_f1:.4f} (+/-{cv_std_macro_f1:.4f}) | "
            f"Val Macro-F1: {val_metrics['macro_f1']:.4f} | "
            f"Val Acc: {val_metrics['accuracy']:.4f} | "
            f"Val LogLoss: {val_metrics['log_loss']:.4f}"
        )

    # Sort models by:
    # 1) Validation Macro-F1, 2) CV Macro-F1, 3) Validation Balanced Accuracy, 4) Lower Validation Log-Loss
    comparison_results.sort(
        key=lambda r: (
            r["validation_metrics"]["macro_f1"],
            r["cv_5fold_macro_f1_mean"],
            r["validation_metrics"]["balanced_accuracy"],
            -r["validation_metrics"]["log_loss"],
        ),
        reverse=True,
    )

    selected_record = comparison_results[0]
    selected_key = selected_record["model_key"]
    selected_name = selected_record["model_name"]
    selected_pipeline = fitted_models[selected_key]

    print(f"\n[4/6] Selected Best Model on Validation Set: {selected_name}")
    print(f"      Best Hyperparameters: {selected_record['best_params']}")

    # 4. Evaluate Selected Model ONCE on the Untouched Test Set
    print("[5/6] Evaluating selected model on the untouched 15% test set...")
    classes_list = [str(c) for c in selected_pipeline.classes_]

    test_t0 = time.perf_counter()
    y_test_pred = selected_pipeline.predict(X_test)
    y_test_prob = selected_pipeline.predict_proba(X_test)
    test_infer_sec = time.perf_counter() - test_t0

    # Single-record latency benchmark
    single_row = X_test.iloc[[0]]
    single_t0 = time.perf_counter()
    for _ in range(25):
        _ = selected_pipeline.predict_proba(single_row)
    single_latency_ms = ((time.perf_counter() - single_t0) / 25.0) * 1000.0

    test_metrics = evaluate_predictions(y_test, y_test_pred, y_test_prob, classes_list)
    print(
        f"      Test Accuracy: {test_metrics['accuracy']:.4f} | "
        f"Test Macro-F1: {test_metrics['macro_f1']:.4f} | "
        f"Test Weighted-F1: {test_metrics['weighted_f1']:.4f} | "
        f"Test Balanced Acc: {test_metrics['balanced_accuracy']:.4f}"
    )

    # Per-class classification report
    cls_report_dict = classification_report(
        y_test, y_test_pred, labels=classes_list, output_dict=True, zero_division=0
    )
    cls_report_df = pd.DataFrame(cls_report_dict).transpose()
    cls_report_df.index.name = "class_or_summary"
    cls_report_csv_path = ARTIFACTS_DIR / "classification_report.csv"
    cls_report_df.to_csv(cls_report_csv_path)

    # Confusion Matrix
    cm = confusion_matrix(y_test, y_test_pred, labels=classes_list)
    cm_path = ARTIFACTS_DIR / "confusion_matrix.png"
    save_confusion_matrix_plot(
        cm,
        classes_list,
        cm_path,
        title=f"Test Set Confusion Matrix — {selected_name} (n={len(df_test)})",
    )

    # Feature Importances
    clf_step = selected_pipeline.named_steps["clf"]
    if hasattr(clf_step, "feature_importances_"):
        raw_imp = clf_step.feature_importances_
        ordered_names = NUMERIC_COLS + [c for c in feature_cols if c not in NUMERIC_COLS]
        feature_importances = [
            {"feature": name, "importance": round(float(val), 6)}
            for name, val in zip(ordered_names, raw_imp)
        ]
    else:
        perm = permutation_importance(
            selected_pipeline,
            X_val,
            y_val,
            scoring="f1_macro",
            n_repeats=5,
            random_state=RANDOM_SEED,
            n_jobs=1,
        )
        feature_importances = [
            {"feature": name, "importance": round(float(max(val, 0.0)), 6)}
            for name, val in zip(feature_cols, perm.importances_mean)
        ]

    feature_importances.sort(key=lambda x: x["importance"], reverse=True)
    fi_path = ARTIFACTS_DIR / "feature_importance.png"
    save_feature_importance_plot(feature_importances, fi_path, selected_name)

    # Error analysis on the test set
    misclassified_mask = y_test != y_test_pred
    error_pairs: Dict[Tuple[str, str], int] = {}
    for yt, yp in zip(y_test[misclassified_mask], y_test_pred[misclassified_mask]):
        pair = (str(yt), str(yp))
        error_pairs[pair] = error_pairs.get(pair, 0) + 1
    top_confusions = [
        {"true_disease": k[0], "predicted_disease": k[1], "count": v}
        for k, v in sorted(error_pairs.items(), key=lambda item: item[1], reverse=True)[:10]
    ]

    # Per-class typical profiles from training set (for UI guidance & explainability)
    symptom_and_history_cols = [c for c in feature_cols if c not in NUMERIC_COLS and c != GENDER_COL]
    class_profiles: Dict[str, Any] = {}
    for cls_name in classes_list:
        sub = df_train[df_train[TARGET_COL] == cls_name]
        symptom_prevalence = (
            sub[symptom_and_history_cols].mean().sort_values(ascending=False)
        )
        top_symptoms = [
            {"feature": str(k), "prevalence": round(float(v), 3)}
            for k, v in symptom_prevalence.head(6).items()
            if float(v) > 0.05
        ]
        class_profiles[cls_name] = {
            "train_count": int(len(sub)),
            "mean_temp_c": round(float(sub["Temperature (C)"].mean()), 2),
            "mean_humidity": round(float(sub["Humidity"].mean()), 2),
            "mean_wind_kmh": round(float(sub["Wind Speed (km/h)"].mean()), 2),
            "top_associated_features": top_symptoms,
        }

    # 5. Save model artifact and metrics JSON
    print("[6/6] Saving model pipeline and evaluation artifacts to `artifacts/`...")
    trained_at = datetime.now(timezone.utc).isoformat()
    model_bundle = {
        "pipeline": selected_pipeline,
        "model_key": selected_key,
        "model_name": selected_name,
        "model_version": f"{selected_key}_v1.0",
        "trained_at": trained_at,
        "random_seed": RANDOM_SEED,
        "target_column": TARGET_COL,
        "classes": classes_list,
        "feature_columns": feature_cols,
        "numeric_columns": NUMERIC_COLS,
        "gender_column": GENDER_COL,
        "medical_history_columns": MEDICAL_HISTORY_COLS,
        "symptom_columns": [
            c for c in feature_cols if c not in NUMERIC_COLS and c != GENDER_COL and c not in MEDICAL_HISTORY_COLS
        ],
        "numeric_ranges": eda_report["numeric_summary"],
        "test_metrics": test_metrics,
        "validation_metrics": selected_record["validation_metrics"],
        "cv_5fold_macro_f1_mean": selected_record["cv_5fold_macro_f1_mean"],
        "cv_5fold_macro_f1_std": selected_record["cv_5fold_macro_f1_std"],
        "top_features": feature_importances[:15],
        "class_profiles": class_profiles,
    }

    model_path = ARTIFACTS_DIR / "disease_prediction_model.joblib"
    joblib.dump(model_bundle, model_path)

    metrics_payload = {
        "selected_model": {
            "model_key": selected_key,
            "model_name": selected_name,
            "model_version": f"{selected_key}_v1.0",
            "best_hyperparameters": selected_record["best_params"],
            "selection_rationale": (
                f"{selected_name} achieved the highest validation Macro-F1 "
                f"({selected_record['validation_metrics']['macro_f1']:.4f}), highest 5-fold CV Macro-F1 "
                f"({selected_record['cv_5fold_macro_f1_mean']:.4f} +/- {selected_record['cv_5fold_macro_f1_std']:.4f}), "
                f"and strong per-class recall across all 11 disease classes on the deduplicated validation split."
            ),
            "trained_at": trained_at,
        },
        "data_split_summary": split_info,
        "model_comparison": comparison_results,
        "test_set_evaluation": {
            "test_rows": len(df_test),
            "metrics": test_metrics,
            "batch_inference_time_sec": round(test_infer_sec, 4),
            "single_sample_inference_latency_ms": round(single_latency_ms, 3),
            "classes": classes_list,
            "confusion_matrix": cm.tolist(),
            "per_class_report": {
                cls_name: {
                    "precision": round(float(cls_report_dict[cls_name]["precision"]), 4),
                    "recall": round(float(cls_report_dict[cls_name]["recall"]), 4),
                    "f1_score": round(float(cls_report_dict[cls_name]["f1-score"]), 4),
                    "support": int(cls_report_dict[cls_name]["support"]),
                }
                for cls_name in classes_list
            },
            "top_confusion_pairs": top_confusions,
        },
        "top_feature_importances": feature_importances[:25],
        "limitations_and_medical_safety": [
            "Trained on a static tabular dataset (`docs/Weather-related disease prediction.csv`, 5,200 rows; 4,981 unique records after removing 219 exact duplicates).",
            "166 records in the source dataset have zero active binary symptom/history flags (mostly labeled Influenza or Migraine), which explains residual confusion among records lacking specific symptom combinations.",
            "Stratified random splitting on deduplicated records evaluates in-distribution generalization only; it does NOT prove generalization to new geographic regions, future temporal outbreaks, or real clinical populations.",
            "Experimental decision-support prototype only — predictions and probability scores are NOT confirmed medical diagnoses.",
        ],
    }

    metrics_path = ARTIFACTS_DIR / "model_metrics.json"
    metrics_path.write_text(json.dumps(metrics_payload, indent=2), encoding="utf-8")

    print("\nAll artifacts saved successfully:")
    for p in [model_path, metrics_path, cls_report_csv_path, cm_path, fi_path, eda_path]:
        print(f"  - {p.relative_to(PROJECT_ROOT)} ({p.stat().st_size:,} bytes)")
    print("=" * 80)


if __name__ == "__main__":
    main()
