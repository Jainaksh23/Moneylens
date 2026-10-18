import pytest

from app.schemas.categorize import TransactionPredictItem
from app.services.categorizer import CategorizerService


@pytest.fixture
def service():
    return CategorizerService.get_instance()


def test_model_loads_successfully(service):
    assert service.model is not None
    assert service.model_version.startswith("v1.")
    assert len(service.classes) == 14


def test_predict_batch_high_confidence(service):
    items = [
        TransactionPredictItem(id="tx-1", description="Swiggy food order dinner biryani", merchant="Swiggy"),
        TransactionPredictItem(id="tx-2", description="HDFC Bank home loan installment EMI", merchant="HDFC Home Loan"),
        TransactionPredictItem(id="tx-3", description="Infosys monthly salary credit", merchant="Infosys"),
    ]

    preds = service.predict_batch(items, confidence_threshold=0.55)
    assert len(preds) == 3

    assert preds[0].id == "tx-1"
    assert preds[0].category == "Food"
    assert preds[0].confidence >= 0.55
    assert preds[0].needsReview is False

    assert preds[1].id == "tx-2"
    assert preds[1].category == "EMI/Loans"
    assert preds[1].confidence >= 0.55
    assert preds[1].needsReview is False

    assert preds[2].id == "tx-3"
    assert preds[2].category == "Income"
    assert preds[2].confidence >= 0.55
    assert preds[2].needsReview is False


def test_predict_batch_low_confidence_gating(service):
    # Completely unfamiliar / ambiguous gibberish
    items = [
        TransactionPredictItem(id="tx-ambiguous", description="xyz random gibberish 9999", merchant="unknown")
    ]

    # With a high threshold (e.g. 0.99), unfamiliar items should get gated to unknown
    preds = service.predict_batch(items, confidence_threshold=0.99)
    assert len(preds) == 1
    assert preds[0].id == "tx-ambiguous"
    assert preds[0].category == "unknown"
    assert preds[0].needsReview is True


def test_empty_batch(service):
    preds = service.predict_batch([])
    assert preds == []
