import os
from fastapi.testclient import TestClient
from app.main import app

from app.config import settings

client = TestClient(app)

DOCS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs")


class TestPdfStatementImport:
    def test_missing_internal_key_rejected(self):
        bank_pdf = os.path.join(DOCS_DIR, "sample_bank_statement.pdf")
        with open(bank_pdf, "rb") as f:
            res = client.post(
                "/parse/pdf-statement",
                files={"file": ("statement.pdf", f, "application/pdf")},
            )
        assert res.status_code == 401

    def test_parse_sample_bank_statement(self):
        bank_pdf = os.path.join(DOCS_DIR, "sample_bank_statement.pdf")
        assert os.path.exists(bank_pdf), f"Sample bank statement missing at {bank_pdf}"

        with open(bank_pdf, "rb") as f:
            res = client.post(
                "/parse/pdf-statement",
                headers={"X-Internal-Key": settings.internal_api_key},
                files={"file": ("sample_bank_statement.pdf", f, "application/pdf")},
            )

        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["statementType"] == "bank_account_statement"
        assert data["validRows"] >= 14
        assert data["errorRows"] == 0

        # Check transaction schema completeness
        tx0 = data["transactions"][0]
        assert "date" in tx0
        assert "description" in tx0
        assert "amount" in tx0
        assert tx0["amount"] > 0
        assert tx0["direction"] in ["income", "expense"]
        assert "category" in tx0
        assert tx0["categorySource"] == "model"

        # Check specific entries
        salary_tx = next((t for t in data["transactions"] if "SALARY" in t["description"]), None)
        assert salary_tx is not None
        assert salary_tx["direction"] == "income"
        assert salary_tx["amount"] == 95000.0

        rent_tx = next((t for t in data["transactions"] if "RENT" in t["description"]), None)
        assert rent_tx is not None
        assert rent_tx["direction"] == "expense"
        assert rent_tx["amount"] == 22000.0

    def test_parse_sample_credit_card_statement(self):
        card_pdf = os.path.join(DOCS_DIR, "sample_credit_card_statement.pdf")
        assert os.path.exists(card_pdf), f"Sample credit card statement missing at {card_pdf}"

        with open(card_pdf, "rb") as f:
            res = client.post(
                "/parse/pdf-statement",
                headers={"X-Internal-Key": settings.internal_api_key},
                files={"file": ("sample_credit_card_statement.pdf", f, "application/pdf")},
            )

        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["statementType"] == "credit_card_statement"
        assert data["validRows"] >= 12

        # Check transactions
        zomato_tx = next((t for t in data["transactions"] if "ZOMATO" in t["description"]), None)
        assert zomato_tx is not None
        assert zomato_tx["direction"] == "expense"
        assert zomato_tx["amount"] == 620.0

        payment_tx = next((t for t in data["transactions"] if "PAYMENT RECEIVED" in t["description"]), None)
        assert payment_tx is not None
        assert payment_tx["direction"] == "income"
        assert payment_tx["amount"] == 25000.0

    def test_scanned_pdf_unsupported_error(self):
        scanned_pdf = os.path.join(DOCS_DIR, "sample_scanned_unsupported.pdf")
        assert os.path.exists(scanned_pdf), f"Scanned sample PDF missing at {scanned_pdf}"

        with open(scanned_pdf, "rb") as f:
            res = client.post(
                "/parse/pdf-statement",
                headers={"X-Internal-Key": settings.internal_api_key},
                files={"file": ("scanned_statement.pdf", f, "application/pdf")},
            )

        assert res.status_code == 422
        body = res.json()
        # Ensure clear error message
        err_msg = body.get("error", {}).get("message") or body.get("detail") or ""
        assert "scanned or image-only" in err_msg.lower()
        assert "ocr is not supported" in err_msg.lower()

    def test_invalid_extension_rejected(self):
        res = client.post(
            "/parse/pdf-statement",
            headers={"X-Internal-Key": settings.internal_api_key},
            files={"file": ("statement.txt", b"dummy text", "text/plain")},
        )
        assert res.status_code == 400
