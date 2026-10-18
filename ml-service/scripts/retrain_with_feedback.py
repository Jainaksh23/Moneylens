"""
MoneyLens ML Categorizer — Offline Feedback Retraining Pipeline
Accepts user correction feedback, validates data quality and volume,
merges with the baseline dataset, trains a candidate model, and validates it
against the current production model before deploying.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Any

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.services.text_cleaning import build_feature_text  # noqa: E402


def validate_feedback(feedback_records: List[Dict[str, Any]], valid_classes: List[str]) -> List[Dict[str, Any]]:
    """Filters out malformed feedback records and ensures categories belong to allowed classes."""
    valid_feedback = []
    for rec in feedback_records:
        desc = str(rec.get("description", "")).strip()
        cat = str(rec.get("category", "")).strip()
        if not desc or cat not in valid_classes:
            continue
        valid_feedback.append({
            "description": desc,
            "merchant": str(rec.get("merchant", "unknown")),
            "amount": float(rec.get("amount", 0.0)),
            "direction": str(rec.get("direction", "expense")),
            "category": cat,
        })
    return valid_feedback


def retrain_with_feedback(feedback_file: str, min_samples: int = 5, min_f1_threshold: float = 0.90):
    print("=" * 65)
    print("MONEYLENS ML CATEGORIZER — OFFLINE FEEDBACK RETRAINING")
    print("=" * 65)

    baseline_csv = os.path.join(PROJECT_ROOT, "data", "training_transactions.csv")
    meta_path = os.path.join(PROJECT_ROOT, "models", "model_metadata.json")
    models_dir = os.path.join(PROJECT_ROOT, "models")

    if not os.path.exists(meta_path):
        raise FileNotFoundError(f"Active model metadata not found at: {meta_path}")
    if not os.path.exists(feedback_file):
        raise FileNotFoundError(f"Feedback file not found at: {feedback_file}")

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    valid_classes = meta.get("classes", [])
    baseline_acc = meta.get("metrics", {}).get("testAccuracy", 0.95)

    # 1. Load feedback
    print(f"Loading user corrections feedback from: {feedback_file}")
    if feedback_file.endswith(".json"):
        with open(feedback_file, "r", encoding="utf-8") as f:
            raw_feedback = json.load(f)
            if isinstance(raw_feedback, dict) and "feedback" in raw_feedback:
                raw_feedback = raw_feedback["feedback"]
    else:
        raw_feedback = pd.read_csv(feedback_file).to_dict(orient="records")

    valid_feedback = validate_feedback(raw_feedback, valid_classes)
    print(f"Valid feedback samples: {len(valid_feedback)} (Minimum required: {min_samples})")

    if len(valid_feedback) < min_samples:
        print(f"[REJECTED] Insufficient validated feedback samples ({len(valid_feedback)} < {min_samples}). Retraining skipped.")
        return False

    # 2. Merge feedback with baseline data
    base_df = pd.read_csv(baseline_csv)
    feedback_df = pd.DataFrame(valid_feedback)
    merged_df = pd.concat([base_df, feedback_df], ignore_index=True)
    merged_df = merged_df.drop_duplicates(subset=["description", "merchant", "category"])

    print(f"Merged dataset size: {len(merged_df)} samples ({len(merged_df) - len(base_df)} net new).")

    # 3. Train candidate model on merged dataset
    features = [
        build_feature_text(str(r["description"]), str(r.get("merchant", "")))
        for _, r in merged_df.iterrows()
    ]
    labels = merged_df["category"].tolist()

    X_train, X_test, y_train, y_test = train_test_split(
        features, labels, test_size=0.20, random_state=42, stratify=labels
    )

    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import FeatureUnion, Pipeline

    candidate_pipeline = Pipeline([
        (
            "features",
            FeatureUnion([
                ("word_tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2)),
                ("char_tfidf", TfidfVectorizer(ngram_range=(3, 5), analyzer="char_wb", sublinear_tf=True, min_df=2)),
            ]),
        ),
        ("clf", LogisticRegression(C=2.0, max_iter=1000, class_weight="balanced", random_state=42)),
    ])

    print("Fitting candidate model with merged feedback...")
    candidate_pipeline.fit(X_train, y_train)

    y_pred = candidate_pipeline.predict(X_test)
    candidate_acc = accuracy_score(y_test, y_pred)
    candidate_macro_f1 = f1_score(y_test, y_pred, average="macro")

    print(f"Candidate Test Accuracy: {candidate_acc * 100:.2f}% (Baseline: {baseline_acc * 100:.2f}%)")
    print(f"Candidate Macro F1:      {candidate_macro_f1:.4f} (Threshold: {min_f1_threshold:.4f})")

    # 4. Strict safety validation before model replacement
    if candidate_acc < (baseline_acc - 0.05) or candidate_macro_f1 < min_f1_threshold:
        print("[REJECTED] Candidate model failed safety validation. Active model remains unchanged.")
        return False

    # 5. Safe replacement and version increment
    prev_ver = meta.get("modelVersion", "v1.0.0")
    ver_parts = prev_ver.lstrip("v").split(".")
    patch_ver = int(ver_parts[-1]) + 1
    new_version = f"v{ver_parts[0]}.{ver_parts[1]}.{patch_ver}"

    new_artifact_name = f"categorizer_{new_version}.joblib"
    new_artifact_path = os.path.join(models_dir, new_artifact_name)
    latest_path = os.path.join(models_dir, "categorizer_latest.joblib")

    joblib.dump(candidate_pipeline, new_artifact_path)
    joblib.dump(candidate_pipeline, latest_path)

    # Update metadata
    meta["modelVersion"] = new_version
    meta["artifactFile"] = new_artifact_name
    meta["trainingDate"] = datetime.now(timezone.utc).isoformat()
    meta["datasetSize"] = len(merged_df)
    meta["metrics"]["testAccuracy"] = round(float(candidate_acc), 4)
    meta["feedbackIntegratedCount"] = len(valid_feedback)

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    # Save merged data as updated baseline
    merged_df.to_csv(baseline_csv, index=False)

    print(f"[SUCCESS] Successfully promoted candidate model to {new_version}!")
    print(f"[SUCCESS] Artifact saved to: {new_artifact_path}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Retrain MoneyLens categorizer with user feedback")
    parser.add_argument("--feedback-file", type=str, required=True, help="Path to feedback JSON or CSV file")
    parser.add_argument("--min-samples", type=int, default=5, help="Minimum feedback samples required")
    parser.add_argument("--threshold", type=float, default=0.90, help="Minimum Macro F1 threshold")
    args = parser.parse_args()

    retrain_with_feedback(args.feedback_file, min_samples=args.min_samples, min_f1_threshold=args.threshold)
