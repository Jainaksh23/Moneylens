"""
MoneyLens ML Categorizer — Training Pipeline
Extracts TF-IDF features (word + char n-grams) and trains a balanced Logistic Regression classifier.
Saves model artifact with version string, classes, and metadata.
"""
import json
import os
import sys
from datetime import datetime, timezone
from typing import List

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

# Add project root to sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.services.text_cleaning import build_feature_text  # noqa: E402

MODEL_VERSION = "v1.0.0"
CONFIDENCE_THRESHOLD = 0.55


def train_categorizer():
    data_path = os.path.join(PROJECT_ROOT, "data", "training_transactions.csv")
    models_dir = os.path.join(PROJECT_ROOT, "models")
    os.makedirs(models_dir, exist_ok=True)

    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Training dataset not found at: {data_path}. Run generate_training_data.py first.")

    print(f"Loading training data from: {data_path}")
    df = pd.read_csv(data_path)
    print(f"Dataset loaded: {len(df)} transactions across {df['category'].nunique()} categories.")

    # 1. Feature preparation & cleaning
    print("Normalizing and cleaning transaction narratives...")
    features: List[str] = [
        build_feature_text(str(row["description"]), str(row.get("merchant", "")))
        for _, row in df.iterrows()
    ]
    labels = df["category"].tolist()

    # 2. Stratified train/test split (80% train, 20% test)
    X_train, X_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.20,
        random_state=42,
        stratify=labels,
    )
    print(f"Split: {len(X_train)} train samples, {len(X_test)} test samples.")

    # 3. Model architecture: Word TF-IDF + Character n-grams + Logistic Regression
    print("Building FeatureUnion (Word [1, 2] + Char [3, 5] n-grams) and Classifier...")
    vectorizer = FeatureUnion([
        (
            "word_tfidf",
            TfidfVectorizer(
                ngram_range=(1, 2),
                sublinear_tf=True,
                min_df=2,
            ),
        ),
        (
            "char_tfidf",
            TfidfVectorizer(
                ngram_range=(3, 5),
                analyzer="char_wb",
                sublinear_tf=True,
                min_df=2,
            ),
        ),
    ])

    classifier = LogisticRegression(
        C=2.0,
        max_iter=1000,
        class_weight="balanced",
        random_state=42,
    )

    pipeline = Pipeline([
        ("features", vectorizer),
        ("clf", classifier),
    ])

    # 4. Train pipeline
    print("Training Logistic Regression pipeline...")
    pipeline.fit(X_train, y_train)

    # 5. Evaluate training and validation performance
    y_train_pred = pipeline.predict(X_train)
    y_test_pred = pipeline.predict(X_test)

    train_acc = accuracy_score(y_train, y_train_pred)
    test_acc = accuracy_score(y_test, y_test_pred)

    print(f"Train Accuracy: {train_acc * 100:.2f}%")
    print(f"Test Accuracy:  {test_acc * 100:.2f}%")

    print("\n--- Test Set Classification Report ---")
    print(classification_report(y_test, y_test_pred, digits=3))

    # 6. Save model artifact
    artifact_filename = f"categorizer_{MODEL_VERSION}.joblib"
    artifact_path = os.path.join(models_dir, artifact_filename)
    joblib.dump(pipeline, artifact_path)
    print(f"[SUCCESS] Saved model artifact to: {artifact_path}")

    # Also save as categorizer_latest.joblib for default runtime loading
    latest_path = os.path.join(models_dir, "categorizer_latest.joblib")
    joblib.dump(pipeline, latest_path)

    # 7. Save metadata
    unique_classes = sorted(list(set(labels)))
    metadata = {
        "modelVersion": MODEL_VERSION,
        "artifactFile": artifact_filename,
        "trainingDate": datetime.now(timezone.utc).isoformat(),
        "datasetSize": len(df),
        "trainSize": len(X_train),
        "testSize": len(X_test),
        "classes": unique_classes,
        "confidenceThreshold": CONFIDENCE_THRESHOLD,
        "metrics": {
            "trainAccuracy": round(float(train_acc), 4),
            "testAccuracy": round(float(test_acc), 4),
        },
        "hyperparameters": {
            "C": 2.0,
            "max_iter": 1000,
            "class_weight": "balanced",
            "word_ngrams": [1, 2],
            "char_ngrams": [3, 5],
        },
    }

    meta_path = os.path.join(models_dir, "model_metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"[SUCCESS] Saved model metadata to: {meta_path}")

    return metadata


if __name__ == "__main__":
    train_categorizer()
