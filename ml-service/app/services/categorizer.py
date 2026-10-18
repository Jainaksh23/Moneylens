import json
import logging
import os
from typing import List, Optional

import joblib
import numpy as np

from app.schemas.categorize import (
    TransactionPrediction,
    TransactionPredictItem,
)
from app.services.text_cleaning import build_feature_text

logger = logging.getLogger("moneylens.categorizer")


class CategorizerService:
    _instance: Optional["CategorizerService"] = None

    def __init__(self):
        self.model = None
        self.metadata = {}
        self.model_version = "v1.0.0-unloaded"
        self.default_threshold = 0.55
        self.classes = []
        self._load_model()

    @classmethod
    def get_instance(cls) -> "CategorizerService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_model(self):
        service_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        model_path = os.path.join(service_root, "models", "categorizer_latest.joblib")
        meta_path = os.path.join(service_root, "models", "model_metadata.json")

        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
                    self.model_version = self.metadata.get("modelVersion", "v1.0.0")
                    self.default_threshold = self.metadata.get("confidenceThreshold", 0.55)
                    self.classes = self.metadata.get("classes", [])
            except Exception as e:
                logger.warning(f"Could not load metadata from {meta_path}: {e}")

        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                logger.info(f"Loaded ML categorizer {self.model_version} from {model_path}")
            except Exception as e:
                logger.error(f"Failed to load ML model from {model_path}: {e}")
                self.model = None
        else:
            logger.warning(f"Model file not found at {model_path}. Categorizer operating in degraded mode.")

    def reload(self):
        """Reloads the active model from disk (e.g. after retraining)."""
        self._load_model()

    def predict_batch(
        self,
        items: List[TransactionPredictItem],
        confidence_threshold: Optional[float] = None,
    ) -> List[TransactionPrediction]:
        threshold = confidence_threshold if confidence_threshold is not None else self.default_threshold
        results: List[TransactionPrediction] = []

        if not items:
            return results

        # Fallback if model is not yet loaded
        if self.model is None:
            logger.warning("Categorizer model not loaded; returning unknown for batch.")
            for item in items:
                results.append(
                    TransactionPrediction(
                        id=item.id,
                        category="unknown",
                        confidence=0.0,
                        needsReview=True,
                        modelVersion=self.model_version,
                    )
                )
            return results

        # 1. Feature extraction
        features = [
            build_feature_text(item.description, item.merchant)
            for item in items
        ]

        # 2. Probability predictions
        try:
            probabilities = self.model.predict_proba(features)
            classes = self.model.classes_

            for idx, item in enumerate(items):
                probs = probabilities[idx]
                best_idx = int(np.argmax(probs))
                best_prob = float(probs[best_idx])
                best_class = str(classes[best_idx])

                # Low-confidence threshold gating
                if best_prob < threshold:
                    category = "unknown"
                    needs_review = True
                else:
                    category = best_class
                    needs_review = False

                results.append(
                    TransactionPrediction(
                        id=item.id,
                        category=category,
                        confidence=round(best_prob, 4),
                        needsReview=needs_review,
                        modelVersion=self.model_version,
                    )
                )

        except Exception as e:
            logger.error(f"Prediction failed on batch: {e}")
            for item in items:
                results.append(
                    TransactionPrediction(
                        id=item.id,
                        category="unknown",
                        confidence=0.0,
                        needsReview=True,
                        modelVersion=self.model_version,
                    )
                )

        return results
